// Coach Daddy client: bouwt de rider-context uit je eigen data en streamt antwoorden
// van de `coach` Edge Function (de API-key staat alleen op de server).
import { db, kvGet, kvSet } from './db'
import { getAccessToken, getProfile } from './auth'
import { create, listKind, update } from './repo'
import { loadProgressInput, computeProgress } from './useProgress'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import { PISTES, SNOW, WEATHER } from '../content/logOptions'
import { MOOD_LABELS } from '../design/icons'
import type { DayReview, MediaMeta, Session, Trip, TripPlan } from './types'
import { RESORTS } from '../content/resorts'
import { tripForecast, weatherLine, weatherShort, type DayForecast } from './weather'
import { sessionsSorted } from './repo'
import { todayISO, uid } from './ids'
import {
  LIMITS,
  STREAM_TYPE,
  checkComparison,
  checkDrill,
  decodeEvents,
  type CoachAction,
  type CoachImage,
  type Comparison,
  type Drill,
  type WireMessage,
} from '../../supabase/functions/coach/protocol'

export type { CoachAction, CoachImage, Comparison, Drill, PlanDay } from '../../supabase/functions/coach/protocol'
import { checkPlanDay, checkProgram, checkTripPlan, planText, TRIP_MAX_DAYS } from '../../supabase/functions/coach/protocol'
import { addCustomProgram } from './programs'
import type { Program } from '../content/programs'

export interface CoachMessage extends WireMessage {
  /** indexen van `actions` waar de rider al op getikt heeft */
  applied?: number[]
}

export interface Conversation {
  id: string
  title: string
  context: string
  messages: CoachMessage[]
  createdAt: number
}

const KEY = 'coach:conversations'

export async function listConversations(): Promise<Conversation[]> {
  return kvGet<Conversation[]>(KEY, [])
}

export async function saveConversation(c: Conversation) {
  const all = await listConversations()
  const next = [c, ...all.filter((x) => x.id !== c.id)].slice(0, 30)
  await kvSet(KEY, next)
}

export async function deleteConversation(id: string) {
  await kvSet(
    KEY,
    (await listConversations()).filter((c) => c.id !== id),
  )
}

export function newConversation(context: string): Conversation {
  return { id: uid(), title: 'Nieuw gesprek', context, messages: [], createdAt: Date.now() }
}

// ── Geheugen: blijvende feiten die de coach zelf opslaat (zichtbaar en wisbaar) ──

export interface MemoryItem {
  id: string
  text: string
  createdAt: number
}

const MEMORY_KEY = 'coach:memory'
export const MEMORY_MAX = 30

export async function listMemory(): Promise<MemoryItem[]> {
  return kvGet<MemoryItem[]>(MEMORY_KEY, [])
}

/** Nieuw feit bovenaan; hetzelfde feit nog eens wordt niet dubbel opgeslagen. */
export async function addMemory(text: string): Promise<MemoryItem[]> {
  const all = await listMemory()
  const t = text.trim()
  if (!t || all.some((m) => m.text.toLowerCase() === t.toLowerCase())) return all
  const next = [{ id: uid(), text: t, createdAt: Date.now() }, ...all].slice(0, MEMORY_MAX)
  await kvSet(MEMORY_KEY, next)
  return next
}

export async function removeMemory(id: string): Promise<MemoryItem[]> {
  const next = (await listMemory()).filter((m) => m.id !== id)
  await kvSet(MEMORY_KEY, next)
  return next
}

