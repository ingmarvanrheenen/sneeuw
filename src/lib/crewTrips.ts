// Crew-trips: een trip die je met je crew deelt, plus de gedeelde groepslijst ("wie neemt de speaker mee?").
// De trip zelf blijft een gewoon record van de eigenaar (crewId gezet = leesbaar voor de crew).
// De groepslijst staat in `crew_trip_items` en iedereen in de crew mag hem bijwerken.
// Online-first: de laatst bekende lijst wordt lokaal bewaard zodat je hem offline kunt lezen.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { getCurrentUserId } from './auth-state'
import { todayISO } from './ids'
import type { MediaMeta, Session, Trip } from './types'

export interface CrewTripItem {
  id: string
  crew_id: string
  trip_id: string
  label: string
  claimed_by: string | null
  done: boolean
  created_by: string
  created_at: string
}

export interface CrewTrip {
  id: string
  ownerId: string
  crewId: string
  trip: Trip
}

/** Dingen die je per groep maar één keer nodig hebt. */
export const GROUP_SUGGESTIONS = [
  'Speaker',
  'EHBO-doos',
  'Waxkit + krabber',
  'Multitool / schroevendraaier',
  'Verlengsnoer / stekkerdoos',
  'Powerbank',
  'Kaartspel',
  'Boodschappen eerste avond',
  'Tape',
  'Reserve goggle-lens',
]

function need() {
  if (!supabase) throw new Error('Crew-trips werken alleen met een gekoppelde server.')
  return supabase
}

/** Trips die crewgenoten met jou delen (je eigen trips staan al lokaal). */
export async function crewTrips(): Promise<CrewTrip[]> {
  const sb = need()
  const me = getCurrentUserId()
  const { data, error } = await sb
    .from('records')
    .select('id, user_id, crew_id, data')
    .eq('kind', 'trip')
    .eq('deleted', false)
    .not('crew_id', 'is', null)
    .neq('user_id', me ?? '')
  if (error) throw error
  const list = (data ?? []).map((r) => ({ id: r.id, ownerId: r.user_id, crewId: r.crew_id, trip: r.data as Trip }))
  await kvSet('crewTrips', list)
  return list
}

export function cachedCrewTrips(): Promise<CrewTrip[]> {
  return kvGet<CrewTrip[]>('crewTrips', [])
}

const cacheKey = (tripId: string) => `tripItems:${tripId}`

export function cachedItems(tripId: string): Promise<CrewTripItem[]> {
  return kvGet<CrewTripItem[]>(cacheKey(tripId), [])
}

export async function listItems(tripId: string): Promise<CrewTripItem[]> {
  const sb = need()
  const { data, error } = await sb
    .from('crew_trip_items')
    .select('id, crew_id, trip_id, label, claimed_by, done, created_by, created_at')
    .eq('trip_id', tripId)
    .order('created_at')
  if (error) throw error
  await kvSet(cacheKey(tripId), data ?? [])
  return (data ?? []) as CrewTripItem[]
}

export async function addItem(crewId: string, tripId: string, label: string, claim = false): Promise<CrewTripItem> {
  const sb = need()
  const me = getCurrentUserId()
  const { data, error } = await sb
    .from('crew_trip_items')
    .insert({ crew_id: crewId, trip_id: tripId, label: label.trim().slice(0, 80), claimed_by: claim ? me : null })
    .select('id, crew_id, trip_id, label, claimed_by, done, created_by, created_at')
    .single()
  if (error) throw error
  return data as CrewTripItem
}

export async function setClaim(itemId: string, mine: boolean) {
  const { error } = await need()
    .from('crew_trip_items')
    .update({ claimed_by: mine ? getCurrentUserId() : null })
    .eq('id', itemId)
  if (error) throw error
}

export async function setDone(itemId: string, done: boolean) {
  const { error } = await need().from('crew_trip_items').update({ done }).eq('id', itemId)
  if (error) throw error
}

export async function removeItem(itemId: string) {
  const { error } = await need().from('crew_trip_items').delete().eq('id', itemId)
  if (error) throw error
}

// ── Crew-doelen: "iedereen een rode piste", iedereen vinkt voor zichzelf af ──────────────────

export interface CrewGoal {
  id: string
  crew_id: string
  trip_id: string
  title: string
  created_by: string
  created_at: string
  /** wie het gehaald heeft */
  done: string[]
}

