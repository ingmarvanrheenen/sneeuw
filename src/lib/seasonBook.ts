// Seizoensboek: je seizoen als boek om te bewaren of te printen (PDF via het printscherm). Puur afgeleid uit je
// data, zoals Wrapped en het stickerboek: hoofdstukken, tricks, stickers, je beste clips en je dagen per maand.
import { album, type SeasonPage } from './album'
import { wrapped, type WrappedCard } from './wrapped'
import { seasonOf } from './format'
import { isVisual } from './memo'
import type { ProgressInput } from './progress'
import type { MediaMeta, Session } from './types'

const MONTH_NAMES = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
]

export interface BookMonth {
  /** "december 2026" */
  label: string
  days: Session[]
}

export interface SeasonBook {
  season: string
  chapters: WrappedCard[]
  page: SeasonPage | null
  clips: MediaMeta[]
  months: BookMonth[]
  days: number
}

/** Je beste clips en foto's: eerst die bij een trick, dan de nieuwste; geen memo's of trip-films. Max 9. */
export function bestClips(media: MediaMeta[], sessions: Session[], season: string): MediaMeta[] {
  const dayIds = new Set(sessions.map((s) => s.id))
  return media
    .filter((m) => !m.deleted && isVisual(m) && !m.tripFilm)
    .filter((m) => (m.sessionId ? dayIds.has(m.sessionId) : seasonOf(new Date(m.createdAt).toISOString().slice(0, 10)) === season))
    .sort((a, b) => Number(!!b.trickId) - Number(!!a.trickId) || b.createdAt - a.createdAt)
    .slice(0, 9)
}

export function seasonBook(input: ProgressInput, season: string): SeasonBook {
  const sessions = input.sessions.filter((s) => !s.deleted && seasonOf(s.date) === season).sort((a, b) => a.date.localeCompare(b.date))
  const months: BookMonth[] = []
  for (const s of sessions) {
    const [y, m] = s.date.split('-').map(Number)
    const label = `${MONTH_NAMES[m - 1]} ${y}`
    const last = months.at(-1)
    if (last?.label === label) last.days.push(s)
    else months.push({ label, days: [s] })
  }
  return {
    season,
    // de intro van Wrapped is onze cover; de rest zijn de hoofdstukken
    chapters: wrapped(input, season).filter((c) => c.id !== 'intro'),
    page: album(input).find((p) => p.season === season) ?? null,
    clips: bestClips(input.media, sessions, season),
    months,
    days: new Set(sessions.map((s) => s.date)).size,
  }
}
