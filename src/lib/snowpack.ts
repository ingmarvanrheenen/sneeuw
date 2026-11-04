// Sneeuwhoogte per resort: wat het weermodel van Open-Meteo nu verwacht in het dal en bovenop. Een schatting,
// geen meting van een paal op de piste. Zonder bereik zie je de laatste stand (met wanneer die was).
import { kvGet, kvSet } from './db'
import type { Resort } from '../content/resorts'

export interface Snowpack {
  /** cm in het dal (onderste liftpunt) */
  base: number
  /** cm bovenop (bovenste liftpunt) */
  top: number
  at: number
}

const key = (id: string) => `snowpack:${id}`
export const cachedSnowpack = (id: string) => kvGet<Snowpack | null>(key(id), null)

/** Meter naar hele centimeters; ontbrekend of negatief = 0. */
export const toCm = (m: unknown) => (typeof m === 'number' && m > 0 ? Math.round(m * 100) : 0)

export async function loadSnowpack(r: Resort): Promise<Snowpack | null> {
  if (r.indoor) return null
  const params = new URLSearchParams({
    latitude: `${r.lat},${r.lat}`,
    longitude: `${r.lon},${r.lon}`,
    elevation: `${r.base},${r.top}`,
    current: 'snow_depth',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`Sneeuwhoogte ophalen mislukt (${res.status})`)
  const json = (await res.json()) as { current?: { snow_depth?: number } }[] | { current?: { snow_depth?: number } }
  const [low, high] = Array.isArray(json) ? json : [json, json]
  const p: Snowpack = { base: toCm(low?.current?.snow_depth), top: toCm(high?.current?.snow_depth), at: Date.now() }
  await kvSet(key(r.id), p)
  return p
}

/** "net", "3 uur geleden", "2 dagen geleden": hoe oud de laatste stand is. */
export function age(at: number, now = Date.now()): string {
  const min = Math.round((now - at) / 60_000)
  if (min < 60) return 'net'
  const h = Math.round(min / 60)
  if (h < 24) return `${h} uur geleden`
  const d = Math.round(h / 24)
  return d === 1 ? 'gisteren' : `${d} dagen geleden`
}
