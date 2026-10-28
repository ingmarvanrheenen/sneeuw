import { describe, expect, it } from 'vitest'
import { LINES, bingoCard, bingoPlayer, bingoStand, type BingoTick } from '../lib/bingo'
import { BINGO_SIZE, BINGO_SQUARES } from '../content/bingo'

const tick = (user_id: string, square: string, minute: number): BingoTick => ({
  user_id,
  square,
  created_at: new Date(Date.UTC(2027, 0, 16, 10, minute)).toISOString(),
})

describe('bingo-content', () => {
  it('genoeg vakjes, unieke ids, kort genoeg voor een vakje, geen emoji', () => {
    expect(BINGO_SQUARES.length).toBeGreaterThanOrEqual(BINGO_SIZE * BINGO_SIZE * 2)
    expect(new Set(BINGO_SQUARES.map((s) => s.id)).size).toBe(BINGO_SQUARES.length)
    for (const s of BINGO_SQUARES) {
      expect(s.id).toMatch(/^[a-z0-9-]{1,40}$/)
      expect(s.text.length, s.id).toBeLessThanOrEqual(42)
      expect(s.text).not.toMatch(/\p{Extended_Pictographic}/u)
      // een woord langer dan ±11 tekens past niet in een vakje, tenzij het een afbreekpunt heeft
      for (const w of s.text.split(/[\s:]+/))
        expect(
          w.split(/[\u00ad-]/).every((part) => part.length <= 11),
          `${s.id}: ${w}`,
        ).toBe(true)
    }
  })
})

describe('bingokaart', () => {
  it('zelfde trip en speler: altijd dezelfde kaart; andere speler: een andere', () => {
    const a = bingoCard('trip1', 'ik')
    expect(a).toHaveLength(16)
    expect(new Set(a.map((s) => s.id)).size).toBe(16)
    expect(bingoCard('trip1', 'ik')).toEqual(a)
    expect(bingoCard('trip1', 'daan').map((s) => s.id)).not.toEqual(a.map((s) => s.id))
    expect(bingoCard('trip2', 'ik').map((s) => s.id)).not.toEqual(a.map((s) => s.id))
  })

  it('tien lijnen: vier rijen, vier kolommen, twee diagonalen', () => {
    expect(LINES).toHaveLength(10)
    expect(LINES[0]).toEqual([0, 1, 2, 3])
    expect(LINES[4]).toEqual([0, 4, 8, 12])
    expect(LINES[8]).toEqual([0, 5, 10, 15])
    expect(LINES[9]).toEqual([3, 6, 9, 12])
  })
})

describe('bingo', () => {
  const card = bingoCard('t1', 'ik')
  const row = (r: number) => card.slice(r * 4, r * 4 + 4).map((s) => s.id)

  it('drie van een rij is nog geen bingo, vier wel', () => {
    const three = row(0)
      .slice(0, 3)
      .map((id, i) => tick('ik', id, i))
    expect(bingoPlayer('t1', 'ik', three).bingoAt).toBeNull()
    const four = row(0).map((id, i) => tick('ik', id, i))
    const p = bingoPlayer('t1', 'ik', four)
    expect(p.bingoAt).toBe(four[3].created_at)
    expect([...p.lineCells].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
    expect(p.full).toBe(false)
  })

  it('diagonaal telt ook', () => {
    const diag = [0, 5, 10, 15].map((i, k) => tick('ik', card[i].id, k))
    expect(bingoPlayer('t1', 'ik', diag).bingoAt).not.toBeNull()
  })

  it('vakjes die niet op jouw kaart staan, of van een ander zijn, tellen niet', () => {
    const notMine = BINGO_SQUARES.filter((s) => !card.some((c) => c.id === s.id)).slice(0, 4)
    const p = bingoPlayer('t1', 'ik', [...notMine.map((s, i) => tick('ik', s.id, i)), ...row(1).map((id, i) => tick('daan', id, i))])
    expect(p.ticked.size).toBe(0)
  })

  it('wie als eerste een volle lijn had wint, ook als een ander meer vakjes heeft', () => {
    const daanCard = bingoCard('t1', 'daan')
    // vier open vakjes, één per rij en kolom en op beide diagonalen: twaalf vinkjes zonder volle lijn
    const gaps = [0, 6, 11, 13]
    const ticks = [
      ...daanCard.filter((_, i) => !gaps.includes(i)).map((s, i) => tick('daan', s.id, i)),
      // om 10:30 maakt daan zijn eerste lijn vol
      tick('daan', daanCard[0].id, 30),
      // ik: één rij, vol om 10:20
      ...row(2).map((id, i) => tick('ik', id, 17 + i)),
    ]
    expect(bingoPlayer('t1', 'daan', ticks.slice(0, 12)).bingoAt).toBeNull()
    const s = bingoStand('t1', ['ik', 'daan', 'sem'], ticks)
    expect(s.first).toBe('ik')
    expect(s.players.find((p) => p.userId === 'daan')!.ticked.size).toBe(13)
    expect(s.players.find((p) => p.userId === 'sem')!.ticked.size).toBe(0)
  })

  it('niemand bingo: geen winnaar', () => {
    expect(bingoStand('t1', ['ik', 'daan'], []).first).toBeNull()
  })
})