/** Samenvatting van de rider voor de coach. Wordt bij de start van een gesprek vastgezet. */
export async function buildContext(): Promise<string> {
  const [profile, input, memory] = await Promise.all([getProfile(), loadProgressInput(), listMemory()])
  const p = computeProgress(input)
  const name = (id: string) => TRICK_BY_ID.get(id)?.name ?? id
  const by = (st: string) => input.tricks.filter((t) => t.status === st).map((t) => name(t.trickId))
  const recent = sessionsSorted(input.sessions)
    .slice(0, 6)
    .map(
      (s) =>
        `- ${s.date} ${s.resortName || '?'}: ${s.hours}u, ${s.falls}x gevallen, mood ${s.mood}/5, sneeuw ${s.snow ?? '?'}, pistes ${s.pistes.join('/') || '?'}` +
        (s.landed.length ? `, geland: ${s.landed.map(name).join(', ')}` : '') +
        (s.practiced.length ? `, geoefend: ${s.practiced.map(name).join(', ')}` : '') +
        (s.pains.length ? `, pijn: ${s.pains.join(', ')}${s.painNote ? ` (${s.painNote})` : ''}` : '') +
        (s.notes ? `, notitie: "${s.notes.slice(0, 200)}"` : ''),
    )
  const today = todayISO()
  const trip = input.trips
    .filter((t) => t.startDate && (t.endDate ?? t.startDate) >= today)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))[0]
  const lines = [
    `Vandaag: ${today}`,
    `Naam: ${profile.displayName || 'onbekend'}`,
    `Stance: ${profile.stance ?? 'onbekend'}${profile.angleFront != null ? ` (bindingen ${profile.angleFront}/${profile.angleBack})` : ''}`,
    `Level in de app: ${p.level.level} (${p.level.name}), ${p.xp} XP`,
    `Totaal: ${p.stats.days} dagen, ${p.stats.hours} uur, ${p.stats.falls} valpartijen`,
    `Beheerst: ${by('beheerst').join(', ') || '-'}`,
    `Geland: ${by('geland').join(', ') || '-'}`,
    `Bezig met: ${by('bezig').join(', ') || '-'}`,
    `Wil leren: ${by('wil').join(', ') || '-'}`,
    `Open doelen: ${
      input.goals
        .filter((g) => !g.done)
        .map((g) => g.title)
        .join('; ') || '-'
    }`,
    trip
      ? `Volgende trip: ${trip.name} naar ${trip.resortName ?? '?'} van ${trip.startDate} tot ${trip.endDate ?? '?'}`
      : 'Geen trip gepland',
    `Gear: ${input.gear.map((g) => `${g.gearKind} ${g.brand ?? ''} ${g.name} ${g.size ?? ''} (${g.owned})`).join('; ') || '-'}`,
    `Laatste dagen:\n${recent.join('\n') || '- nog niks gelogd'}`,
    `Wat de coach onthouden heeft:\n${memory.map((m) => `- ${m.text}`).join('\n') || '- nog niks'}`,
  ]
  return lines.join('\n')
}

export class CoachError extends Error {}

async function coachRequest(body: unknown, signal?: AbortSignal): Promise<Response> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const token = await getAccessToken()
  if (!url || !anon) throw new CoachError('Coach heeft een gekoppelde server nodig (zie README).')
  if (!token) throw new CoachError('Log in om met Coach Daddy te praten.')
  if (!navigator.onLine) throw new CoachError('Je bent offline. Coach heeft internet nodig.')
  const res = await fetch(`${url}/functions/v1/coach`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    let msg = `Coach gaf een fout (${res.status})`
    try {
      msg = (await res.json()).error ?? msg
    } catch {
      /* geen json */
    }
    throw new CoachError(msg)
  }
  return res
}

