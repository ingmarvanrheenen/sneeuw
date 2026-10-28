import { describe, expect, it } from 'vitest'
import { BADGES, levelFor, longestStreak, totalXP, unlockedBadges, LEVELS, type ProgressInput } from '../lib/progress'
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

describe('zeldzame stickers', () => {
  const rare = (sessions: Session[]) =>
    unlockedBadges({ ...base, sessions })
      .filter((b) => b.rare)
      .map((b) => b.id)
  const at = (h: number) => new Date(2026, 11, 20, h, 30).getTime()

  it('een gewone dag levert niks zeldzaams op', () => {
    expect(rare([session()])).toEqual([])
  })

  it('elke zeldzame sticker heeft een hint, een naam en een uitleg', () => {
    const all = BADGES.filter((b) => b.rare)
    expect(all.length).toBeGreaterThanOrEqual(10)
    for (const b of all) expect(b.hint && b.name && b.desc, b.id).toBeTruthy()
    // ids zijn uniek, ook tussen gewone en zeldzame
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length)
  })

  it('vroege vogel: gelogd tussen 4 en 8 uur in de ochtend', () => {
    expect(rare([session({ createdAt: at(7) })])).toEqual(['vroege-vogel'])
    expect(rare([session({ createdAt: at(8) })])).toEqual([])
    // midden in de nacht telt niet als vroeg
    expect(rare([session({ createdAt: at(2) })])).toEqual([])
  })

  it('kou, lachend vallen, marathon en regenboog', () => {
    expect(rare([session({ tempC: -15 })])).toEqual(['ijskonijn'])
    expect(rare([session({ tempC: -14 })])).toEqual([])
    expect(rare([session({ falls: 20, mood: 5 })])).toEqual(['lachend-vallen'])
    expect(rare([session({ falls: 20, mood: 4 })])).toEqual([])
    expect(rare([session({ hours: 8 })])).toEqual(['marathon'])
    expect(rare([session({ pistes: ['groen', 'blauw', 'rood', 'zwart'] })])).toEqual(['regenboog'])
    expect(rare([session({ pistes: ['groen', 'blauw', 'rood'] })])).toEqual([])
  })

  it('datums: vrijdag de 13e en oud en nieuw', () => {
    // 13 februari 2026 is een vrijdag, 13 januari 2026 een dinsdag
    expect(rare([session({ date: '2026-02-13' })])).toEqual(['vrijdag-13'])
    expect(rare([session({ date: '2026-01-13' })])).toEqual([])
    expect(rare([session({ date: '2026-12-31' })])).toEqual(['nieuwjaar'])
    expect(rare([session({ date: '2027-01-01' })])).toEqual(['nieuwjaar'])
  })

  it('weer: mist zonder vallen, regen met goede mood', () => {
    expect(rare([session({ weather: 'mist', falls: 0, hours: 2 })])).toEqual(['mist-ninja'])
    expect(rare([session({ weather: 'mist', falls: 1, hours: 4 })])).toEqual([])
    expect(rare([session({ weather: 'regen', hours: 3, mood: 4 })])).toEqual(['natte-kat'])
    expect(rare([session({ pains: ['Pols', 'Knie', 'Stuitje'], mood: 4 })])).toEqual(['pijn-is-fijn'])
  })

  it('zeven dagen achter elkaar, ook over een maandgrens; een gat breekt de reeks', () => {
    const week = ['2026-12-28', '2026-12-29', '2026-12-30', '2027-01-02', '2027-01-03']
    expect(longestStreak(week)).toBe(3)
    const dates = ['2027-01-28', '2027-01-29', '2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02', '2027-02-03']
    expect(longestStreak(dates)).toBe(7)
    expect(rare(dates.map((date) => session({ date })))).toContain('zeven-op-een-rij')
    // dubbel gelogde dag telt één keer
    expect(longestStreak(['2027-01-01', '2027-01-01', '2027-01-02'])).toBe(2)
  })

  it('zeldzame stickers tellen mee voor XP, net als gewone badges', () => {
    const plain = totalXP({ ...base, sessions: [session({ hours: 7 })] })
    const marathon = totalXP({ ...base, sessions: [session({ hours: 8 })] })
    // 1 uur meer (10 XP) plus de sticker (25 XP)
    expect(marathon - plain).toBe(35)
  })
})
