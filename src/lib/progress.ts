// XP, levels en badges. Alles wordt afgeleid uit je data, dus het klopt altijd en
// kan niet uit sync raken met wat je hebt gelogd.
import type { Gear, Goal, MediaMeta, Session, TrickProgress, Trip } from './types'
import { TRICK_BY_ID, trickXP } from '../content/tricks'
import type { IconName } from '../design/icons'

export interface ProgressInput {
  sessions: Session[]
  tricks: TrickProgress[]
  goals: Goal[]
  media: MediaMeta[]
  gear: Gear[]
  trips: Trip[]
  quizBest: number
  quizCorrect: number
  inCrew: boolean
}

export const LEVELS = [
  { name: 'Groentje', xp: 0 },
  { name: 'Valkampioen', xp: 100 },
  { name: 'Zijslipper', xp: 250 },
  { name: 'Falling Leaf', xp: 450 },
  { name: 'Bochtenkoning', xp: 750 },
  { name: 'Cruiser', xp: 1150 },
  { name: 'Carver', xp: 1700 },
  { name: 'Park Rat', xp: 2400 },
  { name: 'Shredder', xp: 3300 },
  { name: 'Powder Hound', xp: 4500 },
  { name: 'Sneeuw Daddy', xp: 6000 },
] as const

export interface LevelInfo {
  level: number // 1-based
  name: string
  xp: number
  current: number // xp binnen dit level
  needed: number // xp nodig voor volgend level (0 = max)
  progress: number // 0..1
  next?: string
}

export function levelFor(xp: number): LevelInfo {
  let idx = 0
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].xp) idx = i
  const cur = LEVELS[idx]
  const nxt = LEVELS[idx + 1]
  const needed = nxt ? nxt.xp - cur.xp : 0
  const current = xp - cur.xp
  return {
    level: idx + 1,
    name: cur.name,
    xp,
    current,
    needed,
    progress: nxt ? Math.min(1, current / needed) : 1,
    next: nxt?.name,
  }
}

const isLanded = (t: TrickProgress) => t.status === 'geland' || t.status === 'beheerst'

export function sessionXP(s: Session) {
  return 50 + Math.round(Math.min(s.hours, 8) * 10) + (s.mediaIds.length ? 10 : 0) + (s.notes || s.highlight ? 5 : 0)
}

export function totalXP(input: ProgressInput): number {
  let xp = 0
  for (const s of input.sessions) xp += sessionXP(s)
  for (const t of input.tricks) {
    const trick = TRICK_BY_ID.get(t.trickId)
    if (!trick) continue
    if (isLanded(t)) xp += trickXP(trick)
    if (t.status === 'beheerst') xp += trick.level * 20
    if (t.mediaIds.length) xp += 10
  }
  xp += input.goals.filter((g) => g.done).length * 30
  xp += Math.min(input.quizCorrect, 500) * 2
  xp += unlockedBadges(input).length * 25
  return xp
}

export interface Badge {
  id: string
  name: string
  desc: string
  icon: IconName
  /** optioneel cijfer/tekst in het medaille (bijv. "10") */
  mark?: string
  test: (i: ProgressInput) => boolean
}

const days = (i: ProgressInput) => new Set(i.sessions.map((s) => s.date)).size
const landed = (i: ProgressInput, id: string) => i.tricks.some((t) => t.trickId === id && isLanded(t))
const landedAny = (i: ProgressInput, pred: (id: string) => boolean) => i.tricks.some((t) => isLanded(t) && pred(t.trickId))
const rode = (i: ProgressInput, c: Session['pistes'][number]) => i.sessions.some((s) => s.pistes.includes(c))

