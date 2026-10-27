import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { MOGULS, POWDER_DEPTH, mogulHeight, mogulMotion, powderMotion, treeLayout, treeMotion } from '../anim3d/freeride'
import { motionFor } from '../anim3d/motions'
import { Track } from '../anim3d/interp'
import { solve } from '../anim3d/solve'
import { TRICK_BY_ID } from '../content/tricks'
import type { Motion } from '../anim3d/types'

/** alle gewrichten plus neus en tail, per frame */
function frames(m: Motion, n = 240) {
  const tr = new Track(m.keys)
  return Array.from({ length: n + 1 }, (_, i) => {
    const k = tr.sample(i / n)
    const b = solve(k)
    const tips = [0.775, -0.775].map((x) => new Vector3(x, 0, 0).applyQuaternion(b.boardQuat).add(b.boardPos))
    return { k, b, pts: [...Object.values(b.j), ...tips], nose: tips[0] }
  })
}

describe('bulten', () => {
  it('hoogteveld: bulten in versprongen rijen, dalen ertussen', () => {
    expect(mogulHeight(0, 0)).toBeCloseTo(MOGULS.height)
    expect(mogulHeight(MOGULS.colGap / 2, MOGULS.rowGap / 2)).toBeCloseTo(MOGULS.height)
    expect(mogulHeight(0.8, MOGULS.rowGap / 2)).toBeLessThan(MOGULS.height * 0.35)
    expect(mogulHeight(0, -40)).toBe(0)
  })

  it('het board rijdt over het oppervlak: niets gaat erdoorheen en het raakt altijd ergens de sneeuw', () => {
    for (const f of frames(mogulMotion([]))) {
      for (const p of f.pts) expect(p.y - mogulHeight(p.x, p.z)).toBeGreaterThan(-0.03)
      // een stijf board ligt op zijn midden, of overbrugt een dal op neus en tail
      const [nose, tail] = f.pts.slice(-2)
      const touch = Math.min(
        f.b.boardPos.y - mogulHeight(f.k.x, f.k.z),
        nose.y - mogulHeight(nose.x, nose.z),
        tail.y - mogulHeight(tail.x, tail.z),
      )
      expect(touch).toBeLessThan(0.1)
    }
  })

  it('knieën absorberen op de top, strekken in het dal; wisselen van edge op de top', () => {
    const fs = frames(mogulMotion([]))
    const top = fs.filter((f) => mogulHeight(f.k.x, f.k.z) > MOGULS.height * 0.7)
    const dal = fs.filter((f) => mogulHeight(f.k.x, f.k.z) < MOGULS.height * 0.2)
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(top.length).toBeGreaterThan(10)
    expect(dal.length).toBeGreaterThan(10)
    expect(avg(top.map((f) => f.k.crouch))).toBeGreaterThan(avg(dal.map((f) => f.k.crouch)) + 0.2)
    expect(avg(top.map((f) => Math.abs(f.k.edge)))).toBeLessThan(avg(dal.map((f) => Math.abs(f.k.edge))))
  })
})

describe('bomen', () => {
  it('je rijdt door de gaten: nooit tegen een stam of door de takken', () => {
    const trees = treeLayout()
    let closest = Infinity
    for (const f of frames(treeMotion([]), 300))
      for (const p of f.pts)
        for (const t of trees) {
          const d = Math.hypot(p.x - t.x, p.z - t.z)
          // stam onderaan, vanaf ±1 m hoogte de onderste takken (straal ±1 m)
          const reach = p.y > t.h * 0.22 ? 1.05 : 0.35
          closest = Math.min(closest, d - reach)
        }
    expect(closest).toBeGreaterThan(0.15)
  })

  it('in elke bocht staat een boom aan de binnenkant, waar je omheen rijdt', () => {
    const trees = treeLayout()
    const keys = treeMotion([]).keys
    const inner = trees.filter((t) => t.x === 0)
    expect(inner.length).toBe(5)
    for (const t of inner) {
      const near = keys.reduce((a, k) => (Math.abs((k.z ?? 0) - t.z) < Math.abs((a.z ?? 0) - t.z) ? k : a))
      expect(Math.abs(near.x ?? 0)).toBeGreaterThan(1.5)
    }
  })
})

describe('poeder', () => {
  it('gewicht achter en de neus omhoog, de hele run', () => {
    const m = powderMotion([])
    for (const k of m.keys) {
      expect(k.lean).toBeLessThan(-0.3)
      expect(k.pitch).toBeGreaterThanOrEqual(5)
    }
    expect(m.powder).toBe(POWDER_DEPTH)
  })

  it('pompen: in de bocht zakt het board weg, ertussen steekt de neus boven de sneeuw', () => {
    const fs = frames(powderMotion([]))
    const ys = fs.map((f) => f.k.y)
    expect(Math.min(...ys)).toBeLessThan(0.05)
    expect(Math.max(...ys)).toBeGreaterThan(0.15)
    expect(fs.some((f) => f.nose.y > POWDER_DEPTH)).toBe(true)
    expect(fs.some((f) => f.nose.y < POWDER_DEPTH)).toBe(true)
  })
})

it('poeder, bomen en bulten gebruiken de nieuwe freeride-bewegingen met hun eigen uitleg', () => {
  for (const [id, terrain] of [
    ['poeder', 'poeder'],
    ['bomen', 'bomen'],
    ['bulten', 'bulten'],
  ] as const) {
    const t = TRICK_BY_ID.get(id)!
    const m = motionFor(t)!
    expect(m.terrain).toBe(terrain)
    expect(m.steps.map((s) => s.label)).toEqual(t.anim!.steps.map((s) => s.label))
  }
  expect(motionFor(TRICK_BY_ID.get('bulten')!)!.surface).toBe(mogulHeight)
})
