// Rider-profiel: je skipas, stickerboek en eerlijke stats. Alles wat te tellen valt wordt afgeleid
// (uit progress.ts voor jezelf, uit de gesyncte stats voor je crew), nooit los opgeslagen.
import { TRICKS, TRACKS, type Trick, type Track } from '../content/tricks'
import type { ProgressInput } from './progress'
import type { Progress } from './useProgress'

/** Wat je crew van je ziet. Gaat mee met je profiel bij elke sync (`profiles.stats`). */
export interface RiderStats {
  xp: number
  level: number
  levelName: string
  days: number
  hours: number
  tricksLanded: number
  falls: number
  badges: number
  /** trick-ids die je geland hebt (je stickerboek) */
  landed: string[]
  badgeIds: string[]
  /** meeste uren op één dag */
  bestDay: number
  /** meeste valpartijen op één dag */
  worstFalls: number
  /** datum van je eerste dag met een rode piste */
  firstRed?: string
  resorts: number
}

const isLanded = (s: string) => s === 'geland' || s === 'beheerst'

export function riderStats(p: Progress): RiderStats {
  const sessions = p.input.sessions
  const reds = sessions
    .filter((s) => s.pistes?.includes('rood'))
    .map((s) => s.date)
    .sort()
  return {
    xp: p.xp,
    level: p.level.level,
    levelName: p.level.name,
    days: p.stats.days,
    hours: p.stats.hours,
    tricksLanded: p.stats.tricksLanded,
    falls: p.stats.falls,
    badges: p.badges.length,
    landed: landedIds(p.input),
    badgeIds: p.badges.map((b) => b.id),
    bestDay: Math.max(0, ...sessions.map((s) => s.hours || 0)),
    worstFalls: Math.max(0, ...sessions.map((s) => s.falls || 0)),
    firstRed: reds[0],
    resorts: p.stats.resorts,
  }
}

export function landedIds(input: Pick<ProgressInput, 'tricks'>): string[] {
  return [...new Set(input.tricks.filter((t) => isLanded(t.status)).map((t) => t.trickId))]
}

/** Seizoen van een datum: juli t/m juni, de pas is geldig t/m 30 april. */
export function seasonFor(d: Date): { label: string; until: string } {
  const y = d.getFullYear()
  const start = d.getMonth() >= 6 ? y : y - 1
  return { label: `${String(start).slice(2)}/${String(start + 1).slice(2)}`, until: `${start + 1}-04-30` }
}

/** Pasnummer uit je user-id, zoals op een echte skipas. Zonder account: lokaal. */
export function passNumber(userId: string | null | undefined): string {
  const hex = (userId ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase()
  return hex.length >= 8 ? `${hex.slice(0, 4)} ${hex.slice(4, 8)}` : 'LOKAAL'
}

/** Streepjescode-breedtes (1-3) uit een tekst: elke pas zijn eigen code. */
export function barcode(seed: string, bars = 34): number[] {
  let h = 2166136261
  for (const c of seed || 'sneeuw') h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return Array.from({ length: bars }, () => {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
    return 1 + ((h >>> 0) % 3)
  })
}

export interface StickerTrack {
  track: Track
  name: string
  stickers: { trick: Trick; landed: boolean }[]
  landed: number
}

/** Het stickerboek: per track welke tricks je verdiend hebt en welke plekken nog leeg zijn. */
export function stickerBook(landed: string[]): { tracks: StickerTrack[]; landed: number; total: number } {
  const set = new Set(landed)
  const tracks = TRACKS.map((t) => {
    const stickers = TRICKS.filter((x) => x.track === t.id).map((trick) => ({ trick, landed: set.has(trick.id) }))
    return { track: t.id, name: t.name, stickers, landed: stickers.filter((s) => s.landed).length }
  })
  return { tracks, landed: tracks.reduce((n, t) => n + t.landed, 0), total: TRICKS.length }
}

/** Pistekleur bij de moeilijkheid van een trick (1 groen ... 4-5 zwart). */
export function trickPiste(level: Trick['level']): 'groen' | 'blauw' | 'rood' | 'zwart' {
  return level <= 1 ? 'groen' : level === 2 ? 'blauw' : level === 3 ? 'rood' : 'zwart'
}
