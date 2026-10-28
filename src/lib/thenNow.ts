// Toen en nu: je eerste clip van een trick naast je laatste, zodat je ziet hoeveel je vooruit bent gegaan.
import type { MediaMeta } from './types'

export interface ThenNow {
  trickId: string
  then: MediaMeta
  now: MediaMeta
  /** hele dagen tussen de twee clips */
  days: number
  /** aantal clips van deze trick */
  count: number
}

const DAY = 86_400_000

/** Oudste en nieuwste clip van één trick, of null als er minder dan twee zijn. */
export function thenAndNow(media: MediaMeta[], trickId: string): ThenNow | null {
  const clips = media.filter((m) => m.trickId === trickId && !m.deleted).sort((a, b) => a.createdAt - b.createdAt)
  if (clips.length < 2) return null
  const then = clips[0]
  const now = clips[clips.length - 1]
  return { trickId, then, now, days: Math.floor((now.createdAt - then.createdAt) / DAY), count: clips.length }
}

/** Alle tricks met een toen en nu, de grootste sprong in tijd eerst. */
export function allThenAndNow(media: MediaMeta[]): ThenNow[] {
  const ids = [...new Set(media.filter((m) => m.trickId && !m.deleted).map((m) => m.trickId!))]
  return ids
    .map((id) => thenAndNow(media, id))
    .filter((x): x is ThenNow => !!x)
    .sort((a, b) => b.days - a.days)
}

/** "3 maanden later", "2 weken later", "dezelfde dag" */
export function gapText(days: number): string {
  if (days < 1) return 'dezelfde dag'
  if (days === 1) return '1 dag later'
  if (days < 14) return `${days} dagen later`
  if (days < 60) return `${Math.round(days / 7)} weken later`
  if (days < 365) return `${Math.round(days / 30)} maanden later`
  const y = Math.round((days / 365) * 10) / 10
  return `${String(y).replace('.', ',')} jaar later`
}
