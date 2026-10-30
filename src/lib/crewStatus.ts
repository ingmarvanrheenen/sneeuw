// Waar is de crew: je status met één tik, zonder locatie. Een status ouder dan 12 uur telt niet meer
// (gisteren "in de lift" zegt vandaag niks). De laatst bekende lijst blijft lokaal voor als je geen bereik hebt.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { getCurrentUserId } from './auth-state'
import type { IconName } from '../design/icons'

export type StatusId = 'lift' | 'piste' | 'pauze' | 'park' | 'huisje' | 'klaar'

export const STATUSES: { id: StatusId; label: string; icon: IconName }[] = [
  { id: 'lift', label: 'In de lift', icon: 'lift' },
  { id: 'piste', label: 'Op de piste', icon: 'trail' },
  { id: 'pauze', label: 'Pauze', icon: 'clock' },
  { id: 'park', label: 'In het park', icon: 'kicker' },
  { id: 'huisje', label: 'Bij het huisje', icon: 'home' },
  { id: 'klaar', label: 'Klaar voor vandaag', icon: 'moon' },
]
export const STATUS_BY_ID = new Map(STATUSES.map((s) => [s.id, s]))

export interface CrewStatus {
  user_id: string
  status: StatusId
  updated_at: string
}

export const STATUS_MAX_AGE = 12 * 3600_000
const KEY = 'crewStatus'

/** Nog geldig: niet ouder dan 12 uur. */
export const isFresh = (s: CrewStatus, now = Date.now()) => now - Date.parse(s.updated_at) < STATUS_MAX_AGE

/** "net", "12 min geleden", "2 uur geleden". */
export function ago(updatedAt: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(updatedAt)) / 60_000))
  if (min < 2) return 'net'
  if (min < 60) return `${min} min geleden`
  const h = Math.round(min / 60)
  return `${h} uur geleden`
}

function need() {
  if (!supabase) throw new Error('Crew werkt alleen met een gekoppelde server (zie Instellingen).')
  return supabase
}

export const cachedStatuses = () => kvGet<CrewStatus[]>(KEY, [])

/** Statussen van jou en je crewgenoten (RLS), alleen de verse. */
export async function crewStatuses(): Promise<CrewStatus[]> {
  const { data, error } = await need().from('crew_status').select('user_id, status, updated_at')
  if (error) throw error
  const list = ((data ?? []) as CrewStatus[]).filter((s) => isFresh(s))
  await kvSet(KEY, list)
  return list
}

/** Je status zetten. De server vult de tijd in. */
export async function setCrewStatus(status: StatusId): Promise<CrewStatus> {
  const { data, error } = await need().rpc('set_crew_status', { p_status: status })
  if (error) throw error
  return data as CrewStatus
}

/** Je status weghalen. */
export async function clearCrewStatus(): Promise<void> {
  const { error } = await need()
    .from('crew_status')
    .delete()
    .eq('user_id', getCurrentUserId() ?? '')
  if (error) throw error
}
