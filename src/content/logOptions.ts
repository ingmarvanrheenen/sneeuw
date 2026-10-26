import type { IconName } from '../design/icons'
import type { PisteColor, SnowKind, WeatherKind } from '../lib/types'

export const SNOW: { id: SnowKind; label: string }[] = [
  { id: 'poeder', label: 'Poeder' },
  { id: 'vers', label: 'Vers' },
  { id: 'groomed', label: 'Groomed' },
  { id: 'hard', label: 'Hard' },
  { id: 'ijs', label: 'IJs' },
  { id: 'slush', label: 'Slush' },
  { id: 'crud', label: 'Crud' },
  { id: 'indoor', label: 'Indoor' },
]

export const WEATHER: { id: WeatherKind; label: string; icon: IconName }[] = [
  { id: 'zon', label: 'Zon', icon: 'sun' },
  { id: 'half', label: 'Half', icon: 'partly' },
  { id: 'bewolkt', label: 'Bewolkt', icon: 'cloud' },
  { id: 'sneeuw', label: 'Sneeuw', icon: 'snow' },
  { id: 'mist', label: 'Mist', icon: 'fog' },
  { id: 'wind', label: 'Wind', icon: 'wind' },
  { id: 'regen', label: 'Regen', icon: 'rain' },
]

/** Kleuren van de piste-markering zelf (vast, niet thema-afhankelijk). */
export const PISTES: { id: PisteColor; label: string; color: string }[] = [
  { id: 'groen', label: 'Groen', color: '#3fae5a' },
  { id: 'blauw', label: 'Blauw', color: '#2f7fe0' },
  { id: 'rood', label: 'Rood', color: '#e0453a' },
  { id: 'zwart', label: 'Zwart', color: '#111111' },
  { id: 'park', label: 'Park', color: '#9be564' },
  { id: 'offpiste', label: 'Off-piste', color: '#d9a400' },
]

export const PAINS = ['Pols', 'Knie', 'Stuitje', 'Rug', 'Schouder', 'Hoofd', 'Enkel', 'Kuiten', 'Bovenbenen']
