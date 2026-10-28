// Coach Daddy: AI snowboard-buddy. Deze Edge Function houdt de Anthropic API-key geheim,
// checkt of je ingelogd bent, bewaakt een daglimiet en streamt het antwoord terug als NDJSON:
// tekst, plus knoppen (doel, trick, oefenplan, geheugen) die de coach via tools voorstelt.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { REVIEW_INSTRUCTIONS, SYSTEM_PROMPT } from './prompt.ts'
import {
  LIMITS,
  STREAM_TYPE,
  apiErrorText,
  buildMessages,
  buildTools,
  checkAction,
  checkMessages,
  checkTricks,
  effortFor,
  encodeEvent,
  toolResult,
  type CoachEvent,
} from './protocol.ts'

const MODEL = 'claude-opus-5-5'
const DAILY_LIMIT = Number(Deno.env.get('COACH_DAILY_LIMIT') ?? '60')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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
  let body: { mode?: string; messages?: unknown; context?: string; day?: string; trickIds?: string[]; tricks?: unknown }
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
  const countUsage = (u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }) =>
    admin.from('coach_usage').upsert({
      user_id: user.id,
      day: today,
      messages: (usage?.messages ?? 0) + 1,
      input_tokens: u.input_tokens + (u.cache_read_input_tokens ?? 0),
      output_tokens: u.output_tokens,
    })

  if (body.mode === 'review') return review(body, countUsage)

  const tricks = checkTricks(body.tricks)
  const trickIds = tricks.map((t) => t.id)
  const checked = checkMessages(body.messages, trickIds)
  if ('error' in checked) return json(400, { error: checked.error })
  const context = (body.context ?? '').slice(0, LIMITS.context)

  // 3. Gesprek opbouwen. Tools en systeemprompt zijn per app-versie gelijk, dus die blijven in de cache.
  const tools = buildTools(tricks) as unknown as Anthropic.Beta.BetaToolUnion[]
  const messages = buildMessages(checked.messages, context) as unknown as Anthropic.Beta.BetaMessageParam[]
  const effort = effortFor(checked.messages)

  const encoder = new TextEncoder()
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: CoachEvent) => controller.enqueue(encoder.encode(encodeEvent(e)))
      const total = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }
      let wrote = false
      try {
        // De coach mag tekst schrijven, knoppen voorstellen en daarna verder schrijven. De knoppen doen
        // hier niets: de app laat ze zien en de rider beslist. Max een paar rondes per vraag.
        for (let round = 0; round < LIMITS.rounds; round++) {
          const stream = anthropic.beta.messages.stream({
            model: MODEL,
            max_tokens: 8000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort },
            cache_control: { type: 'ephemeral' },
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            tools,
            tool_choice: { type: 'auto' },
            messages,
          })
          let fresh = true
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              // nieuwe ronde na een knop: nieuwe alinea
              send({ t: 'text', v: (fresh && wrote ? '\n\n' : '') + event.delta.text })
              fresh = false
              wrote = true
            }
          }
          const final = await stream.finalMessage()
          total.input_tokens += final.usage.input_tokens
          total.output_tokens += final.usage.output_tokens
          total.cache_read_input_tokens += final.usage.cache_read_input_tokens ?? 0

          if (final.stop_reason === 'refusal') {
            send({ t: 'text', v: '\n\nHier kan ik je helaas niet mee helpen. Probeer het anders te vragen.' })
            break
          }
          const uses = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
          // afgekapt midden in een tool: niet uitvoeren
          if (final.stop_reason !== 'tool_use' || !uses.length) {
            if (final.stop_reason === 'max_tokens') send({ t: 'text', v: '\n\n(Antwoord werd te lang en is afgekapt.)' })
            break
          }
          const results = uses.map((u) => {
            const action = checkAction(u.name, u.input, trickIds)
            if (action) send({ t: 'action', action })
            return {
              type: 'tool_result' as const,
              tool_use_id: u.id,
              content: action ? toolResult(action) : 'Deze input klopt niet; er is niets getoond.',
              is_error: !action,
            }
          })
          messages.push({ role: 'assistant', content: final.content }, { role: 'user', content: results })
        }
        await countUsage(total)
        send({ t: 'done' })
      } catch (e) {
        console.error(e)
        send({
          t: 'error',
          v: e instanceof Anthropic.APIError ? apiErrorText(e.status, e.error) : 'Coach is even weg, probeer het zo nog eens.',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(out, { headers: { ...cors, 'Content-Type': STREAM_TYPE, 'Cache-Control': 'no-cache' } })
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
    if (e instanceof Anthropic.APIError)
      return json(e instanceof Anthropic.RateLimitError ? 503 : 502, { error: apiErrorText(e.status, e.error) })
    return json(500, { error: 'Coach is even weg, probeer het zo nog eens.' })
  }
}
