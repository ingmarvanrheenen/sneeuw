// Een dag opslaan, gedeeld door het snelle loggen (Home) en het volledige log-scherm.
// Hier zit ook het slim voorinvullen: waar je waarschijnlijk bent, met wie je deelt.
import { create, getTrickProgress, listKind, setTrickStatus, update } from './repo'
import { kvGet, kvSet } from './db'
import { todayISO } from './ids'
import { celebrate, toast } from './toast'
import { cachedCrews } from './crew'
import { TRICK_BY_ID } from '../content/tricks'
import { RESORTS } from '../content/resorts'
import type { MediaMeta, Session } from './types'

export type SessionDraft = Omit<Session, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'kind'>

export const EMPTY_DRAFT: SessionDraft = {
  date: todayISO(),
  resortName: '',
  pistes: [],
  hours: 4,
  falls: 0,
  mood: 4,
  practiced: [],
  landed: [],
  pains: [],
  buddies: [],
  mediaIds: [],
  crewId: null,
}

const DAY = 86_400_000

/**
 * Een dag die al zo veel mogelijk klopt: plek van je lopende trip of van je vorige dag (als die
 * recent was), je gebruikelijke aantal uren, en de crew waarmee je de vorige keer deelde.
 */
export async function smartDraft(date = todayISO()): Promise<SessionDraft> {
  const d: SessionDraft = { ...EMPTY_DRAFT, date, pistes: [], practiced: [], landed: [], pains: [], buddies: [], mediaIds: [] }
  const [trips, sessions, crews, lastCrew] = await Promise.all([
    listKind('trip'),
    listKind('session'),
    cachedCrews(),
    kvGet<string | null>('lastCrewId', null),
  ])
  const trip = trips.find((t) => t.startDate && t.startDate <= date && (t.endDate ?? t.startDate) >= date)
  const last = sessions.filter((s) => s.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]
  if (trip) {
    d.tripId = trip.id
    d.resortId = trip.resortId
    d.resortName = trip.resortName ?? ''
  } else if (last && Date.parse(date) - Date.parse(last.date) <= 21 * DAY) {
    d.resortId = last.resortId
    d.resortName = last.resortName
  }
  if (d.resortId && RESORTS.find((r) => r.id === d.resortId)?.indoor) d.snow = 'indoor'
  if (last) d.hours = last.hours
  if (lastCrew && crews.some((c) => c.id === lastCrew)) d.crewId = lastCrew
  return d
}

/** Slaat een dag op (nieuw of bestaand) en werkt tricks, media en de crew-voorkeur bij. */
export async function saveSession(opts: { id: string; draft: SessionDraft; existing?: Session | null; media?: MediaMeta[] }) {
  const { id, draft, existing, media = [] } = opts
  const data: SessionDraft = {
    ...draft,
    mediaIds: media.map((m) => m.id),
    practiced: Array.from(new Set([...draft.practiced, ...draft.landed])),
  }
  if (existing) await update(existing, data)
  else await create('session', { ...data, id })
  await kvSet('lastCrewId', draft.crewId ?? null)
  // media volgt de zichtbaarheid van de dag
  for (const m of media) if ((m.crewId ?? null) !== (draft.crewId ?? null)) await update(m, { crewId: draft.crewId ?? null })

  for (const tid of draft.landed) {
    const prev = await getTrickProgress(tid)
    const first = !prev?.firstLandedAt
    await setTrickStatus(tid, prev?.status === 'beheerst' ? 'beheerst' : 'geland', { sessionId: id, crewId: draft.crewId ?? null })
    if (first) celebrate('landed', `Geland: ${TRICK_BY_ID.get(tid)?.name ?? tid}`, 'Staat nu in je kluis', 'stomp')
  }
  for (const tid of data.practiced) {
    if (draft.landed.includes(tid)) continue
    const prev = await getTrickProgress(tid)
    if (!prev || prev.status === 'wil') await setTrickStatus(tid, 'bezig')
  }
  if (!draft.landed.length)
    toast({ title: 'Dag opgeslagen', body: `${draft.resortName || 'Je dag'} staat in je logboek`, icon: 'check', tone: 'success' })
}
