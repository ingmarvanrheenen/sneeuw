// Coach Daddy client: bouwt de rider-context uit je eigen data en streamt antwoorden
// van de `coach` Edge Function (de API-key staat alleen op de server).
import { kvGet, kvSet } from './db'
import { getAccessToken, getProfile } from './auth'
import { loadProgressInput, computeProgress } from './useProgress'
import { TRICK_BY_ID } from '../content/tricks'
import { sessionsSorted } from './repo'
import { todayISO, uid } from './ids'

export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
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

/** Samenvatting van de rider voor de coach. Wordt bij de start van een gesprek vastgezet. */
export async function buildContext(): Promise<string> {
  const [profile, input] = await Promise.all([getProfile(), loadProgressInput()])
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
  ]
  return lines.join('\n')
}

export class CoachError extends Error {}

export async function streamCoach(conv: Conversation, onText: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const token = await getAccessToken()
  if (!url || !anon) throw new CoachError('Coach heeft een gekoppelde server nodig (zie README).')
  if (!token) throw new CoachError('Log in om met Coach Daddy te praten.')
  if (!navigator.onLine) throw new CoachError('Je bent offline. Coach heeft internet nodig.')
  const res = await fetch(`${url}/functions/v1/coach`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: conv.messages, context: conv.context }),
    signal,
  })
  if (!res.ok || !res.body) {
    let msg = `Coach gaf een fout (${res.status})`
    try {
      msg = (await res.json()).error ?? msg
    } catch {
      /* geen json */
    }
    throw new CoachError(msg)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let full = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    const chunk = dec.decode(value, { stream: true })
    full += chunk
    onText(chunk)
  }
  return full
}