/** Een gelogde dag als leesbare tekst voor de coach. */
export function dayText(s: Session): string {
  const name = (id: string) => TRICK_BY_ID.get(id)?.name ?? id
  const label = <T extends { id: string; label: string }>(list: T[], id?: string) => list.find((x) => x.id === id)?.label
  const practicedOnly = s.practiced.filter((t) => !s.landed.includes(t))
  return [
    `Datum: ${s.date}`,
    `Waar: ${s.resortName || 'onbekend'}`,
    `Uren op de plank: ${s.hours}`,
    `Gevallen: ${s.falls}x`,
    `Gevoel: ${MOOD_LABELS[s.mood - 1] ?? s.mood} (${s.mood}/5)`,
    `Pistes: ${s.pistes.map((p) => label(PISTES, p) ?? p).join(', ') || '-'}`,
    `Sneeuw: ${label(SNOW, s.snow) ?? '-'}, weer: ${label(WEATHER, s.weather) ?? '-'}`,
    `Geland: ${s.landed.map(name).join(', ') || '-'}`,
    `Geoefend: ${practicedOnly.map(name).join(', ') || '-'}`,
    `Pijntjes: ${s.pains.join(', ') || '-'}${s.painNote ? ` (${s.painNote})` : ''}`,
    s.highlight ? `Beste moment: ${s.highlight}` : '',
    s.notes ? `Notities: ${s.notes.slice(0, 600)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Vraag Coach Daddy om een review van een dag. Telt als één coach-bericht. */
export async function reviewDay(s: Session): Promise<DayReview> {
  const [context, input] = await Promise.all([buildContext(), loadProgressInput()])
  const done = new Set(input.tricks.filter((t) => t.status === 'geland' || t.status === 'beheerst').map((t) => t.trickId))
  const trickIds = TRICKS.map((t) => t.id).filter((id) => !done.has(id))
  // dag van een trip met een coach-plan: het plan van vandaag en morgen gaat mee
  const plan = await planFor(s)
  // wat je die dag insprak (als tekst) gaat mee
  const memos = ((await db.records.where('kind').equals('media').toArray()) as MediaMeta[]).filter(
    (m) => m.type === 'audio' && m.sessionId === s.id,
  )
  const day = [dayText(s), memoLines(memos)].filter(Boolean).join('\n')
  const res = await coachRequest({ mode: 'review', context, day, trickIds, ...(plan ? { plan: plan.text } : {}) })
  const r = (await res.json()) as Omit<DayReview, 'createdAt'> & { morgenDag?: unknown }
  if (!r?.focus) throw new CoachError('Coach gaf geen bruikbare review terug.')
  // het plan van morgen echt aanpassen, niet alleen een zin
  const tomorrow =
    plan && plan.tomorrow !== null
      ? checkPlanDay(
          r.morgenDag,
          TRICKS.map((x) => x.id),
          plan.tomorrow + 1,
        )
      : null
  const changed = tomorrow && plan ? await applyTomorrow(plan.trip, plan.tomorrow!, tomorrow) : null
  const { morgenDag: _md, ...rest } = r
  void _md
  return {
    ...rest,
    trickId: r.trickId && TRICK_BY_ID.has(r.trickId) ? r.trickId : null,
    morgen: plan && typeof r.morgen === 'string' ? r.morgen : null,
    ...(changed ? { morgenDag: changed.titel } : {}),
    createdAt: Date.now(),
  }
}

// ── Drill van de dag ──────────────────────────────────────────────────────────
// Eén oefening per dag, op verzoek (kost één coach-bericht). Bewaard per datum, zodat hij die dag blijft staan
// en de coach de volgende keer een andere invalshoek kan kiezen.

const DRILL_KEY = 'coach:drills'
export type SavedDrill = Drill & { date: string; createdAt: number }

async function drillLog(): Promise<Record<string, SavedDrill>> {
  return kvGet<Record<string, SavedDrill>>(DRILL_KEY, {})
}

/** De drill van deze dag, als je hem al opgehaald hebt. */
export async function cachedDrill(date: string): Promise<SavedDrill | null> {
  return (await drillLog())[date] ?? null
}

/** Vraag de coach om de drill van vandaag. Al opgehaald: die van vandaag (geen tweede call). */
export async function askDrill(date: string): Promise<SavedDrill> {
  const log = await drillLog()
  if (log[date]) return log[date]
  const [context, input] = await Promise.all([buildContext(), loadProgressInput()])
  const done = new Set(input.tricks.filter((t) => t.status === 'beheerst').map((t) => t.trickId))
  const trickIds = TRICKS.map((t) => t.id).filter((id) => !done.has(id))
  const recent = Object.values(log)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((d) => d.titel)
  const res = await coachRequest({ mode: 'drill', context, trickIds, recent })
  const d = checkDrill(await res.json(), trickIds)
  if (!d) throw new CoachError('Coach gaf geen bruikbare drill terug.')
  const saved: SavedDrill = { ...d, trickId: d.trickId && TRICK_BY_ID.has(d.trickId) ? d.trickId : null, date, createdAt: Date.now() }
  // alleen de laatste twee weken bewaren
  const keep = Object.fromEntries(
    Object.entries({ ...log, [date]: saved })
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 14),
  )
  await kvSet(DRILL_KEY, keep)
  return saved
}

// ── Voor en na ────────────────────────────────────────────────────────────────

/** Laat de coach twee frames van dezelfde trick vergelijken (toen en nu). Telt als één coach-bericht. */
export async function compareClips(trickId: string, before: CoachImage, after: CoachImage, days: number): Promise<Comparison> {
  const context = await buildContext()
  const trick = TRICK_BY_ID.get(trickId)?.name ?? trickId
  const res = await coachRequest({ mode: 'compare', context, trick, days, before, after })
  const c = checkComparison(await res.json())
  if (!c) throw new CoachError('Coach gaf geen bruikbare vergelijking terug.')
  return c
}

/** Alleen wat de server nodig heeft, met alleen de laatste foto's (oudere zijn al besproken). */
export function toWire(messages: CoachMessage[]): WireMessage[] {
  const withImage = messages.flatMap((m, i) => (m.image ? [i] : []))
  const keep = new Set(withImage.slice(-LIMITS.images))
  return messages.map((m, i) => ({
    role: m.role,
    content: m.image && !keep.has(i) ? m.content || '(Hier stuurde ik een foto.)' : m.content,
    ...(m.image && keep.has(i) ? { image: m.image } : {}),
    ...(m.actions?.length ? { actions: m.actions } : {}),
  }))
}

export interface StreamHandlers {
  onText: (chunk: string) => void
  onAction?: (a: CoachAction) => void
}

/** Stuurt het gesprek naar de coach en leest de stream (tekst en knoppen). */
export async function streamCoach(
  conv: Conversation,
  { onText, onAction }: StreamHandlers,
  signal?: AbortSignal,
): Promise<{ text: string; actions: CoachAction[] }> {
  const res = await coachRequest(
    { messages: toWire(conv.messages), context: conv.context, tricks: TRICKS.map((t) => ({ id: t.id, name: t.name })) },
    signal,
  )
  if (!res.body) throw new CoachError('Coach gaf geen antwoord.')
  const ndjson = (res.headers.get('Content-Type') ?? '').includes(STREAM_TYPE)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let text = ''
  const actions: CoachAction[] = []
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    const chunk = done ? dec.decode() : dec.decode(value, { stream: true })
    if (!ndjson) {
      // oude versie van de server: gewone tekst
      text += chunk
      if (chunk) onText(chunk)
    } else {
      const { events, rest } = decodeEvents(buf + chunk + (done ? '\n' : ''))
      buf = rest
      for (const e of events) {
        if (e.t === 'text') {
          text += e.v
          onText(e.v)
        } else if (e.t === 'action') {
          actions.push(e.action)
          onAction?.(e.action)
        } else if (e.t === 'error') {
          throw new CoachError(e.v)
        }
      }
    }
    if (done) break
  }
  return { text, actions }
}

// ── Knoppen uitvoeren ───────────────────────────────────────────────────────

/** Volgende trip die nog moet komen of bezig is, om doelen aan te hangen. */
async function upcomingTripId(): Promise<string | undefined> {
  const today = todayISO()
  const { trips } = await loadProgressInput()
  return trips
    .filter((t) => t.startDate && (t.endDate ?? t.startDate) >= today)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))[0]?.id
}

/** Zet een voorstel van de coach om in doelen. Geeft het aantal nieuwe doelen terug. */
export async function applyAction(a: CoachAction): Promise<number> {
  if (a.kind === 'doel') {
    await create('goal', { title: a.titel, ...(a.trickId && TRICK_BY_ID.has(a.trickId) ? { trickId: a.trickId } : {}), done: false })
    return 1
  }
  if (a.kind === 'plan') {
    const tripId = await upcomingTripId()
    for (const d of a.dagen) await create('goal', { title: `${d.dag}: ${d.focus}`, ...(tripId ? { tripId } : {}), done: false })
    return a.dagen.length
  }
  if (a.kind === 'onthoud') {
    await addMemory(a.feit)
    return 0
  }
  return 0
}

// ── Foto's voor de techniek-check ─────────────────────────────────────────────

export const IMAGE_MAX = 1024

/** Tekent een foto of videoframe verkleind (max 1024 px) en geeft hem als JPEG voor de coach. */
export function toCoachImage(src: CanvasImageSource, w: number, h: number): CoachImage {
  const scale = Math.min(1, IMAGE_MAX / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new CoachError('Kon de foto niet verwerken.')
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', 0.82)
  const data = url.slice(url.indexOf(',') + 1)
  if (!url.startsWith('data:image/jpeg') || !data) throw new CoachError('Kon de foto niet verwerken.')
  return { mediaType: 'image/jpeg', data }
}

export const imageSrc = (img: CoachImage) => `data:${img.mediaType};base64,${img.data}`

// ── Coach op de trip ──────────────────────────────────────────────────────────
// Aan het begin van een trip een plan per dag (één coach-bericht), bewaard bij de trip zodat hij meesynct.
// Elke avond neemt de dagreview het plan van die dag en morgen mee.

const DAY_MS = 864e5
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

/** De dagen van een trip (van begin tot eind, max 14); zonder einddatum één dag. */
export function tripDates(t: Pick<Trip, 'startDate' | 'endDate'>): string[] {
  if (!t.startDate) return []
  const out = [t.startDate]
  while (t.endDate && out.length < TRIP_MAX_DAYS && out.at(-1)! < t.endDate) out.push(addDays(out.at(-1)!, 1))
  return out
}

/** De trip in een paar regels voor de coach. */
export function tripText(t: Trip, weather: DayForecast[] = [], dates: string[] = []): string {
  const resort = RESORTS.find((r) => r.id === t.resortId)
  const known = new Set(weather.map((w) => w.date))
  const unknown = dates.filter((d) => !known.has(d))
  return [
    `Trip: ${t.name}`,
    `Waar: ${t.resortName || resort?.name || 'onbekend'}${resort ? ` (${resort.region}, ${resort.base}-${resort.top} m, beginners ${resort.beginner}/5, ${resort.park ? 'met park' : 'geen park'}${resort.indoor ? ', indoor' : ''})` : ''}`,
    `Van ${t.startDate} tot ${t.endDate ?? t.startDate}`,
    weather.length ? `Weer (verwachting Open-Meteo, op middelhoogte):\n${weather.map((w) => `- ${weatherLine(w)}`).join('\n')}` : '',
    weather.length && unknown.length ? `Nog geen verwachting voor: ${unknown.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Het weer voor de dagen van de trip, als het resort buiten is en de trip binnen twee weken valt. Mislukt: leeg. */
export async function tripWeather(t: Trip, dates: string[]): Promise<DayForecast[]> {
  const resort = RESORTS.find((r) => r.id === t.resortId)
  if (!resort || resort.indoor || !navigator.onLine) return []
  return tripForecast(resort, dates).catch(() => [])
}

/** Het plan van vandaag op een trip, als die er is. */
export function planDay(t: Pick<Trip, 'coachPlan'> | undefined, date: string) {
  return t?.coachPlan?.days.find((d) => d.date === date) ?? null
}

/** Het tripplan rond deze dag: de tekst voor de coach, de trip en welke dag morgen is. */
async function planFor(s: Session): Promise<{ text: string; trip: Trip; tomorrow: number | null } | null> {
  const trips = await listKind('trip')
  const t = trips.find((x) => (s.tripId ? x.id === s.tripId : x.startDate && x.startDate <= s.date && (x.endDate ?? x.startDate) >= s.date))
  const days = t?.coachPlan?.days ?? []
  const i = days.findIndex((d) => d.date === s.date)
  if (!t || i < 0) return null
  const wire = (d: (typeof days)[number] | undefined, n: number) =>
    d ? { dag: n + 1, titel: d.titel, focus: d.focus, oefeningen: d.oefeningen, trickId: d.trickId } : null
  const text = planText(wire(days[i], i), wire(days[i + 1], i + 1))
  return text ? { text, trip: t, tomorrow: days[i + 1] ? i + 1 : null } : null
}

/** Het plan van morgen vervangen door de aangepaste dag van de coach (weer en datum blijven; de oude titel onthouden). */
export async function applyTomorrow(
  t: Trip,
  index: number,
  day: { titel: string; focus: string; oefeningen: string[]; trickId: string | null },
) {
  const plan = t.coachPlan
  const old = plan?.days[index]
  if (!plan || !old) return null
  const changed =
    old.titel !== day.titel ||
    old.focus !== day.focus ||
    old.oefeningen.join('|') !== day.oefeningen.join('|') ||
    old.trickId !== day.trickId
  if (!changed) return null
  const next = {
    ...old,
    titel: day.titel,
    focus: day.focus,
    oefeningen: day.oefeningen,
    trickId: day.trickId && TRICK_BY_ID.has(day.trickId) ? day.trickId : null,
    aangepast: { at: Date.now(), van: old.aangepast?.van ?? old.titel },
  }
  await update(t, { coachPlan: { ...plan, days: plan.days.map((d, i) => (i === index ? next : d)) } })
  return next
}

/** Vraag de coach om een plan voor deze trip. Telt als één coach-bericht; bewaart het bij de trip. */
export async function askTripPlan(t: Trip, wish = ''): Promise<TripPlan> {
  const dates = tripDates(t)
  if (!dates.length) throw new CoachError('Zet eerst de data van je trip.')
  const [context, input, weather] = await Promise.all([buildContext(), loadProgressInput(), tripWeather(t, dates)])
  const done = new Set(input.tricks.filter((x) => x.status === 'beheerst').map((x) => x.trickId))
  const trickIds = TRICKS.map((x) => x.id).filter((id) => !done.has(id))
  const byDate = new Map(weather.map((w) => [w.date, w]))
  const res = await coachRequest({
    mode: 'tripplan',
    context,
    trip: tripText(t, weather, dates),
    days: dates.length,
    wish: wish.trim().slice(0, 300),
    trickIds,
  })
  const out = checkTripPlan(await res.json(), trickIds, dates.length)
  if (!out) throw new CoachError('Coach gaf geen bruikbaar plan terug. Probeer het nog eens.')
  const plan: TripPlan = {
    intro: out.intro,
    days: out.dagen.map((d, i) => ({
      date: dates[i],
      titel: d.titel,
      focus: d.focus,
      oefeningen: d.oefeningen,
      trickId: d.trickId && TRICK_BY_ID.has(d.trickId) ? d.trickId : null,
      ...(byDate.get(dates[i]) ? { weer: weatherShort(byDate.get(dates[i])!), weerCode: byDate.get(dates[i])!.code } : {}),
    })),
    ...(wish.trim() ? { wish: wish.trim().slice(0, 300) } : {}),
    weatherDays: weather.length,
    createdAt: Date.now(),
  }
  await update(t, { coachPlan: plan })
  return plan
}

// ── Eigen programma ─────────────────────────────────────────────────────────

/**
 * Coach Daddy maakt een programma op jouw niveau, in dezelfde vorm als de kant-en-klare (dagen met doel,
 * piste, oefeningen en tricks). Hij krijgt de tricks die je nog niet beheerst; het programma wordt bewaard
 * bij je programma's op dit toestel.
 */
export async function askProgram(wish: string, days: number): Promise<Program> {
  const [context, input] = await Promise.all([buildContext(), loadProgressInput()])
  const done = new Set(input.tricks.filter((x) => x.status === 'beheerst').map((x) => x.trickId))
  const trickIds = TRICKS.map((x) => x.id).filter((id) => !done.has(id))
  const w = wish.trim().slice(0, 300)
  const res = await coachRequest({ mode: 'program', context, wish: w, days, trickIds })
  const out = checkProgram(await res.json(), trickIds, days)
  if (!out) throw new CoachError('Coach gaf geen bruikbaar programma terug. Probeer het nog eens.')
  const createdAt = Date.now()
  const p: Program = {
    id: `coach-${createdAt.toString(36)}`,
    name: out.naam,
    blurb: out.blurb,
    start: out.start,
    days: out.dagen.map((d) => ({
      title: d.titel,
      goal: d.doel,
      ...(d.piste ? { piste: d.piste } : {}),
      tricks: d.tricks.filter((t) => TRICK_BY_ID.has(t)),
      tasks: d.oefeningen,
    })),
    coach: { wish: w, createdAt },
  }
  await addCustomProgram(p)
  return p
}

// ── Spraakmemo naar tekst ───────────────────────────────────────────────────

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Een memo van dit toestel omzetten naar tekst (via de coach-functie naar OpenAI; de key staat alleen op de
 * server). De tekst komt bij de memo, synct mee en gaat mee in je dagreview. Telt als één coach-bericht.
 */
export async function transcribeMemo(m: MediaMeta): Promise<string> {
  const row = await db.blobs.get(m.id)
  if (!row) throw new CoachError('Deze memo staat niet op dit toestel.')
  const res = await coachRequest({ mode: 'transcribe', audio: { data: await toBase64(row.blob), mime: m.mime } })
  const text = String(((await res.json()) as { text?: unknown }).text ?? '').trim()
  await update(m, { transcript: text })
  return text
}

/** Memo's met tekst bij een dag, als regels voor de dagreview (max 1200 tekens). */
export function memoLines(memos: Pick<MediaMeta, 'transcript' | 'createdAt' | 'deleted'>[]): string {
  const said = memos
    .filter((m) => !m.deleted && m.transcript)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((m) => `- "${m.transcript}"`)
  return said.length ? `Spraakmemo's van die dag:\n${said.join('\n')}`.slice(0, 1200) : ''
}
