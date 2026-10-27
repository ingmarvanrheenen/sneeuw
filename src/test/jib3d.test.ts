import { describe, expect, it } from 'vitest'
import { JIB, jibFrom, jibMotion, jibTop, remapJibSteps, simulateJib } from '../anim3d/jib'
import { motionFor } from '../anim3d/motions'
import { Track } from '../anim3d/interp'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import type { SideAnim } from '../anim/engine'

const jibTricks = TRICKS.filter((t) => t.anim?.view === 'side' && (t.anim.obstacle === 'box' || t.anim.obstacle === 'rail'))

describe('rit over een jib', () => {
  it('box: oprijden via de ramp, zonder ollie, dan glijden op de box', () => {
    const r = simulateJib('box')
    const top = jibTop('box')
    expect(r.pop).toBe(r.on)
    const onRamp = r.samples.filter((s) => s.z > JIB.box.start + 0.1 && s.z < top.from - 0.1)
    expect(onRamp.every((s) => s.pitch > 10 && s.y > 0 && s.y < JIB.box.height)).toBe(true)
    const sliding = r.samples.filter((s) => s.phase === 'jib')
    expect(sliding.length).toBeGreaterThan(50)
    expect(sliding.every((s) => s.y === JIB.box.height && s.z >= top.from && s.z <= top.to)).toBe(true)
  })

  it('rail: de ollie komt over het begin van de rail en landt dalend erop', () => {
    const r = simulateJib('rail')
    const top = jibTop('rail')
    const air = r.samples.filter((s) => s.phase === 'lucht' && s.s < r.on)
    // boven de rail op het moment dat je het begin passeert
    const atStart = air.find((s) => s.z >= top.from)!
    expect(atStart.y).toBeGreaterThan(top.y)
    // al dalend bij de landing
    const last = air[air.length - 1]
    const before = air[air.length - 6]
    expect(last.y).toBeLessThan(before.y)
    expect(Math.abs(last.y - top.y)).toBeLessThan(0.05)
  })

  it('eraf: vallen tot de sneeuw, daarna rustig wegrijden', () => {
    for (const kind of ['box', 'rail'] as const) {
      const r = simulateJib(kind)
      expect(r.down).toBeGreaterThan(r.off)
      expect(r.down - r.off).toBeLessThan(0.6)
      expect(r.samples.filter((s) => s.s > r.down).every((s) => s.y === 0)).toBe(true)
    }
  })
})

describe('jib-tricks', () => {
  it('alle box- en rail-tricks gebruiken de nieuwe jibs', () => {
    expect(jibTricks.map((t) => t.id).sort()).toEqual(['boardslide', 'box-5050', 'rail-5050', 'rail-boardslide'])
    for (const t of jibTricks) expect(motionFor(t)!.keys[0].z, t.id).toBeCloseTo(-10, 0)
    expect(jibFrom(TRICK_BY_ID.get('rail-boardslide')!.anim as SideAnim)).toEqual({ kind: 'rail', sideways: true })
    expect(jibFrom(TRICK_BY_ID.get('box-5050')!.anim as SideAnim)).toEqual({ kind: 'box', sideways: false })
  })

  it('50-50: board in de lengte; boardslide: board dwars en je kijkt naar het einde; recht landen', () => {
    for (const [sideways, heading, look] of [
      [false, 90, 80],
      [true, 0, 0],
    ] as const) {
      const r = simulateJib('box')
      const m = jibMotion('box', sideways, [])
      const tr = new Track(m.keys)
      const mid = tr.sample((r.on + r.off) / 2 / m.duration)
      expect(mid.heading).toBeCloseTo(heading, 0)
      expect(mid.look).toBeCloseTo(look, 0)
      expect(tr.sample((r.down + 0.05) / m.duration).heading).toBeCloseTo(90, 0)
    }
  })

  it('op de rail balanceer je met kleine correcties, op de box niet', () => {
    const edges = (kind: 'box' | 'rail') => jibMotion(kind, false, []).keys.map((k) => Math.abs(k.edge ?? 0))
    expect(Math.max(...edges('rail'))).toBeGreaterThan(0.02)
    expect(Math.max(...edges('rail'))).toBeLessThan(0.1)
    expect(Math.max(...edges('box'))).toBe(0)
  })

  it('uitleg op volgorde, binnen de tijdlijn', () => {
    for (const t of jibTricks) {
      const kind = (t.anim as SideAnim).obstacle === 'rail' ? 'rail' : 'box'
      const st = remapJibSteps((t.anim as SideAnim).steps, simulateJib(kind))
      for (let i = 0; i < st.length; i++) {
        expect(st[i].t, t.id).toBeGreaterThanOrEqual(0)
        expect(st[i].t, t.id).toBeLessThanOrEqual(1)
        if (i) expect(st[i].t, t.id).toBeGreaterThan(st[i - 1].t)
      }
    }
  })
})
