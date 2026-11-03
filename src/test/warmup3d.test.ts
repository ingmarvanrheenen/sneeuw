// Warming-up en cooling-down in 3D: elke oefening heeft een beweging, de rider blijft op zijn plek op vlakke sneeuw,
// het board gaat nooit door de sneeuw, en elke oefening doet ook echt wat erop staat.
import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { ALL_EXERCISES as WARMUP } from '../content/warmup'
import { WARMUP_3D } from '../anim3d/warmup'
import { Track } from '../anim3d/interp'
import { solve } from '../anim3d/solve'

const lowestPoint = (b: ReturnType<typeof solve>) =>
  Math.min(...[0.775, -0.775].map((x) => new Vector3(x, 0, 0).applyQuaternion(b.boardQuat).add(b.boardPos).y))
const frames = (id: string, n = 60) => {
  const m = WARMUP_3D[id]()
  const tr = new Track(m.keys)
  return Array.from({ length: n + 1 }, (_, i) => tr.sample(i / n))
}

describe('warming-up 3D', () => {
  it('elke oefening heeft een beweging op vlakke sneeuw, keys op volgorde', () => {
    for (const e of WARMUP) {
      const m = WARMUP_3D[e.id]?.()
      expect(m, e.id).toBeTruthy()
      expect(m.terrain).toBe('vlak')
      expect(m.slope).toBe(0)
      expect(m.camera).toBe('zij')
      for (let i = 1; i < m.keys.length; i++) expect(m.keys[i].t).toBeGreaterThanOrEqual(m.keys[i - 1].t)
      expect(m.keys[0].t).toBe(0)
      expect(m.keys.at(-1)!.t).toBe(1)
    }
  })

  it('de rider blijft op zijn plek en het board nooit door de sneeuw', () => {
    for (const e of WARMUP) {
      for (const k of frames(e.id)) {
        expect(Math.abs(k.x) + Math.abs(k.z), e.id).toBeLessThan(1e-6)
        expect(k.y).toBeGreaterThanOrEqual(0)
        expect(lowestPoint(solve(k)), e.id).toBeGreaterThan(-0.02)
      }
    }
  })

  it('de lus sluit: begin en eind zijn dezelfde houding', () => {
    for (const e of WARMUP) {
      const f = frames(e.id)
      for (const c of ['crouch', 'lean', 'twist', 'pitch', 'y'] as const)
        expect(Math.abs(f[0][c] - f.at(-1)![c]), `${e.id} ${c}`).toBeLessThan(0.06)
    }
  })

  it('elke oefening doet wat erop staat', () => {
    const range = (id: string, c: 'crouch' | 'lean' | 'twist' | 'pitch' | 'y') => {
      const v = frames(id).map((k) => k[c])
      return [Math.min(...v), Math.max(...v)]
    }
    expect(range('knieen', 'crouch')[1] - range('knieen', 'crouch')[0]).toBeGreaterThan(0.6)
    expect(new Set(WARMUP_3D.armen().keys.map((k) => k.arms))).toEqual(new Set(['uit', 'omhoog', 'los']))
    const tw = range('draaien', 'twist')
    expect(tw[0]).toBeLessThan(-30)
    expect(tw[1]).toBeGreaterThan(30)
    const ln = range('gewicht', 'lean')
    expect(ln[0]).toBeLessThan(-0.9)
    expect(ln[1]).toBeGreaterThan(0.9)
    // drie hopjes van een paar centimeter, en een echte ollie
    const hops = frames('hops', 300).map((k) => k.y > 0.01)
    expect(hops.filter((on, i) => on && !hops[i - 1]).length).toBe(3)
    expect(range('hops', 'y')[1]).toBeLessThan(0.2)
    expect(range('ollie', 'y')[1]).toBeGreaterThan(0.2)
    // cooling-down: echt diep zitten, ver draaien, en de armen gaan omhoog en naar de sneeuw
    expect(range('hurk', 'crouch')[1]).toBeGreaterThan(0.95)
    const rug = range('rug', 'twist')
    expect(rug[0]).toBeLessThan(-40)
    expect(rug[1]).toBeGreaterThan(40)
    expect(new Set(WARMUP_3D.rekken().keys.map((k) => k.arms))).toContain('omhoog')
    expect(new Set(WARMUP_3D.hamstrings().keys.map((k) => k.arms))).toContain('sneeuw')
    const kuit = range('kuiten', 'lean')
    expect(kuit[0]).toBeLessThan(-0.9)
    expect(kuit[1]).toBeGreaterThan(0.9)
    const p = range('press', 'pitch')
    expect(p[0]).toBeLessThan(-8)
    expect(p[1]).toBeGreaterThan(8)
  })
})
