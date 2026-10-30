// Gedeelde, pure logica van Coach Daddy: de knoppen (tools) die de coach kan voorstellen, het checken van
// wat de app meestuurt, het opbouwen van het gesprek voor de API en het streamformaat terug naar de app.
// Geen imports: de Edge Function (Deno), de app en de tests (vitest) laden allemaal dit bestand.

/** Content-type van de stream: één JSON-event per regel. */
export const STREAM_TYPE = 'application/x-ndjson'

export const LIMITS = {
  messages: 40,
  chars: 4000,
  context: 16000,
  /** zoveel foto's gaan per vraag mee naar de API; oudere worden een tekstregel */
  images: 2,
  /** base64-tekens per foto (±1,1 MB aan bytes); de app stuurt ±150 KB */
  imageChars: 1_500_000,
  tricks: 300,
  /** rondes van tekst → knoppen → tekst per vraag */
  rounds: 4,
} as const

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp'
export interface CoachImage {
  mediaType: ImageType
  /** base64 zonder data:-prefix */
  data: string
}

export interface PlanDay {
  dag: string
  focus: string
  oefeningen: string[]
}

/** Iets wat de coach in de app laat zien naast zijn tekst. */
export type CoachAction =
  | { kind: 'doel'; titel: string; trickId: string | null }
  | { kind: 'trick'; trickId: string }
  | { kind: 'onthoud'; feit: string }
  | { kind: 'plan'; titel: string; dagen: PlanDay[] }

export interface WireMessage {
  role: 'user' | 'assistant'
  content: string
  image?: CoachImage
  actions?: CoachAction[]
}

export interface TrickRef {
  id: string
  name: string
}

export type CoachEvent = { t: 'text'; v: string } | { t: 'action'; action: CoachAction } | { t: 'error'; v: string } | { t: 'done' }

export const encodeEvent = (e: CoachEvent) => JSON.stringify(e) + '\n'

/** Leest events uit een NDJSON-buffer. Geeft de events terug en de onafgemaakte rest. */
export function decodeEvents(buffer: string): { events: CoachEvent[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const events: CoachEvent[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const e = JSON.parse(line) as CoachEvent
      if (e && typeof e === 'object' && typeof e.t === 'string') events.push(e)
    } catch {
      /* kapotte regel overslaan */
    }
  }
  return { events, rest }
}

// ── Knoppen ─────────────────────────────────────────────────────────────────

const TRICK_ID = /^[a-z0-9-]{1,40}$/

const text = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/**
 * De tools die de coach kan gebruiken. Ze doen niets op de server: de app laat een knop of kaart zien
 * en de rider beslist. `strict` zodat de input altijd klopt met het schema (geforceerd tool-gebruik kan
 * niet met thinking, dus `tool_choice` blijft auto). Geen eager input streaming: de inputs zijn klein
 * en zo blijft de schema-garantie van strict staan.
 */
export function buildTools(tricks: TrickRef[]) {
  const ids = tricks.map((t) => t.id)
  const catalog = tricks.map((t) => `${t.id} = ${t.name}`).join('; ')
  const tools: Record<string, unknown>[] = [
    {
      name: 'onthoud',
      description:
        'Sla een blijvend feit over de rider op in het geheugen van de app, zodat je het in volgende gesprekken weet. ' +
        'Alleen voor dingen die later nog uitmaken en niet al in <rider_context> staan: stance-gevoel, een blessure, waar iemand bang voor is, ' +
        'een seizoensdoel, welk board. De rider ziet het en kan het wissen. Eén korte zin, in de derde persoon.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { feit: { type: 'string', description: 'Bijv. "Heeft last van zijn linkerpols sinds januari."' } },
        required: ['feit'],
        additionalProperties: false,
      },
    },
  ]
  if (!ids.length) return tools
  const trickId = { type: 'string', enum: ids }
  tools.push(
    {
      name: 'zet_doel',
      description:
        'Stel een concreet, haalbaar doel voor. De app toont een knop "Zet als doel"; de rider beslist zelf. ' +
        'Gebruik dit hooguit één of twee keer per antwoord, alleen als je echt een volgende stap voorstelt.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          titel: { type: 'string', description: 'Kort, max 60 tekens. Bijv. "Ollie landen op een blauwe piste".' },
          trickId: { anyOf: [trickId, { type: 'null' }], description: 'De trick uit de bijbel waar het doel over gaat, of null.' },
        },
        required: ['titel', 'trickId'],
        additionalProperties: false,
      },
    },
    {
      name: 'toon_trick',
      description:
        'Laat een knop zien naar de trick in de trick-bijbel, met de 3D-animatie, stappen en veelgemaakte fouten. ' +
        `Gebruik dit als zien hoe het moet helpt. Tricks in de bijbel (id = naam): ${catalog}.`,
      strict: true,
      input_schema: {
        type: 'object',
        properties: { trickId },
        required: ['trickId'],
        additionalProperties: false,
      },
    },
    {
      name: 'oefenplan',
      description:
        'Geef een oefenplan per dag als kaart in de app, met een knop om elke dag als doel op te slaan. Gebruik dit als iemand om een plan vraagt. ' +
        'Zet het plan hier in en niet nog eens als lange tekst; schrijf er in je antwoord alleen een korte intro bij. Max 10 dagen, max 4 oefeningen per dag.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          titel: { type: 'string', description: 'Bijv. "Plan voor Tignes"' },
          dagen: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                dag: { type: 'string', description: 'Bijv. "Dag 1" of "Zaterdag"' },
                focus: { type: 'string', description: 'Waar deze dag om draait, één zin.' },
                oefeningen: { type: 'array', items: { type: 'string' }, description: 'Concrete drills, kort.' },
              },
              required: ['dag', 'focus', 'oefeningen'],
              additionalProperties: false,
            },
          },
        },
        required: ['titel', 'dagen'],
        additionalProperties: false,
      },
    },
  )
  return tools
}

