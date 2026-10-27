// Crew-trips: een trip die je met je crew deelt, plus de gedeelde groepslijst ("wie neemt de speaker mee?").
// De trip zelf blijft een gewoon record van de eigenaar (crewId gezet = leesbaar voor de crew).
// De groepslijst staat in `crew_trip_items` en iedereen in de crew mag hem bijwerken.
// Online-first: de laatst bekende lijst wordt lokaal bewaard zodat je hem offline kunt lezen.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { getCurrentUserId } from './auth-state'
import type { Trip } from './types'

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