const goalsKey = (tripId: string) => `tripGoals:${tripId}`

export function cachedGoals(tripId: string): Promise<CrewGoal[]> {
  return kvGet<CrewGoal[]>(goalsKey(tripId), [])
}

export async function listGoals(tripId: string): Promise<CrewGoal[]> {
  const sb = need()
  const { data: goals, error } = await sb
    .from('crew_trip_goals')
    .select('id, crew_id, trip_id, title, created_by, created_at')
    .eq('trip_id', tripId)
    .order('created_at')
  if (error) throw error
  const ids = (goals ?? []).map((g) => g.id)
  let done: { goal_id: string; user_id: string }[] = []
  if (ids.length) {
    const res = await sb.from('crew_trip_goal_done').select('goal_id, user_id').in('goal_id', ids)
    if (res.error) throw res.error
    done = res.data ?? []
  }
  const list = (goals ?? []).map((g) => ({ ...g, done: done.filter((d) => d.goal_id === g.id).map((d) => d.user_id) })) as CrewGoal[]
  await kvSet(goalsKey(tripId), list)
  return list
}

export async function addGoal(crewId: string, tripId: string, title: string): Promise<CrewGoal> {
  const { data, error } = await need()
    .from('crew_trip_goals')
    .insert({ crew_id: crewId, trip_id: tripId, title: title.trim().slice(0, 80) })
    .select('id, crew_id, trip_id, title, created_by, created_at')
    .single()
  if (error) throw error
  return { ...(data as Omit<CrewGoal, 'done'>), done: [] }
}

export async function removeGoal(goalId: string) {
  const { error } = await need().from('crew_trip_goals').delete().eq('id', goalId)
  if (error) throw error
}

/** Alleen voor jezelf: de database staat niks anders toe. */
export async function setGoalDone(goalId: string, done: boolean) {
  const sb = need()
  const me = getCurrentUserId()
  const { error } = done
    ? await sb.from('crew_trip_goal_done').insert({ goal_id: goalId })
    : await sb
        .from('crew_trip_goal_done')
        .delete()
        .eq('goal_id', goalId)
        .eq('user_id', me ?? '')
  if (error) throw error
}

// ── Trip-recap: alle met de crew gedeelde dagen binnen de tripperiode bij elkaar ─────────────

export interface SharedDay {
  user_id: string
  data: Session
}

export async function tripDays(crewId: string, trip: Pick<Trip, 'startDate' | 'endDate'>): Promise<SharedDay[]> {
  if (!trip.startDate) return []
  const { data, error } = await need()
    .from('records')
    .select('user_id, data')
    .eq('kind', 'session')
    .eq('crew_id', crewId)
    .eq('deleted', false)
  if (error) throw error
  const end = trip.endDate ?? trip.startDate
  return ((data ?? []) as SharedDay[]).filter((d) => d.data.date >= trip.startDate! && d.data.date <= end)
}

/**
 * Foto's en clips van de trip: gekoppeld aan een gedeelde dag van de trip, of tijdens de trip gemaakt.
 * Nieuwste eerst. Voor de stemronde: "Val van de trip" met bewijs.
 */
