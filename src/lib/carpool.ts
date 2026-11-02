// Wie rijdt met wie: per crew-trip auto's met plekken. Wie rijdt biedt een auto aan, crewgenoten pakken een plek.
// Volle auto's, dubbele plekken en "rijdt zelf al" bewaakt de database; hier alleen ophalen, cachen en vertalen.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { getCurrentUserId } from './auth-state'

export interface Car {
  id: string
  crew_id: string
  trip_id: string
  driver: string
  label: string
  seats: number
  departs: string | null
  note: string | null
  created_at: string
  /** wie er een plek heeft, in volgorde van instappen */
  riders: string[]
}

export type CarInput = Pick<Car, 'label' | 'seats' | 'departs' | 'note'>

const COLS = 'id, crew_id, trip_id, driver, label, seats, departs, note, created_at'
const key = (tripId: string) => `carpool:${tripId}`

function need() {
  if (!supabase) throw new Error('Crew-trips werken alleen met een gekoppelde server.')
  return supabase
}

/** Een fout van de database in gewone taal (de triggers geven al Nederlandse tekst). */
export function carError(e: unknown): string {
  const err = e as { message?: string; code?: string }
  if (err?.code === '23505') return 'Je hebt op deze trip al een plek of een auto.'
  return err?.message || 'Dat lukte niet.'
}

export const cachedCars = (tripId: string) => kvGet<Car[]>(key(tripId), [])

/** Auto's van de trip met wie erin zit. */
export async function listCars(tripId: string): Promise<Car[]> {
  const sb = need()
  const [cars, riders] = await Promise.all([
    sb.from('crew_trip_cars').select(COLS).eq('trip_id', tripId).order('created_at'),
    sb.from('crew_trip_riders').select('car_id, user_id, created_at').eq('trip_id', tripId).order('created_at'),
  ])
  if (cars.error) throw cars.error
  if (riders.error) throw riders.error
  const rows = (riders.data ?? []) as { car_id: string; user_id: string }[]
  const list = ((cars.data ?? []) as Omit<Car, 'riders'>[]).map((c) => ({
    ...c,
    riders: rows.filter((r) => r.car_id === c.id).map((r) => r.user_id),
  }))
  await kvSet(key(tripId), list)
  return list
}

const clean = (c: CarInput): CarInput => ({
  label: c.label.trim().slice(0, 40),
  seats: Math.max(1, Math.min(8, Math.round(c.seats))),
  departs: c.departs?.trim().slice(0, 60) || null,
  note: c.note?.trim().slice(0, 120) || null,
})

/** Je eigen auto aanbieden. */
export async function addCar(crewId: string, tripId: string, input: CarInput) {
  const { error } = await need()
    .from('crew_trip_cars')
    .insert({ crew_id: crewId, trip_id: tripId, ...clean(input) })
  if (error) throw new Error(carError(error))
}

export async function updateCar(carId: string, input: CarInput) {
  const { error } = await need().from('crew_trip_cars').update(clean(input)).eq('id', carId)
  if (error) throw new Error(carError(error))
}

export async function removeCar(carId: string) {
  const { error } = await need().from('crew_trip_cars').delete().eq('id', carId)
  if (error) throw new Error(carError(error))
}

/** Een plek pakken. Zit je al in een andere auto, dan stap je eerst daar uit. */
export async function takeSeat(tripId: string, carId: string, current?: string | null) {
  if (current === carId) return
  if (current) await leaveSeat(tripId)
  const { error } = await need().from('crew_trip_riders').insert({ trip_id: tripId, car_id: carId })
  if (error) throw new Error(carError(error))
}

/** Je plek loslaten (of als bestuurder iemand uit je auto halen). */
export async function leaveSeat(tripId: string, userId = getCurrentUserId() ?? '') {
  const { error } = await need().from('crew_trip_riders').delete().eq('trip_id', tripId).eq('user_id', userId)
  if (error) throw new Error(carError(error))
}
