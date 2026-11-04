// Verzamelpunt: één pin per crew waar je elkaar treft. Afstand en richting rekent de app op je telefoon uit met
// je eigen plek; die wordt niet gedeeld. Na 12 uur is een pin van gisteren en laten we hem niet meer zien.
// Tabel en regels: migratie 20261122000000_crew_meetpoints.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { meters } from './runGps'

export interface MeetPoint {
  crew_id: string
  lat: number
  lon: number
  label: string
  meet_at: string | null
  set_by: string
  updated_at: string
}

export const LABELS = ['Lunch', 'Bovenaan de lift', 'Onderaan de piste', 'Huisje', 'Après-ski']
export const FRESH_MS = 12 * 3600_000

export const isCurrent = (p: Pick<MeetPoint, 'updated_at'>, now = Date.now()) => now - Date.parse(p.updated_at) < FRESH_MS

/** Richting van a naar b in graden (0 = noord, 90 = oost). */
export function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad)
  return (Math.atan2(y, x) / rad + 360) % 360
}

const WINDS = ['noorden', 'noordoosten', 'oosten', 'zuidoosten', 'zuiden', 'zuidwesten', 'westen', 'noordwesten']
export const compass = (deg: number) => WINDS[Math.round(deg / 45) % 8]

/** "450 m naar het noordoosten", "2,3 km naar het zuiden", of "Je bent er" binnen 30 meter. */
export function wayTo(from: { lat: number; lon: number }, to: { lat: number; lon: number }): string {
  const d = meters(from, to)
  if (d < 30) return 'Je bent er'
  const dist = d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1).replace('.', ',')} km`
  return `${dist} naar het ${compass(bearing(from, to))}`
}

/** Openen in Kaarten (op de iPhone Apple Kaarten), met het label als naam. */
export const mapsHref = (p: Pick<MeetPoint, 'lat' | 'lon' | 'label'>) =>
  `https://maps.apple.com/?ll=${p.lat.toFixed(6)},${p.lon.toFixed(6)}&q=${encodeURIComponent(p.label)}`

function need() {
  if (!supabase) throw new Error('Het verzamelpunt werkt alleen met een gekoppelde server.')
  return supabase
}

const key = (crewId: string) => `meetpoint:${crewId}`
export const cachedMeetPoint = (crewId: string) => kvGet<MeetPoint | null>(key(crewId), null)

export async function loadMeetPoint(crewId: string): Promise<MeetPoint | null> {
  const { data, error } = await need()
    .from('crew_meetpoints')
    .select('crew_id, lat, lon, label, meet_at, set_by, updated_at')
    .eq('crew_id', crewId)
    .maybeSingle()
  if (error) throw error
  const p = (data as MeetPoint | null) ?? null
  await kvSet(key(crewId), p)
  return p
}

export async function setMeetPoint(crewId: string, me: string, p: { lat: number; lon: number; label: string; meet_at?: string | null }) {
  const label = p.label.trim().slice(0, 60)
  if (!label) throw new Error('Waar spreek je af?')
  const { error } = await need()
    .from('crew_meetpoints')
    .upsert({ crew_id: crewId, lat: p.lat, lon: p.lon, label, meet_at: p.meet_at ?? null, set_by: me }, { onConflict: 'crew_id' })
  if (error) throw error
}

export async function clearMeetPoint(crewId: string) {
  const { error } = await need().from('crew_meetpoints').delete().eq('crew_id', crewId)
  if (error) throw error
  await kvSet(key(crewId), null)
}

/** "vandaag 12:30" voor een tijd die je erbij zette. */
export const meetTime = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