export function mediaOnTrip(media: MediaMeta[], days: SharedDay[], trip: Pick<Trip, 'startDate' | 'endDate'>): MediaMeta[] {
  if (!trip.startDate) return []
  const end = trip.endDate ?? trip.startDate
  const dayIds = new Set(days.map((d) => d.data.id))
  return media
    .filter((m) => {
      if (m.sessionId) return dayIds.has(m.sessionId)
      const date = todayISO(new Date(m.createdAt))
      return date >= trip.startDate! && date <= end
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Met de crew gedeelde media, gefilterd op de trip (zie `mediaOnTrip`). */
export async function tripMedia(crewId: string, trip: Pick<Trip, 'startDate' | 'endDate'>, days: SharedDay[]): Promise<MediaMeta[]> {
  const { data, error } = await need()
    .from('records')
    .select('user_id, data')
    .eq('kind', 'media')
    .eq('crew_id', crewId)
    .eq('deleted', false)
  if (error) throw error
  const media = ((data ?? []) as { user_id: string; data: MediaMeta }[]).map((r) => ({ ...r.data, userId: r.data.userId ?? r.user_id }))
  return mediaOnTrip(media, days, trip)
}

export interface RecapPerson {
  userId: string
  name: string
  days: number
  hours: number
  falls: number
  landed: string[]
}

export interface Recap {
  days: number
  hours: number
  falls: number
  /** unieke trick-ids die iemand in de crew deze trip landde */
  landed: string[]
  people: RecapPerson[]
  mostHours?: RecapPerson
  mostFalls?: RecapPerson
  mostTricks?: RecapPerson
}

/** Rekent de recap uit. Puur: geen netwerk, zodat hij makkelijk te testen is. */
export function computeRecap(days: SharedDay[], names: Record<string, string>): Recap {
  const byUser = new Map<string, RecapPerson>()
  for (const { user_id, data: s } of days) {
    const p = byUser.get(user_id) ?? { userId: user_id, name: names[user_id] ?? 'Iemand', days: 0, hours: 0, falls: 0, landed: [] }
    p.days += 1
    p.hours += s.hours || 0
    p.falls += s.falls || 0
    for (const t of s.landed ?? []) if (!p.landed.includes(t)) p.landed.push(t)
    byUser.set(user_id, p)
  }
  const people = [...byUser.values()].sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
  const top = (key: 'hours' | 'falls') => {
    const best = [...people].sort((a, b) => b[key] - a[key])[0]
    return best && best[key] > 0 ? best : undefined
  }
  const mostTricks = [...people].sort((a, b) => b.landed.length - a.landed.length)[0]
  return {
    days: days.length,
    hours: Math.round(people.reduce((a, p) => a + p.hours, 0) * 10) / 10,
    falls: people.reduce((a, p) => a + p.falls, 0),
    landed: [...new Set(people.flatMap((p) => p.landed))],
    people,
    mostHours: people.length > 1 ? top('hours') : undefined,
    mostFalls: people.length > 1 ? top('falls') : undefined,
    mostTricks: people.length > 1 && mostTricks?.landed.length ? mostTricks : undefined,
  }
}

// ── Stemronde van de crew-awards ──────────────────────────────────────────────

export type VoteCategory = 'val' | 'held'

export const VOTE_CATEGORIES: { id: VoteCategory; title: string; blurb: string }[] = [
  { id: 'val', title: 'Val van de trip', blurb: 'De mooiste, hardste of domste val. Op jezelf stemmen kan niet.' },
  { id: 'held', title: 'Held van de trip', blurb: 'Wie maakte deze trip? Op jezelf stemmen kan niet.' },
]

export interface Vote {
  category: VoteCategory
  voter: string
  candidate: string
}

const votesKey = (tripId: string) => `tripVotes:${tripId}`

export function cachedVotes(tripId: string): Promise<Vote[]> {
  return kvGet<Vote[]>(votesKey(tripId), [])
}

export async function listVotes(tripId: string): Promise<Vote[]> {
  const { data, error } = await need().from('crew_trip_votes').select('category, voter, candidate').eq('trip_id', tripId)
  if (error) throw error
  const list = (data ?? []) as Vote[]
  await kvSet(votesKey(tripId), list)
  return list
}

/** Stemmen of je stem omzetten (alleen de kandidaat mag veranderen, dus geen upsert). */
export async function castVote(crewId: string, tripId: string, category: VoteCategory, candidate: string, change: boolean) {
  const sb = need()
  const { error } = change
    ? await sb
        .from('crew_trip_votes')
        .update({ candidate })
        .eq('trip_id', tripId)
        .eq('category', category)
        .eq('voter', getCurrentUserId() ?? '')
    : await sb.from('crew_trip_votes').insert({ trip_id: tripId, crew_id: crewId, category, candidate })
  if (error) throw error
}

export async function removeVote(tripId: string, category: VoteCategory) {
  const { error } = await need()
    .from('crew_trip_votes')
    .delete()
    .eq('trip_id', tripId)
    .eq('category', category)
    .eq('voter', getCurrentUserId() ?? '')
  if (error) throw error
}

/** Stand van één categorie: stemmen per persoon en wie er (samen) bovenaan staat. */
export function voteResult(votes: Vote[], category: VoteCategory) {
  const counts: Record<string, number> = {}
  for (const v of votes) if (v.category === category) counts[v.candidate] = (counts[v.candidate] ?? 0) + 1
  const max = Math.max(0, ...Object.values(counts))
  const leaders = max ? Object.keys(counts).filter((k) => counts[k] === max) : []
  return { counts, leaders, max, total: Object.values(counts).reduce((a, b) => a + b, 0) }
}
