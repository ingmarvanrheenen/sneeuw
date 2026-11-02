// Huisje-briefje van een crew-trip: adres, wifi, in- en uitchecken, eerste lift, notities, en een kookrooster.
// Online-first met een lokale kopie (op de berg wil je de wifi-code ook zonder bereik zien).
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { getCurrentUserId } from './auth-state'
import { parseISO } from './format'

export interface House {
  trip_id: string
  crew_id: string
  address: string | null
  wifi_name: string | null
  wifi_code: string | null
  checkin: string | null
  checkout: string | null
  first_lift: string | null
  notes: string | null
  updated_by: string | null
  updated_at: string
}

export type HouseField = 'address' | 'wifi_name' | 'wifi_code' | 'checkin' | 'checkout' | 'first_lift' | 'notes'
export type HouseFields = Partial<Record<HouseField, string | null>>

export const HOUSE_FIELDS: { key: HouseField; label: string; max: number; hint?: string }[] = [
  { key: 'address', label: 'Adres', max: 160 },
  { key: 'wifi_name', label: 'Wifi', max: 60 },
  { key: 'wifi_code', label: 'Wifi-code', max: 60 },
  { key: 'checkin', label: 'Inchecken', max: 60, hint: 'Bijvoorbeeld: za 16:00, sleutel in het kastje' },
  { key: 'checkout', label: 'Uitchecken', max: 60, hint: 'Bijvoorbeeld: za 10:00, vuilnis buiten' },
  { key: 'first_lift', label: 'Eerste lift', max: 60, hint: 'Bijvoorbeeld: 8:45, gondel bij de bakker' },
  { key: 'notes', label: 'Huisregels en notities', max: 1000 },
]

export interface CookingDay {
  trip_id: string
  crew_id: string
  day: string
  cook: string
  menu: string | null
}

const COLS = 'trip_id, crew_id, address, wifi_name, wifi_code, checkin, checkout, first_lift, notes, updated_by, updated_at'
const houseKey = (tripId: string) => `house:${tripId}`
const cookKey = (tripId: string) => `cooking:${tripId}`

function need() {
  if (!supabase) throw new Error('Crew-trips werken alleen met een gekoppelde server.')
  return supabase
}

/** Alleen ingevulde tekst, ingekort tot de maximale lengte; leeg wordt null. */
export function cleanFields(f: HouseFields): HouseFields {
  const out: HouseFields = {}
  for (const { key, max } of HOUSE_FIELDS) if (key in f) out[key] = f[key]?.trim().slice(0, max) || null
  return out
}

/** Alleen wat echt veranderd is, zodat twee mensen die tegelijk iets anders aanpassen elkaar niet overschrijven. */
export function changedFields(before: House | null, next: HouseFields): HouseFields {
  const clean = cleanFields(next)
  return Object.fromEntries(Object.entries(clean).filter(([k, v]) => (before?.[k as HouseField] ?? null) !== v)) as HouseFields
}

export const cachedHouse = (tripId: string) => kvGet<House | null>(houseKey(tripId), null)
export const cachedCooking = (tripId: string) => kvGet<CookingDay[]>(cookKey(tripId), [])

export async function getHouse(tripId: string): Promise<House | null> {
  const { data, error } = await need().from('crew_trip_house').select(COLS).eq('trip_id', tripId).maybeSingle()
  if (error) throw error
  await kvSet(houseKey(tripId), data ?? null)
  return (data as House | null) ?? null
}

/** Opslaan wat veranderd is. Bestaat het briefje nog niet, dan maken we hem aan. */
export async function saveHouse(crewId: string, tripId: string, before: House | null, next: HouseFields): Promise<void> {
  const patch = changedFields(before, next)
  if (!Object.keys(patch).length) return
  const sb = need()
  if (!before) {
    const { error } = await sb.from('crew_trip_house').insert({ trip_id: tripId, crew_id: crewId, ...patch })
    if (!error) return
    // tegelijk door iemand anders begonnen: dan gewoon bijwerken
    if ((error as { code?: string }).code !== '23505') throw error
  }
  const { error } = await sb.from('crew_trip_house').update(patch).eq('trip_id', tripId)
  if (error) throw error
}

export async function listCooking(tripId: string): Promise<CookingDay[]> {
  const { data, error } = await need()
    .from('crew_trip_cooking')
    .select('trip_id, crew_id, day, cook, menu')
    .eq('trip_id', tripId)
    .order('day')
  if (error) throw error
  await kvSet(cookKey(tripId), data ?? [])
  return (data ?? []) as CookingDay[]
}

export async function claimCooking(crewId: string, tripId: string, day: string, menu: string | null) {
  const { error } = await need()
    .from('crew_trip_cooking')
    .insert({ trip_id: tripId, crew_id: crewId, day, menu: menu?.trim().slice(0, 80) || null })
  if (error) throw (error as { code?: string }).code === '23505' ? new Error('Iemand anders kookt die avond al.') : error
}

export async function setMenu(tripId: string, day: string, menu: string | null) {
  const { error } = await need()
    .from('crew_trip_cooking')
    .update({ menu: menu?.trim().slice(0, 80) || null })
    .eq('trip_id', tripId)
    .eq('day', day)
    .eq('cook', getCurrentUserId() ?? '')
  if (error) throw error
}

export async function releaseCooking(tripId: string, day: string) {
  const { error } = await need().from('crew_trip_cooking').delete().eq('trip_id', tripId).eq('day', day)
  if (error) throw error
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** De avonden van de trip (van de eerste dag tot de dag voor vertrek; één avond als er geen einddatum is). Max 21. */
export function tripEvenings(startDate?: string, endDate?: string): string[] {
  if (!startDate) return []
  const start = parseISO(startDate)
  const end = endDate && endDate > startDate ? parseISO(endDate) : null
  const out: string[] = []
  for (let d = new Date(start); out.length < 21; d.setDate(d.getDate() + 1)) {
    if (end && d >= end) break
    out.push(iso(d))
    if (!end) break
  }
  return out
}

/** Link naar Kaarten (opent Apple Kaarten op de iPhone, Google of de browser elders). */
export const mapsUrl = (address: string) => `https://maps.apple.com/?q=${encodeURIComponent(address)}`
