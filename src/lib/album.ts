// Stickerboek: je badges en trick-stickers per seizoen, als album. Helemaal afgeleid (niks opgeslagen): we
// spelen je data seizoen voor seizoen af en kijken welke badges er in dat seizoen voor het eerst bij kwamen.
// Een trick-sticker hoort bij het seizoen waarin je hem voor het eerst landde. Wat geen datum heeft (quiz,
// liftvragen, crew, oude tricks zonder datum) telt in het huidige seizoen.
import { BADGES, isLanded, unlockedBadges, type Badge, type ProgressInput } from './progress'
import { TRICK_BY_ID, TRICKS, type Trick } from '../content/tricks'
import { seasonOf } from './format'
import { todayISO } from './ids'

export interface SeasonPage {
  season: string
  badges: Badge[]
  tricks: Trick[]
  days: number
  hours: number
  current: boolean
}

/** Laatste dag van een seizoen ("25/26" → "2026-06-30"). */
export const seasonEnd = (season: string) => `20${season.slice(3)}-06-30`
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Je data zoals die was aan het eind van een seizoen. `last`: het huidige seizoen, dan telt alles. */
export function inputUntil(input: ProgressInput, season: string, last: boolean): ProgressInput {
  if (last) return input
  const end = seasonEnd(season)
  const before = (ms: number) => iso(ms) <= end
  return {
    sessions: input.sessions.filter((s) => s.date <= end),
    // alleen gelande tricks met een datum in of voor dit seizoen tellen als geland
    tricks: input.tricks.map((t) => (isLanded(t) && !(t.firstLandedAt && t.firstLandedAt <= end) ? { ...t, status: 'bezig' as const } : t)),
    goals: input.goals.map((g) => (g.done && !(g.doneAt && before(g.doneAt)) ? { ...g, done: false } : g)),
    media: input.media.filter((m) => before(m.createdAt)),
    gear: input.gear.filter((g) => before(g.createdAt)),
    trips: input.trips.filter((t) => before(t.createdAt)),
    quizBest: 0,
    quizCorrect: 0,
    inCrew: false,
    liftBest: 0,
    challengesDone: 0,
  }
}

/** Alle seizoenen met iets erin, plus het huidige; oudste eerst. */
export function seasonsOf(input: ProgressInput, today = todayISO()): string[] {
  const set = new Set([seasonOf(today)])
  for (const s of input.sessions) set.add(seasonOf(s.date))
  for (const t of input.tricks) if (isLanded(t) && t.firstLandedAt) set.add(seasonOf(t.firstLandedAt))
  return [...set].sort()
}

export function album(input: ProgressInput, today = todayISO()): SeasonPage[] {
  const seasons = seasonsOf(input, today)
  const now = seasonOf(today)
  let had = new Set<string>()
  return seasons.map((season) => {
    const last = season === seasons.at(-1)
    const got = new Set(unlockedBadges(inputUntil(input, season, last)).map((b) => b.id))
    const badges = BADGES.filter((b) => got.has(b.id) && !had.has(b.id))
    had = new Set([...had, ...got])
    const tricks = input.tricks
      .filter((t) => isLanded(t) && TRICK_BY_ID.has(t.trickId) && (t.firstLandedAt ? seasonOf(t.firstLandedAt) === season : last))
      .map((t) => TRICK_BY_ID.get(t.trickId)!)
      .sort((a, b) => b.level - a.level || TRICKS.indexOf(a) - TRICKS.indexOf(b))
    const sessions = input.sessions.filter((s) => seasonOf(s.date) === season)
    return {
      season,
      badges,
      tricks,
      days: new Set(sessions.map((s) => s.date)).size,
      hours: sessions.reduce((n, s) => n + s.hours, 0),
      current: season === now,
    }
  })
}

/** Hoeveel stickers er in totaal te halen zijn, en hoeveel je er hebt. */
export function albumTotals(pages: SeasonPage[]) {
  return {
    have: pages.reduce((n, p) => n + p.badges.length + p.tricks.length, 0),
    total: BADGES.length + TRICKS.length,
  }
}
