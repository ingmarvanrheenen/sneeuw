import { describe, expect, it } from 'vitest'
import { layout, pickEntries, quorum, roundName, type BracketVote } from '../lib/tournament'

const v = (round: number, match: number, voter: string, pick: string): BracketVote => ({ round, match, voter, pick })

describe('clips kiezen', () => {
  it("video's eerst, max 8, zelfde trip = zelfde volgorde", () => {
    const media = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, type: 'video' as const })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, type: 'image' as const })),
    ]
    const a = pickEntries(media, 't1')
    expect(a).toHaveLength(8)
    expect(a.slice(0, 6).every((id) => id.startsWith('v'))).toBe(true)
    expect(pickEntries(media, 't1')).toEqual(a)
  })
})

describe('bracket', () => {
  it('quorum: de helft van de crew, naar boven, minstens 1', () => {
    expect([1, 2, 3, 4, 5].map(quorum)).toEqual([1, 1, 2, 2, 3])
  })

  it('3 clips: een bye gaat vanzelf door; finale pas als de halve finale beslist is', () => {
    const { rounds, champion } = layout(['A', 'B', 'C'], [], 4)
    expect(rounds).toHaveLength(2)
    expect(rounds[0][0]).toMatchObject({ a: 'A', b: 'B', open: true, decided: false })
    expect(rounds[0][1]).toMatchObject({ a: 'C', b: null, winner: 'C', decided: true, open: false })
    // finale: A of B is nog niet bekend
    expect(rounds[1][0]).toMatchObject({ a: undefined, b: 'C', open: false })
    expect(champion).toBeNull()
  })

  it('meeste stemmen gaat door zodra de helft van de crew stemde; gelijk = de eerste', () => {
    let r = layout(['A', 'B'], [v(0, 0, 'x', 'B')], 4)
    expect(r.rounds[0][0]).toMatchObject({ votesB: 1, winner: 'B', decided: false, open: true })
    r = layout(['A', 'B'], [v(0, 0, 'x', 'B'), v(0, 0, 'y', 'A')], 4)
    expect(r.rounds[0][0]).toMatchObject({ winner: 'A', decided: true })
    expect(r.champion).toBe('A')
  })

  it('hele toernooi met 5 clips (8 plekken) tot een winnaar; stemmen op een clip die niet in het duel zit tellen niet', () => {
    const e = ['A', 'B', 'C', 'D', 'E']
    const votes = [
      v(0, 0, 'x', 'B'),
      v(0, 1, 'x', 'D'),
      v(0, 1, 'y', 'A'), // telt niet: A zit niet in dit duel
      // C-D en E-bye
      v(1, 0, 'x', 'D'),
      v(1, 1, 'x', 'E'),
      v(2, 0, 'x', 'D'),
    ]
    const { rounds, champion } = layout(e, votes, 2)
    expect(rounds.map((r) => r.length)).toEqual([4, 2, 1])
    expect(rounds[0][1]).toMatchObject({ votesA: 0, votesB: 1, winner: 'D' })
    expect(rounds[0][2]).toMatchObject({ a: 'E', b: null, winner: 'E' })
    // twee lege plekken blijven leeg, geen "nog niet bekend"
    expect(rounds[0][3]).toMatchObject({ a: null, b: null, decided: false })
    expect(rounds[1][1]).toMatchObject({ a: 'E', b: null, winner: 'E', decided: true })
    expect(rounds[2][0]).toMatchObject({ a: 'D', b: 'E', winner: 'D' })
    expect(champion).toBe('D')
  })

  it('namen van de rondes', () => {
    expect([0, 1, 2].map((r) => roundName(r, 3))).toEqual(['Kwartfinale', 'Halve finale', 'Finale'])
    expect(roundName(0, 1)).toBe('Finale')
  })
})
