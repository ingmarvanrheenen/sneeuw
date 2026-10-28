import { describe, expect, it } from 'vitest'
import { crewAwards } from '../lib/awards'
import { voteResult, type Vote } from '../lib/crewTrips'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { Session } from '../lib/types'

const day = (user_id: string, date: string, over: Partial<Session> = {}) => ({
  user_id,
  data: { ...EMPTY_DRAFT, id: user_id + date, kind: 'session', createdAt: 0, updatedAt: 0, date, hours: 4, mood: 3, ...over } as Session,
})
const get = (days: ReturnType<typeof day>[], id: string) => crewAwards(days).find((a) => a.id === id)

describe('crew-awards', () => {
  it('alleen met minstens twee riders', () => {
    expect(crewAwards([day('ik', '2027-01-16', { hours: 6, falls: 3 })])).toEqual([])
  })

  it('uren, vallen en tricks gaan naar wie het meest heeft', () => {
    const days = [
      day('ik', '2027-01-16', { hours: 6, falls: 1, landed: ['ollie', 'nollie'] }),
      day('ik', '2027-01-17', { hours: 5, falls: 0, landed: ['ollie'] }),
      day('daan', '2027-01-16', { hours: 4, falls: 9, landed: ['shifty'] }),
    ]
    expect(get(days, 'uren')).toMatchObject({ userIds: ['ik'], value: '11 u' })
    expect(get(days, 'vallen')).toMatchObject({ userIds: ['daan'], value: '9x' })
    // ollie twee keer geland telt als één trick
    expect(get(days, 'tricks')).toMatchObject({ userIds: ['ik'], value: '2 tricks' })
    expect(get(days, 'trouw')).toMatchObject({ userIds: ['ik'], value: '2 dagen' })
  })

  it('gelijkspel: samen winnen; iedereen gelijk of niemand iets: geen award', () => {
    const days = [day('ik', '2027-01-16', { falls: 3 }), day('daan', '2027-01-16', { falls: 3 }), day('sem', '2027-01-16', { falls: 1 })]
    expect(get(days, 'vallen')?.userIds).toEqual(['ik', 'daan'])
    // iedereen 4 uur en niemand op zwart
    expect(get(days, 'uren')).toBeUndefined()
    expect(get(days, 'zwart')).toBeUndefined()
  })

  it('eerste nieuwe trick: wie het vroegst in de trip iets landde, met de naam van de trick', () => {
    const days = [
      day('ik', '2027-01-18', { landed: ['nollie'] }),
      day('daan', '2027-01-16'),
      day('daan', '2027-01-17', { landed: ['ollie', 'shifty'] }),
    ]
    expect(get(days, 'eerste')).toMatchObject({ userIds: ['daan'], value: 'Ollie' })
  })

  it('minste vallen per uur alleen voor wie echt gereden heeft (3 uur of meer)', () => {
    const days = [
      day('ik', '2027-01-16', { hours: 8, falls: 2 }),
      day('daan', '2027-01-16', { hours: 6, falls: 6 }),
      // één uurtje zonder vallen telt niet mee
      day('sem', '2027-01-16', { hours: 1, falls: 0 }),
    ]
    expect(get(days, 'plakband')).toMatchObject({ userIds: ['ik'], value: '0,3 per uur' })
  })

  it('mood, zwarte pistes, poeder en pijntjes', () => {
    const days = [
      day('ik', '2027-01-16', { mood: 5, pistes: ['zwart', 'rood'], snow: 'poeder', pains: ['Pols', 'Knie'] }),
      day('ik', '2027-01-17', { mood: 4, pistes: ['zwart'], snow: 'groomed' }),
      day('daan', '2027-01-16', { mood: 2, pistes: ['blauw'], snow: 'vers', pains: ['Stuitje'] }),
      day('daan', '2027-01-17', { mood: 3, pistes: ['blauw'], snow: 'vers' }),
    ]
    expect(get(days, 'mood')).toMatchObject({ userIds: ['ik'], value: '4,5 gemiddeld' })
    expect(get(days, 'zwart')).toMatchObject({ userIds: ['ik'], value: '2 dagen' })
    expect(get(days, 'poeder')).toMatchObject({ userIds: ['daan'], value: '2 dagen' })
    expect(get(days, 'pijn')).toMatchObject({ userIds: ['ik'], value: '2x' })
  })
})

describe('stemmen tellen', () => {
  const v = (category: Vote['category'], voter: string, candidate: string): Vote => ({ category, voter, candidate })

  it('per categorie, met wie (samen) bovenaan staat', () => {
    const votes = [
      v('val', 'ik', 'daan'),
      v('val', 'sem', 'daan'),
      v('val', 'daan', 'sem'),
      v('held', 'ik', 'sem'),
      v('held', 'daan', 'ik'),
    ]
    expect(voteResult(votes, 'val')).toEqual({ counts: { daan: 2, sem: 1 }, leaders: ['daan'], max: 2, total: 3 })
    expect(voteResult(votes, 'held').leaders.sort()).toEqual(['ik', 'sem'])
    expect(voteResult([], 'val')).toEqual({ counts: {}, leaders: [], max: 0, total: 0 })
  })
})