export const BADGES: Badge[] = [
  { id: 'dag-1', name: 'Eerste dag', desc: 'Je eerste dag gelogd', icon: 'board', test: (i) => days(i) >= 1 },
  { id: 'dag-5', name: 'Vijf dagen', desc: '5 dagen op de plank', icon: 'calendar', mark: '5', test: (i) => days(i) >= 5 },
  { id: 'dag-10', name: 'Tien dagen', desc: '10 dagen op de plank', icon: 'calendar', mark: '10', test: (i) => days(i) >= 10 },
  { id: 'dag-25', name: 'Seizoenskaart', desc: '25 dagen op de plank', icon: 'calendar', mark: '25', test: (i) => days(i) >= 25 },
  {
    id: 'uren-50',
    name: 'Liftlegende',
    desc: '50 uur op de piste',
    icon: 'lift',
    mark: '50',
    test: (i) => i.sessions.reduce((a, s) => a + s.hours, 0) >= 50,
  },
  {
    id: 'eerste-bochten',
    name: 'Officieel snowboarder',
    desc: 'Gekoppelde bochten geland',
    icon: 'trail',
    test: (i) => landed(i, 'gekoppelde-bochten'),
  },
  { id: 'eerste-ollie', name: 'Lift-off', desc: 'Je eerste ollie', icon: 'bolt', test: (i) => landed(i, 'ollie') },
  {
    id: 'eerste-grab',
    name: 'Grabber',
    desc: 'Je eerste grab',
    icon: 'sparkle',
    test: (i) => landedAny(i, (id) => id.startsWith('grab-')),
  },
  {
    id: 'eerste-180',
    name: 'Halve draai',
    desc: 'Een 180 geland',
    icon: 'replay',
    mark: '180',
    test: (i) => landedAny(i, (id) => id.includes('180')),
  },
  {
    id: 'eerste-360',
    name: 'Full send',
    desc: 'Een 360 geland',
    icon: 'sync',
    mark: '360',
    test: (i) => landedAny(i, (id) => id.includes('360')),
  },
  {
    id: 'eerste-jib',
    name: 'Jibber',
    desc: 'Je eerste box of rail',
    icon: 'minus',
    test: (i) => landedAny(i, (id) => id.startsWith('box-') || id.startsWith('rail-') || id === 'boardslide'),
  },
  {
    id: 'carver',
    name: 'Corduroy killer',
    desc: 'Je eerste carve',
    icon: 'target',
    test: (i) => landedAny(i, (id) => id.startsWith('carve-')),
  },
  { id: 'blauw', name: 'Blauwtje', desc: 'Je eerste blauwe piste', icon: 'mountain', mark: 'B', test: (i) => rode(i, 'blauw') },
  { id: 'rood', name: 'Rood licht', desc: 'Je eerste rode piste', icon: 'mountain', mark: 'R', test: (i) => rode(i, 'rood') },
  { id: 'zwart', name: 'Black diamond', desc: 'Je eerste zwarte piste', icon: 'mountain', mark: 'Z', test: (i) => rode(i, 'zwart') },
  { id: 'park', name: 'Park rat', desc: 'Een dag in het park', icon: 'kicker', test: (i) => rode(i, 'park') },
  {
    id: 'poeder',
    name: 'Pow day',
    desc: 'Een dag in de poeder',
    icon: 'snowflake',
    test: (i) => i.sessions.some((s) => s.snow === 'poeder'),
  },
  { id: 'ijs', name: 'IJsbreker', desc: 'Overleefd op ijs', icon: 'thermo', test: (i) => i.sessions.some((s) => s.snow === 'ijs') },
  {
    id: 'nul-vallen',
    name: 'Onbreekbaar',
    desc: 'Een dag (2u+) zonder te vallen',
    icon: 'stomp',
    test: (i) => i.sessions.some((s) => s.falls === 0 && s.hours >= 2),
  },
  {
    id: 'yard-sale',
    name: 'Yard sale',
    desc: '20+ keer gevallen op één dag. Respect.',
    icon: 'impact',
    mark: '20',
    test: (i) => i.sessions.some((s) => s.falls >= 20),
  },
  {
    id: 'kluis-5',
    name: 'Kluiswachter',
    desc: '5 tricks met video in je kluis',
    icon: 'vault',
    mark: '5',
    test: (i) => i.tricks.filter((t) => isLanded(t) && t.mediaIds.length > 0).length >= 5,
  },
  { id: 'filmer', name: 'Filmer', desc: "10 foto's of video's", icon: 'video', mark: '10', test: (i) => i.media.length >= 10 },
  { id: 'quiz', name: 'Wandelend woordenboek', desc: '10/10 in de quiz', icon: 'quiz', mark: '10', test: (i) => i.quizBest >= 10 },
  { id: 'gear', name: 'Gear nerd', desc: '3 stuks gear toegevoegd', icon: 'sliders', test: (i) => i.gear.length >= 3 },
  {
    id: 'ingepakt',
    name: 'Ingepakt',
    desc: 'Paklijst 100% af',
    icon: 'suitcase',
    test: (i) => i.trips.some((t) => t.packing.length > 0 && t.packing.every((p) => p.checked)),
  },
  { id: 'doel', name: 'Doelgericht', desc: 'Je eerste doel gehaald', icon: 'target', test: (i) => i.goals.some((g) => g.done) },
  { id: 'crew', name: 'Crew', desc: 'Lid van een crew', icon: 'crew', test: (i) => i.inCrew },
]

export function unlockedBadges(input: ProgressInput): Badge[] {
  return BADGES.filter((b) => b.test(input))
}

export interface Stats {
  days: number
  hours: number
  falls: number
  fallsPerHour: number
  tricksLanded: number
  avgMood: number
  resorts: number
}

export function stats(input: ProgressInput): Stats {
  const s = input.sessions
  const hours = s.reduce((a, x) => a + x.hours, 0)
  const falls = s.reduce((a, x) => a + x.falls, 0)
  return {
    days: days(input),
    hours,
    falls,
    fallsPerHour: hours ? falls / hours : 0,
    tricksLanded: input.tricks.filter(isLanded).length,
    avgMood: s.length ? s.reduce((a, x) => a + x.mood, 0) / s.length : 0,
    resorts: new Set(s.map((x) => x.resortId || x.resortName)).size,
  }
}