/** Checkt en normaliseert de input van een tool tot een actie voor de app, of null als hij niet klopt. */
export function checkAction(name: string, input: unknown, trickIds: readonly string[]): CoachAction | null {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const isTrick = (v: unknown): v is string => typeof v === 'string' && trickIds.includes(v)
  switch (name) {
    case 'zet_doel': {
      const titel = text(i.titel, 80)
      if (!titel) return null
      return { kind: 'doel', titel, trickId: isTrick(i.trickId) ? i.trickId : null }
    }
    case 'toon_trick':
      return isTrick(i.trickId) ? { kind: 'trick', trickId: i.trickId } : null
    case 'onthoud': {
      const feit = text(i.feit, 200)
      return feit ? { kind: 'onthoud', feit } : null
    }
    case 'oefenplan': {
      const titel = text(i.titel, 80) || 'Oefenplan'
      const dagen = (Array.isArray(i.dagen) ? i.dagen : [])
        .map((d) => {
          const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
          return {
            dag: text(o.dag, 30),
            focus: text(o.focus, 160),
            oefeningen: (Array.isArray(o.oefeningen) ? o.oefeningen : [])
              .slice(0, 4)
              .map((x) => text(x, 160))
              .filter(Boolean),
          }
        })
        .filter((d) => d.dag && d.focus)
        .slice(0, 10)
      return dagen.length ? { kind: 'plan', titel, dagen } : null
    }
    default:
      return null
  }
}

/** Wat de coach terugkrijgt nadat een knop getoond is. */
export function toolResult(a: CoachAction): string {
  switch (a.kind) {
    case 'doel':
      return 'De knop "Zet als doel" staat onder je antwoord. De rider beslist zelf.'
    case 'trick':
      return 'De knop naar de trick-bijbel staat onder je antwoord.'
    case 'onthoud':
      return 'Opgeslagen in het geheugen van de app. De rider ziet het en kan het wissen.'
    case 'plan':
      return 'Het plan staat als kaart onder je antwoord, met een knop om het als doelen op te slaan. Herhaal het niet in je tekst.'
  }
}

/** Terug naar de tool-aanroep, om eerdere knoppen in het gesprek mee te sturen. */
export function actionToTool(a: CoachAction): { name: string; input: Record<string, unknown> } {
  switch (a.kind) {
    default:
      return { name: '', input: {} }
    case 'doel':
      return { name: 'zet_doel', input: { titel: a.titel, trickId: a.trickId } }
    case 'trick':
      return { name: 'toon_trick', input: { trickId: a.trickId } }
    case 'onthoud':
      return { name: 'onthoud', input: { feit: a.feit } }
    case 'plan':
      return { name: 'oefenplan', input: { titel: a.titel, dagen: a.dagen } }
  }
}

// ── Input van de app checken ─────────────────────────────────────────────────

const IMAGE_TYPES: ImageType[] = ['image/jpeg', 'image/png', 'image/webp']
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

