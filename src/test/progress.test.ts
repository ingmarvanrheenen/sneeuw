import { describe, expect, it } from 'vitest'
import { levelFor, totalXP, unlockedBadges, LEVELS, type ProgressInput } from '../lib/progress'
import type { Session, TrickProgress } from '../lib/types'

const base: ProgressInput = {
  sessions: [],
  tricks: [],
  goals: [],
  media: [],
  gear: [],
  trips: [],
  quizBest: 0,
  quizCorrect: 0,
  inCrew: false,
}

const session = (over: Partial<Session> = {}): Session => ({
  id: crypto.randomUUID(),
  kind: 'session',
  userId: null,
  createdAt: 0,
  updatedAt: 0,
  date: '2026-12-20',
  resortName: 'Val Thorens',
  pistes: ['blauw'],
  hours: 5,
  falls: 3,
  mood: 4,
  practiced: [],
  landed: [],
  pains: [],
  buddies: [],
  mediaIds: [],
  ...over,
})

const trick = (trickId: string, status: TrickProgress['status']): TrickProgress => ({
  id: crypto.randomUUID(),
  kind: 'trick',
  userId: null,
  createdAt: 0,
  updatedAt: 0,
  trickId,
  status,
  mediaIds: [],
})

describe('levels', () => {
  it('begint als Groentje en eindigt als Sneeuw Daddy', () => {
    expect(levelFor(0).name).toBe('Groentje')
    expect(levelFor(LEVELS.at(-1)!.xp + 5000).name).toBe('Sneeuw Daddy')
    expect(levelFor(LEVELS.at(-1)!.xp).progress).toBe(1)
  })
  it('rekent voortgang binnen een level', () => {
    const l = levelFor(LEVELS[1].xp + (LEVELS[2].xp - LEVELS[1].xp) / 2)
    expect(l.level).toBe(2)
    expect(l.progress).toBeCloseTo(0.5)
  })
})

describe('xp en badges', () => {
  it('geeft xp voor dagen en gelande tricks', () => {
    const none = totalXP(base)
    const withDay = totalXP({ ...base, sessions: [session()] })
    expect(withDay).toBeGreaterThan(none)
    const withTrick = totalXP({ ...base, sessions: [session()], tricks: [trick('ollie', 'geland')] })
    expect(withTrick).toBeGreaterThan(withDay)
  })
  it('telt alleen gelande tricks voor badges', () => {
    expect(unlockedBadges({ ...base, tricks: [trick('ollie', 'bezig')] }).map((b) => b.id)).not.toContain('eerste-ollie')
    expect(unlockedBadges({ ...base, tricks: [trick('ollie', 'geland')] }).map((b) => b.id)).toContain('eerste-ollie')
  })
  it('vindt de dag-zonder-vallen badge', () => {
    const ids = unlockedBadges({ ...base, sessions: [session({ falls: 0, hours: 3 })] }).map((b) => b.id)
    expect(ids).toContain('nul-vallen')
    expect(ids).toContain('dag-1')
  })
})
