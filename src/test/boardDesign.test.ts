import { describe, expect, it } from 'vitest'
import { boardStyle, checkDesign, isDarkBoard, randomDesign } from '../lib/boardDesign'
import { BOARD_COLORS, BOARD_PATTERNS } from '../content/boards'

const HEX = new Set(BOARD_COLORS.map((c) => c.hex))

describe('board-ontwerp', () => {
  it('geldig ontwerp blijft staan', () => {
    expect(checkDesign({ pattern: 'stippen', base: 'zwart', accent: 'lime' })).toEqual({
      pattern: 'stippen',
      base: 'zwart',
      accent: 'lime',
    })
  })

  it('rommel uit een profiel wordt null: onbekend patroon, kleurwaarden, css-injectie', () => {
    expect(checkDesign(undefined)).toBeNull()
    expect(checkDesign('strepen')).toBeNull()
    expect(checkDesign({ pattern: 'regenboog', base: 'zwart', accent: 'lime' })).toBeNull()
    expect(checkDesign({ pattern: 'effen', base: '#ff0000', accent: 'lime' })).toBeNull()
    expect(checkDesign({ pattern: 'effen', base: 'zwart', accent: 'red; background:url(https://x)' })).toBeNull()
    // extra velden vallen weg
    expect(checkDesign({ pattern: 'effen', base: 'zwart', accent: 'lime', style: 'x' })).toEqual({
      pattern: 'effen',
      base: 'zwart',
      accent: 'lime',
    })
  })

  it('elk patroon: basiskleur als achtergrond, alleen kleuren uit het palet', () => {
    for (const p of BOARD_PATTERNS) {
      const st = boardStyle({ pattern: p.id, base: 'nacht', accent: 'oranje' })
      expect(st.backgroundColor, p.id).toBe('#1d2a4d')
      const used = `${st.backgroundImage ?? ''}`.match(/#[0-9a-f]{6}/gi) ?? []
      for (const h of used) expect(HEX.has(h), `${p.id}: ${h}`).toBe(true)
      if (p.id !== 'effen') expect(st.backgroundImage, p.id).toBeTruthy()
    }
    expect(boardStyle({ pattern: 'effen', base: 'zwart', accent: 'lime' }).backgroundImage).toBeUndefined()
  })

  it('donker board weet dat het donker is', () => {
    expect(isDarkBoard({ pattern: 'effen', base: 'zwart', accent: 'lime' })).toBe(true)
    expect(isDarkBoard({ pattern: 'effen', base: 'sneeuw', accent: 'zwart' })).toBe(false)
  })

  it('verras me: altijd een patroon en twee verschillende kleuren', () => {
    let seed = 0
    const rng = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
    for (let i = 0; i < 50; i++) {
      const d = randomDesign(rng)
      expect(checkDesign(d)).toEqual(d)
      expect(d.base).not.toBe(d.accent)
      expect(d.pattern).not.toBe('effen')
    }
  })

  it('palet: unieke ids, geldige hex', () => {
    expect(new Set(BOARD_COLORS.map((c) => c.id)).size).toBe(BOARD_COLORS.length)
    for (const c of BOARD_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})
