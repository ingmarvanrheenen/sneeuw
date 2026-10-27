import { useLiveQuery } from 'dexie-react-hooks'
import { db, kvGet } from './db'
import { levelFor, stats, totalXP, unlockedBadges, type ProgressInput } from './progress'
import { riderStats } from './rider'
import type { AnyRecord, Gear, Goal, MediaMeta, Session, TrickProgress, Trip } from './types'

export async function loadProgressInput(): Promise<ProgressInput> {
  const all = (await db.records.toArray()).filter((r) => !r.deleted)
  const of = <T extends AnyRecord>(k: AnyRecord['kind']) => all.filter((r) => r.kind === k) as T[]
  return {
    sessions: of<Session>('session'),
    tricks: of<TrickProgress>('trick'),
    goals: of<Goal>('goal'),
    media: of<MediaMeta>('media'),
    gear: of<Gear>('gear'),
    trips: of<Trip>('trip'),
    quizBest: await kvGet('quizBest', 0),
    quizCorrect: await kvGet('quizCorrect', 0),
    inCrew: await kvGet('inCrew', false),
  }
}

export function computeProgress(input: ProgressInput) {
  const xp = totalXP(input)
  return { input, xp, level: levelFor(xp), badges: unlockedBadges(input), stats: stats(input) }
}

export type Progress = ReturnType<typeof computeProgress>

export function useProgress(): Progress | undefined {
  return useLiveQuery(async () => computeProgress(await loadProgressInput()), [])
}

/** Stats die je crew ziet: leaderboard en je rider-profiel. */
export async function crewStats() {
  return riderStats(computeProgress(await loadProgressInput()))
}
