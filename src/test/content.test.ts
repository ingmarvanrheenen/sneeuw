import { describe, expect, it } from 'vitest'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import { TERMS } from '../content/terms'
import { RESORTS } from '../content/resorts'
import { normalize, sample, validateAnim, SIDE_DEFAULT, TOP_DEFAULT, type FullSideKey } from '../anim/engine'
import { pose } from '../anim/pose'

describe('trick-bijbel', () => {
  it('heeft unieke ids', () => {
    expect(new Set(TRICKS.map((t) => t.id)).size).toBe(TRICKS.length)
    expect(new Set(TERMS.map((t) => t.id)).size).toBe(TERMS.length)
    expect(new Set(RESORTS.map((r) => r.id)).size).toBe(RESORTS.length)
  })

  it('verwijst alleen naar bestaande voorkennis', () => {
    for (const t of TRICKS) for (const p of t.prereqs) expect(TRICK_BY_ID.has(p), `${t.id} → ${p}`).toBe(true)
    for (const term of TERMS) if (term.trick) expect(TRICK_BY_ID.has(term.trick), term.id).toBe(true)
  })

  it('heeft geen cirkels in de skill tree', () => {
    const visiting = new Set<string>()
    const done = new Set<string>()
    const visit = (id: string) => {
      if (done.has(id)) return
      expect(visiting.has(id), `cirkel bij ${id}`).toBe(false)
      visiting.add(id)
      TRICK_BY_ID.get(id)!.prereqs.forEach(visit)
      visiting.delete(id)
      done.add(id)
    }
    TRICKS.forEach((t) => visit(t.id))
  })

  it('heeft complete uitleg per trick', () => {
    for (const t of TRICKS) {
      expect(t.steps.length, t.id).toBeGreaterThan(0)
      expect(t.mistakes.length, t.id).toBeGreaterThan(0)
      expect(t.safety.length, t.id).toBeGreaterThan(0)
      expect(t.summary.length, t.id).toBeGreaterThan(10)
    }
  })

  it('heeft geldige animaties', () => {
    for (const t of TRICKS) if (t.anim) expect(validateAnim(t.anim), t.id).toEqual([])
  })

  it('rendert elke zij-animatie naar eindige coördinaten', () => {
    for (const t of TRICKS) {
      if (t.anim?.view !== 'side') continue
      const keys = normalize(t.anim.keys, SIDE_DEFAULT) as FullSideKey[]
      for (let s = 0; s <= 1; s += 0.05) {
        const p = pose(sample(keys, s))
        for (const seg of p.segs) expect([...seg.a, ...seg.b].every(Number.isFinite), `${t.id}@${s}`).toBe(true)
        expect(p.board.pts.flat().every(Number.isFinite)).toBe(true)
      }
    }
  })
})

describe('animatie-engine', () => {
  it('interpoleert tussen keyframes en erft ontbrekende waarden', () => {
    const keys = normalize(
      [
        { t: 0, x: 0, angle: 0 },
        { t: 1, x: 1 },
      ],
      TOP_DEFAULT,
    )
    expect(keys[1].angle).toBe(0)
    expect(sample(keys, 0.5).x).toBeCloseTo(0.5)
    expect(sample(keys, -1).x).toBe(0)
    expect(sample(keys, 2).x).toBe(1)
  })
})
