// Coach Daddy: AI snowboard-buddy. Deze Edge Function houdt de Anthropic API-key geheim,
// checkt of je ingelogd bent, bewaakt een daglimiet en streamt het antwoord terug als tekst.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { REVIEW_INSTRUCTIONS, SYSTEM_PROMPT } from './prompt.ts'

const MODEL = 'claude-opus-5-5'
const DAILY_LIMIT = Number(Deno.env.get('COACH_DAILY_LIMIT') ?? '60')
const MAX_MESSAGES = 40
const MAX_CHARS = 4000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Alleen POST' })

  // 1. Wie ben je?
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return json(401, { error: 'Log eerst in' })
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) return json(401, { error: 'Log eerst in' })

  // 2. Input checken
  let body: { mode?: string; messages?: ChatMessage[]; context?: string; day?: string; trickIds?: string[] }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Ongeldige JSON' })
  }
  const today = new Date().toISOString().slice(0, 10)
  const { data: usage } = await admin.from('coach_usage').select('messages').eq('user_id', user.id).eq('day', today).maybeSingle()
  if ((usage?.messages ?? 0) >= DAILY_LIMIT) {
    return json(429, { error: `Daglimiet van ${DAILY_LIMIT} berichten bereikt. Morgen weer!` })
  }
  const countUsage = (u: Anthropic.Beta.BetaUsage) =>
    admin.from('coach_usage').upsert({
      user_id: user.id,
      day: today,
      messages: (usage?.messages ?? 0) + 1,
      input_tokens: u.input_tokens + (u.cache_read_input_tokens ?? 0),
      output_tokens: u.output_tokens,
    })

  if (body.mode === 'review') return review(body, countUsage)

  const messages = (body.messages ?? []).filter(
    (m): m is ChatMessage =>
      (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0,
  )
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json(400, { error: 'Geen vraag gevonden' })
  if (messages.length > MAX_MESSAGES) return json(400, { error: 'Gesprek te lang, begin een nieuw gesprek' })
  if (messages.some((m) => m.content.length > MAX_CHARS)) return json(400, { error: 'Bericht te lang' })
  const context = (body.context ?? '').slice(0, 12000)

  // 4. Gesprek opbouwen. Rider-context zit vast in het eerste bericht zodat de prompt-cache blijft werken.
  const apiMessages: Anthropic.Beta.BetaMessageParam[] = messages.map((m, i) => {
    if (i === 0 && m.role === 'user' && context) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: `<rider_context>\n${context}\n</rider_context>` },
          { type: 'text', text: m.content },
        ],
      }
    }
    return { role: m.role, content: m.content }
  })

  const stream = anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    cache_control: { type: 'ephemeral' },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: apiMessages,
  })

  const encoder = new TextEncoder()
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        const final = await stream.finalMessage()
        if (final.stop_reason === 'refusal') {
          controller.enqueue(encoder.encode('\n\nHier kan ik je helaas niet mee helpen. Probeer het anders te vragen.'))
        }
        await countUsage(final.usage)
      } catch (e) {
        console.error(e)
        const msg =
          e instanceof Anthropic.RateLimitError
            ? 'Coach is even overbelast, probeer het zo nog eens.'
            : e instanceof Anthropic.APIError
              ? `Coach heeft een probleem (${e.status}).`
              : 'Coach is even weg, probeer het zo nog eens.'
        controller.enqueue(encoder.encode(`\n\nLet op: ${msg}`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(out, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
})

// ── Dagreview: één gestructureerd antwoord, zodat de app de voorgestelde trick als doel kan zetten ──

const TRICK_ID = /^[a-z0-9-]{1,40}$/

async function review(
  body: { context?: string; day?: string; trickIds?: string[] },
  countUsage: (u: Anthropic.Beta.BetaUsage) => unknown,
): Promise<Response> {
  const day = (body.day ?? '').slice(0, 4000)
  if (!day.trim()) return json(400, { error: 'Geen dag meegestuurd' })
  const context = (body.context ?? '').slice(0, 12000)
  // alleen tricks uit de bijbel: de coach kan geen trick verzinnen die de app niet kent
  const trickIds = [...new Set((body.trickIds ?? []).filter((t) => typeof t === 'string' && TRICK_ID.test(t)))].slice(0, 150)

  const schema = {
    type: 'object',
    properties: {
      goed: { type: 'string', description: 'Wat ging er goed deze dag. 1-2 zinnen, concreet, verwijs naar wat er gelogd is.' },
      focus: { type: 'string', description: 'Eén focuspunt voor de volgende keer. Eén zin.' },
      oefening: { type: 'string', description: 'Hoe je dat focuspunt oefent op de piste. 1-3 zinnen, stap voor stap.' },
      trickId: trickIds.length
        ? {
            anyOf: [{ type: 'string', enum: trickIds }, { type: 'null' }],
            description: 'De trick uit de bijbel die het beste past als volgende stap, of null.',
          }
        : { type: 'null' },
      veiligheid: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'Alleen bij pijn, een blessure of opvallend veel vallen: een korte, nuchtere tip. Anders null.',
      },
    },
    required: ['goed', 'focus', 'oefening', 'trickId', 'veiligheid'],
    additionalProperties: false,
  }

  try {
    const res = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `<rider_context>\n${context}\n</rider_context>` },
            { type: 'text', text: `${REVIEW_INSTRUCTIONS}\n\n<dag>\n${day}\n</dag>` },
          ],
        },
      ],
    })
    await countUsage(res.usage)
    if (res.stop_reason === 'refusal') return json(422, { error: 'Coach kan deze dag niet reviewen. Probeer het later nog eens.' })
    if (res.stop_reason === 'max_tokens') return json(502, { error: 'Coach raakte de draad kwijt. Probeer het nog eens.' })
    const text = res.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return json(502, { error: 'Coach gaf geen review terug.' })
    const parsed = JSON.parse(text.text)
    if (parsed.trickId && !trickIds.includes(parsed.trickId)) parsed.trickId = null
    return json(200, parsed)
  } catch (e) {
    console.error(e)
    if (e instanceof Anthropic.RateLimitError) return json(503, { error: 'Coach is even overbelast, probeer het zo nog eens.' })
    if (e instanceof Anthropic.APIError) return json(502, { error: `Coach heeft een probleem (${e.status}).` })
    return json(500, { error: 'Coach is even weg, probeer het zo nog eens.' })
  }
}
