import { describe, expect, it } from 'vitest'
import { crewGoal, crewGoalProgress, weekOf, type CrewGoal } from '../lib/crewGoal'
import type { PisteColor } from '../lib/types'

const day = (userId: string, date: string, over: { hours?: number; landed?: string[]; pistes?: PisteColor[] } = {}) => ({
  userId,
  session: { date, hours: over.hours ?? 0, landed: over.landed ?? [], pistes: over.pistes ?? [] },
})
const week = weekOf('2027-01-14') // donderdag

describe('week', () => {
  it('maandag t/m zondag, met de maandag als sleutel; zondag hoort bij de week ervoor', () => {
    expect(week).toEqual({ from: '2027-01-11', to: '2027-01-17', key: '2027-01-11', daysLeft: 3 })
    expect(weekOf('2027-01-17')).toMatchObject({ key: '2027-01-11', daysLeft: 0 })
    expect(weekOf('2027-01-18')).toMatchObject({ key: '2027-01-18', daysLeft: 6 })
    // over een jaargrens
    expect(weekOf('2027-01-01')).toMatchObject({ from: '2026-12-28', to: '2027-01-03' })
  })
})

describe('doel van de week', () => {
  it('zelfde crew en week: zelfde doel; het schaalt mee met de crew', () => {
    expect(crewGoal('c1', '2027-01-11', 4)).toEqual(crewGoal('c1', '2027-01-11', 4))
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => crewGoal(`c${i}`, '2027-01-11', 3).kind))
    expect(kinds.size).toBe(5)
    for (let i = 0; i < 40; i++) {
      const g = crewGoal(`c${i}`, '2027-01-11', 3)
      expect(g.target).toBe({ uren: 12, dagen: 6, tricks: 6, rood: 6, iedereen: 3 }[g.kind])
    }
  })

  it('in je eentje telt hij als twee (anders is het te makkelijk), behalve "iedereen": dat ben jij dan', () => {
    for (let i = 0; i < 40; i++) {
      const g = crewGoal(`c${i}`, '2027-01-11', 1)
      expect(g.target).toBe(g.kind === 'iedereen' ? 1 : g.kind === 'uren' ? 8 : 4)
    }
  })
})

describe('voortgang', () => {
  const g = (kind: CrewGoal['kind'], target: number): CrewGoal => ({ kind, title: '', target, unit: '' })

  it('uren: per rider opgeteld, alleen deze week, dubbele dag één keer', () => {
    const p = crewGoalProgress(
      g('uren', 12),
      [
        day('daan', '2027-01-12', { hours: 5.5 }),
        day('daan', '2027-01-12', { hours: 5.5 }),
        day('sem', '2027-01-13', { hours: 4 }),
        day('sem', '2027-01-04', { hours: 9 }),
      ],
      week,
    )
    expect(p).toEqual({
      value: 9.5,
      target: 12,
      done: false,
      perMember: [
        { userId: 'daan', value: 5.5 },
        { userId: 'sem', value: 4 },
      ],
    })
  })

  it('tricks: dezelfde trick twee keer geland telt één keer; rood: alleen dagen met rood of zwart', () => {
    const tricks = crewGoalProgress(
      g('tricks', 3),
      [
        day('daan', '2027-01-12', { landed: ['ollie'] }),
        day('daan', '2027-01-13', { landed: ['ollie', 'shifty'] }),
        day('sem', '2027-01-13', { landed: ['ollie'] }),
      ],
      week,
    )
    expect(tricks).toMatchObject({ value: 3, done: true })
    const rood = crewGoalProgress(
      g('rood', 4),
      [
        day('daan', '2027-01-12', { pistes: ['blauw'] }),
        day('daan', '2027-01-13', { pistes: ['zwart'] }),
        day('sem', '2027-01-13', { pistes: ['rood', 'park'] }),
      ],
      week,
    )
    expect(rood.value).toBe(2)
  })

  it('iedereen: telt riders met minstens één dag', () => {
    const p = crewGoalProgress(g('iedereen', 3), [day('daan', '2027-01-12'), day('daan', '2027-01-13'), day('sem', '2027-01-13')], week)
    expect(p).toMatchObject({ value: 2, done: false })
  })
})
