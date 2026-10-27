import { describe, expect, it } from 'vitest'
import { normalize, sample } from '../anim/engine'
import { turns } from '../anim3d/builders'
import { HANDMADE, motionFor } from '../anim3d/motions'
import { solve } from '../anim3d/solve'
import { KEY3_DEFAULT, type FullKey3 } from '../anim3d/types'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'

const finite = (n: number) => Number.isFinite(n)

describe('3D-bewegingen', () => {
  it('elke handgemaakte beweging hoort bij een bestaande trick', () => {
    for (const id of HANDMADE) expect(TRICK_BY_ID.has(id), id).toBe(true)
  })

  it('elke trick met animatie levert een geldige 3D-beweging', () => {
    for (const trick of TRICKS) {
      if (!trick.anim) continue
      const m = motionFor(trick)!
      expect(m, trick.id).toBeTruthy()
      expect(m.duration, trick.id).toBeGreaterThan(0)
      expect(m.steps.length, trick.id).toBeGreaterThan(0)
      for (const s of m.steps) expect(s.t >= 0 && s.t <= 1, `${trick.id} stap ${s.label}`).toBe(true)
      const keys = normalize(m.keys, KEY3_DEFAULT) as FullKey3[]
      for (let i = 0; i <= 40; i++) {
        const b = solve(sample(keys, i / 40) as FullKey3)
        for (const p of Object.values(b.j)) expect([p.x, p.y, p.z].every(finite), `${trick.id} @${i}`).toBe(true)
        // het board blijft op of boven de sneeuw
        expect(b.boardPos.y, trick.id).toBeGreaterThan(-0.05)
      }
    }
  })

  it('fysica: traverse rijdt op de heel edge, sideslip toe op de toe edge', () => {
    const avg = (id: string) => {
      const keys = motionFor(TRICK_BY_ID.get(id)!)!.keys
      return keys.reduce((a, k) => a + (k.edge ?? 0), 0) / keys.length
    }
    expect(avg('traverse')).toBeLessThan(-0.1)
    expect(avg('sideslip-heel')).toBeLessThan(-0.1)
    expect(avg('sideslip-toe')).toBeGreaterThan(0.1)
  })

  it('bochten wisselen van edge en carven kantelt meer dan slippen', () => {
    const range = (s: Parameters<typeof turns>[0]) => {
      const e = turns(s, 3, 'toe').map((k) => k.edge ?? 0)
      return [Math.min(...e), Math.max(...e)]
    }
    const [slipMin, slipMax] = range('slip')
    const [carveMin, carveMax] = range('carve')
    expect(slipMin).toBeLessThan(0)
    expect(slipMax).toBeGreaterThan(0)
    expect(carveMax).toBeGreaterThan(slipMax)
    expect(carveMin).toBeLessThan(slipMin)
  })

  it('voeten blijven in de bindingen', () => {
    const b = solve({ ...KEY3_DEFAULT, t: 0, edge: 0.8, crouch: 0.7, twist: 30 })
    const leg = (hip: 'hipF' | 'hipB', knee: 'kneeF' | 'kneeB', ankle: 'ankleF' | 'ankleB') =>
      b.j[hip].distanceTo(b.j[knee]) + b.j[knee].distanceTo(b.j[ankle])
    expect(leg('hipF', 'kneeF', 'ankleF')).toBeCloseTo(0.9, 2)
    expect(leg('hipB', 'kneeB', 'ankleB')).toBeCloseTo(0.9, 2)
  })
})
