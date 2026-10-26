// Coach Daddy: AI snowboard-buddy. Deze Edge Function houdt de Anthropic API-key geheim,
// checkt of je ingelogd bent, bewaakt een daglimiet en streamt het antwoord terug als tekst.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SYSTEM_PROMPT } from './prompt.ts'

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
  let body: { messages?: ChatMessage[]; context?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Ongeldige JSON' })
  }
  const messages = (body.messages ?? []).filter(
    (m): m is ChatMessage =>
      (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0,
  )
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json(400, { error: 'Geen vraag gevonden' })
  if (messages.length > MAX_MESSAGES) return json(400, { error: 'Gesprek te lang, begin een nieuw gesprek' })
  if (messages.some((m) => m.content.length > MAX_CHARS)) return json(400, { error: 'Bericht te lang' })
  const context = (body.context ?? '').slice(0, 12000)

  // 3. Daglimiet (beschermt je API-budget)
  const today = new Date().toISOString().slice(0, 10)
  const { data: usage } = await admin.from('coach_usage').select('messages').eq('user_id', user.id).eq('day', today).maybeSingle()
  if ((usage?.messages ?? 0) >= DAILY_LIMIT) {
    return json(429, { error: `Daglimiet van ${DAILY_LIMIT} berichten bereikt. Morgen weer!` })
  }

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
        await admin.from('coach_usage').upsert({
          user_id: user.id,
          day: today,
          messages: (usage?.messages ?? 0) + 1,
          input_tokens: final.usage.input_tokens + (final.usage.cache_read_input_tokens ?? 0),
          output_tokens: final.usage.output_tokens,
        })
      } catch (e) {
        console.error(e)
        const msg =
          e instanceof Anthropic.RateLimitError
            ? 'Coach is even overbelast, probeer het zo nog eens.'
            : e instanceof Anthropic.APIError
              ? `Coach heeft een probleem (${e.status}).`
              : 'Coach is even weg, probeer het zo nog eens.'
        controller.enqueue(encoder.encode(`\n\n⚠️ ${msg}`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(out, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
})
