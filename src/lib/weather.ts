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
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
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