export function checkImage(raw: unknown): CoachImage | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mediaType = r.mediaType as ImageType
  const data = r.data
  if (!IMAGE_TYPES.includes(mediaType) || typeof data !== 'string') return null
  if (data.length < 100 || data.length > LIMITS.imageChars || data.length % 4 !== 0 || !B64.test(data)) return null
  return { mediaType, data }
}

export function checkTricks(raw: unknown): TrickRef[] {
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : [])
    .filter((t): t is TrickRef => !!t && TRICK_ID.test(t.id) && typeof t.name === 'string')
    .filter((t) => !seen.has(t.id) && !!seen.add(t.id))
    .slice(0, LIMITS.tricks)
    .map((t) => ({ id: t.id, name: text(t.name, 60) }))
}

/** Checkt het gesprek dat de app meestuurt. */
export function checkMessages(raw: unknown, trickIds: readonly string[]): { messages: WireMessage[] } | { error: string } {
  const list = Array.isArray(raw) ? raw : []
  const messages: WireMessage[] = []
  for (const m of list) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue
    if (m.content.length > LIMITS.chars) return { error: 'Bericht te lang' }
    const out: WireMessage = { role: m.role, content: m.content.trim() }
    if (m.role === 'user' && m.image != null) {
      const img = checkImage(m.image)
      if (!img) return { error: 'Foto kon niet gelezen worden. Probeer een andere.' }
      out.image = img
    }
    if (m.role === 'assistant' && Array.isArray(m.actions)) {
      const acts = m.actions
        .map((a: CoachAction) => {
          if (!a || typeof a !== 'object') return null
          const { name, input } = actionToTool(a)
          return checkAction(name, input, trickIds)
        })
        .filter((a: CoachAction | null): a is CoachAction => !!a)
      if (acts.length) out.actions = acts
    }
    if (out.content || out.image || out.actions) messages.push(out)
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') return { error: 'Geen vraag gevonden' }
  if (messages.length > LIMITS.messages) return { error: 'Gesprek te lang, begin een nieuw gesprek' }
  return { messages }
}

// ── Gesprek voor de API ──────────────────────────────────────────────────────

type Block = Record<string, unknown>
export interface ApiMessage {
  role: 'user' | 'assistant'
  content: Block[]
}

/**
 * Bouwt de berichten voor de API. De rider-context staat vast in het eerste bericht (zo blijft de cache werken),
 * alleen de laatste foto's gaan mee, en eerdere knoppen worden weer echte tool-aanroepen met hun resultaat.
 */
export function buildMessages(messages: WireMessage[], context: string): ApiMessage[] {
  const imageIdx = messages.flatMap((m, i) => (m.image ? [i] : []))
  const keep = new Set(imageIdx.slice(-LIMITS.images))
  const out: ApiMessage[] = []
  let pending: Block[] = []
  messages.forEach((m, i) => {
    if (m.role === 'assistant') {
      const content: Block[] = m.content ? [{ type: 'text', text: m.content }] : []
      for (const [j, a] of (m.actions ?? []).entries()) {
        const id = `toolu_h${i}_${j}`
        const { name, input } = actionToTool(a)
        content.push({ type: 'tool_use', id, name, input })
        pending.push({ type: 'tool_result', tool_use_id: id, content: toolResult(a) })
      }
      if (content.length) out.push({ role: 'assistant', content })
      return
    }
    const content: Block[] = pending
    pending = []
    if (!out.length && context) content.push({ type: 'text', text: `<rider_context>\n${context}\n</rider_context>` })
    if (m.image) {
      content.push(
        keep.has(i)
          ? { type: 'image', source: { type: 'base64', media_type: m.image.mediaType, data: m.image.data } }
          : { type: 'text', text: '(Hier stond een foto die al besproken is; die gaat niet meer mee.)' },
      )
    }
    content.push({ type: 'text', text: m.content || 'Wat zie je op deze foto?' })
    out.push({ role: 'user', content })
  })
  return out
}

/** Meer denkwerk als er naar een foto gekeken moet worden. */
export const effortFor = (messages: WireMessage[]) => (messages.some((m) => m.image) ? 'medium' : 'low')

/**
 * Leesbare melding bij een fout van de Claude API. `body` is de geparste foutbody
 * ({ error: { type, message } }). Tegoed op en een kapotte key krijgen een eigen uitleg,
 * anders gaat de reden van de API kort mee, zodat je ziet wat er mis is.
 */
