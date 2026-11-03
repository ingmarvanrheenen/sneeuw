// Weer via Open-Meteo (gratis, geen key). Laatste resultaat wordt lokaal bewaard voor offline.
import { kvGet, kvSet } from './db'
import type { Resort } from '../content/resorts'
import type { IconName } from '../design/icons'

export interface DayForecast {
  date: string
  code: number
  tMax: number
  tMin: number
  snowCm: number
  windMax: number
}

export interface ResortWeather {
  resortId: string
  fetchedAt: number
  days: DayForecast[]
  snowDepthCm: number | null
  freezingLevel: number | null
}

export function wmoIcon(code: number): IconName {
  if (code === 0 || code === 1) return 'sun'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloud'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 51 && code <= 67) return 'rain'
  if (code >= 80 && code <= 82) return 'rain'
  if (code >= 95) return 'bolt'
  return 'cloud'
}

export function wmoLabel(code: number): string {
  if (code <= 1) return 'Zon'
  if (code === 2) return 'Half bewolkt'
  if (code === 3) return 'Bewolkt'
  if (code === 45 || code === 48) return 'Mist'
  if (code >= 71 && code <= 77) return 'Sneeuw'
  if (code === 85 || code === 86) return 'Sneeuwbuien'
  if (code >= 51 && code <= 67) return 'Regen'
  if (code >= 80 && code <= 82) return 'Buien'
  if (code >= 95) return 'Onweer'
  return 'Wisselend'
}

const CACHE = 'weather:v1'

export async function cachedWeather(): Promise<Record<string, ResortWeather>> {
  return kvGet(CACHE, {})
}

interface OMResponse {
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    snowfall_sum: number[]
    wind_speed_10m_max: number[]
  }
  hourly?: { snow_depth?: (number | null)[]; freezing_level_height?: (number | null)[] }
}

export async function fetchWeather(resorts: Resort[]): Promise<Record<string, ResortWeather>> {
  const outdoor = resorts.filter((r) => !r.indoor)
  if (!outdoor.length) return cachedWeather()
  const params = new URLSearchParams({
    latitude: outdoor.map((r) => r.lat).join(','),
    longitude: outdoor.map((r) => r.lon).join(','),
    elevation: outdoor.map((r) => Math.round((r.base + r.top) / 2)).join(','),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,wind_speed_10m_max',
    hourly: 'snow_depth,freezing_level_height',
    forecast_days: '7',
    forecast_hours: '1',
    timezone: 'Europe/Paris',
  })
  // slecht bereik op de berg: niet eindeloos blijven wachten
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`Weer ophalen mislukt (${res.status})`)
  const json = (await res.json()) as OMResponse | OMResponse[]
  const list = Array.isArray(json) ? json : [json]
  const cache = await cachedWeather()
  list.forEach((w, i) => {
    const r = outdoor[i]
    const depth = w.hourly?.snow_depth?.[0]
    cache[r.id] = {
      resortId: r.id,
      fetchedAt: Date.now(),
      snowDepthCm: depth != null ? Math.round(depth * 100) : null,
      freezingLevel: w.hourly?.freezing_level_height?.[0] ?? null,
      days: w.daily.time.map((date, d) => ({
        date,
        code: w.daily.weather_code[d],
        tMax: w.daily.temperature_2m_max[d],
        tMin: w.daily.temperature_2m_min[d],
        snowCm: w.daily.snowfall_sum[d] ?? 0,
        windMax: w.daily.wind_speed_10m_max[d],
      })),
    }
  })
  await kvSet(CACHE, cache)
  return cache
}

// ── Weer voor de dagen van een trip (voor het tripplan van de coach) ───────────

/** Zo ver vooruit heeft Open-Meteo een verwachting. */
export const FORECAST_DAYS = 16

/** De verwachting voor het resort op de gevraagde dagen (plus de dag ervoor, voor sneeuw van de nacht). */
export async function tripForecast(resort: Resort, dates: string[]): Promise<DayForecast[]> {
  if (resort.indoor || !dates.length) return []
  const params = new URLSearchParams({
    latitude: String(resort.lat),
    longitude: String(resort.lon),
    elevation: String(Math.round((resort.base + resort.top) / 2)),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,wind_speed_10m_max',
    past_days: '1',
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Paris',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`Weer ophalen mislukt (${res.status})`)
  const w = (await res.json()) as OMResponse
  const all: DayForecast[] = w.daily.time.map((date, d) => ({
    date,
    code: w.daily.weather_code[d],
    tMax: w.daily.temperature_2m_max[d],
    tMin: w.daily.temperature_2m_min[d],
    snowCm: w.daily.snowfall_sum[d] ?? 0,
    windMax: w.daily.wind_speed_10m_max[d],
  }))
  // sneeuw van de dag ervoor telt mee als verse sneeuw voor de eerste tripdag
  return dates
    .map((date) => {
      const i = all.findIndex((x) => x.date === date)
      if (i < 0) return null
      const prev = i > 0 && date === dates[0] ? all[i - 1].snowCm : 0
      return { ...all[i], snowCm: all[i].snowCm + prev }
    })
    .filter((x): x is DayForecast => !!x)
}

/** Eén regel voor de coach: "2027-01-16: Sneeuw, 18 cm vers, -9/-3 °C, wind tot 45 km/u". */
export function weatherLine(d: DayForecast): string {
  const parts = [wmoLabel(d.code)]
  if (d.snowCm >= 1) parts.push(`${Math.round(d.snowCm)} cm vers`)
  parts.push(`${Math.round(d.tMin)}/${Math.round(d.tMax)} °C`)
  parts.push(`wind tot ${Math.round(d.windMax)} km/u`)
  return `${d.date}: ${parts.join(', ')}`
}

/** Kort voor in het plan: "18 cm vers · -3°", of "Zon · 2°". */
export function weatherShort(d: DayForecast): string {
  return d.snowCm >= 5 ? `${Math.round(d.snowCm)} cm vers · ${Math.round(d.tMax)}°` : `${wmoLabel(d.code)} · ${Math.round(d.tMax)}°`
}