export function apiErrorText(status: number | undefined, body: unknown): string {
  const err = (body as { error?: { type?: string; message?: string } } | null)?.error
  const msg = typeof err?.message === 'string' ? err.message.replace(/\s+/g, ' ').trim() : ''
  if (/credit balance/i.test(msg)) return 'Het Anthropic-tegoed van de coach is op. Vul het aan in de Anthropic Console.'
  if (status === 401) return 'De Anthropic API-key van de coach klopt niet of is verlopen.'
  if (status === 429) return 'Coach is even overbelast, probeer het zo nog eens.'
  if (status === 529 || err?.type === 'overloaded_error') return 'Claude is even overbelast, probeer het zo nog eens.'
  return `Coach heeft een probleem (${status ?? '?'})${msg ? `: ${msg.slice(0, 160)}` : '.'}`
}

// ── Drill van de dag ────────────────────────────────────────────────────────

/** Eén oefening voor vandaag, gekozen uit je laatste dagen en doelen. */
export interface Drill {
  titel: string
  waarom: string
  stappen: string[]
  minuten: number
  trickId: string | null
}

/** Alleen geldige trick-ids, uniek en begrensd (de coach kiest alleen uit tricks die de app kent). */
export function checkTrickIds(raw: unknown, max = 150): string[] {
  return [...new Set((Array.isArray(raw) ? raw : []).filter((t): t is string => typeof t === 'string' && TRICK_ID.test(t)))].slice(0, max)
}

export function drillSchema(trickIds: readonly string[]) {
  return {
    type: 'object',
    properties: {
      titel: { type: 'string', description: 'Naam van de oefening, max 6 woorden.' },
      waarom: { type: 'string', description: 'Waarom juist deze oefening nu, met verwijzing naar het logboek of de doelen. 1-2 zinnen.' },
      stappen: { type: 'array', items: { type: 'string' }, description: '2-4 korte stappen, elk één zin.' },
      minuten: { type: 'integer', description: 'Hoeveel minuten ongeveer, 5-45.' },
      trickId: trickIds.length
        ? {
            anyOf: [{ type: 'string', enum: [...trickIds] }, { type: 'null' }],
            description: 'De trick uit de bijbel waar dit bij hoort, of null.',
          }
        : { type: 'null' },
    },
    required: ['titel', 'waarom', 'stappen', 'minuten', 'trickId'],
    additionalProperties: false,
  }
}

/** Checkt en begrenst het antwoord van de coach; null als het niet bruikbaar is. */
export function checkDrill(raw: unknown, trickIds: readonly string[]): Drill | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const titel = text(r.titel, 60)
  const stappen = (Array.isArray(r.stappen) ? r.stappen : [])
    .map((s) => text(s, 200))
    .filter(Boolean)
    .slice(0, 4)
  if (!titel || !stappen.length) return null
  const min = Math.round(Number(r.minuten))
  return {
    titel,
    waarom: text(r.waarom, 300),
    stappen,
    minuten: Number.isFinite(min) ? Math.max(5, Math.min(45, min)) : 15,
    trickId: typeof r.trickId === 'string' && trickIds.includes(r.trickId) ? r.trickId : null,
  }
}

// ── Voor en na: twee frames van dezelfde trick vergelijken ──────────────────

export interface Comparison {
  beter: string
  nogWerk: string
  drill: string
}

export const COMPARE_SCHEMA = {
  type: 'object',
  properties: {
    beter: {
      type: 'string',
      description: 'Wat er zichtbaar beter is in "nu" dan in "toen". 1-3 zinnen, concreet (knieën, schouders, gewicht, edge).',
    },
    nogWerk: { type: 'string', description: 'Het ene punt dat nog het meeste oplevert. 1-2 zinnen.' },
    drill: { type: 'string', description: 'Eén drill om dat punt te oefenen. 1-2 zinnen.' },
  },
  required: ['beter', 'nogWerk', 'drill'],
  additionalProperties: false,
} as const

/** Checkt wat de app meestuurt voor een vergelijking: twee geldige foto's en een trick. */
export function checkCompareInput(
  raw: unknown,
): { before: CoachImage; after: CoachImage; trick: string; days: number } | { error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const before = checkImage(r.before)
  const after = checkImage(r.after)
  if (!before || !after) return { error: 'Twee beelden nodig om te vergelijken' }
  const trick = text(r.trick, 60)
  if (!trick) return { error: 'Welke trick?' }
  const days = Math.max(0, Math.min(3650, Math.round(Number(r.days) || 0)))
  return { before, after, trick, days }
}

export function checkComparison(raw: unknown): Comparison | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { beter: text(r.beter, 400), nogWerk: text(r.nogWerk, 300), drill: text(r.drill, 300) }
  return out.beter && out.nogWerk ? out : null
}
