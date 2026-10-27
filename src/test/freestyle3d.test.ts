import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { airHeight, channel, popHeight, FREESTYLE } from '../anim3d/freestyle'
import { Track } from '../anim3d/interp'
import { solve } from '../anim3d/solve'
import type { Motion } from '../anim3d/types'

const m = (id: string): Motion => FREESTYLE[id]()
/** pose op tijdstip in seconden */
const at = (mo: Motion, s: number) => new Track(mo.keys).sample(s / mo.duration)
const lowestPoint = (b: ReturnType<typeof solve>) =>
  Math.min(...[0.775, -0.775].map((x) => new Vector3(x, 0, 0).applyQuaternion(b.boardQuat).add(b.boardPos).y))
/** richting van de schouders in de wereld, in graden rond de verticale as */
const shoulderYaw = (b: ReturnType<typeof solve>) => (Math.atan2(b.shoulderAxis.z, b.shoulderAxis.x) * 180) / Math.PI

describe('pose-kanalen en sprong', () => {
  it('kanaal: zacht van pose naar pose, houdt zijn waarde voor en na', () => {
    const poses = [
      { s: 1, crouch: 0.2 },
      { s: 2, crouch: 0.8 },
      { s: 3, lean: 1 },
    ]
    expect(channel(poses, 'crouch', 0, 0.3)).toBe(0.2)
    expect(channel(poses, 'crouch', 1.5, 0.3)).toBeCloseTo(0.5)
    expect(channel(poses, 'crouch', 3, 0.3)).toBe(0.8)
    expect(channel(poses, 'twist', 1.5, 7)).toBe(7)
  })

  it('sprong is een echte boog: piek = g·T²/8 halverwege, nul buiten de lucht', () => {
    const T = 0.56
    expect(airHeight(0.9, 1, T)).toBe(0)
    expect(airHeight(1 + T + 0.01, 1, T)).toBe(0)
    expect(airHeight(1 + T / 2, 1, T)).toBeCloseTo(popHeight(T), 5)
    expect(popHeight(T)).toBeGreaterThan(0.3)
    expect(popHeight(T)).toBeLessThan(0.45)
  })
})

describe('flat-tricks in 3D', () => {
  it('ollie: tail laden (neus omhoog, tail op de sneeuw), poppen, waterpas in de lucht, plat landen', () => {
    const o = m('ollie')
    const load = solve(at(o, 1.06))
    expect(at(o, 1.06).pitch).toBeGreaterThan(10)
    expect(lowestPoint(load)).toBeLessThan(0.03)
    const apex = at(o, 1.38)
    expect(apex.y).toBeGreaterThan(0.3)
    expect(Math.abs(apex.pitch)).toBeLessThan(3)
    expect(apex.crouch).toBeGreaterThan(0.75)
    const land = at(o, 1.66)
    expect(land.y).toBeLessThan(0.02)
    expect(Math.abs(land.pitch)).toBeLessThan(1)
    expect(at(o, 1.8).crouch).toBeGreaterThan(0.6)
  })

  it('nollie: alles gespiegeld, pop van de neus', () => {
    const n = m('nollie')
    expect(at(n, 1.06).pitch).toBeLessThan(-10)
    expect(at(n, 1.02).lean).toBeGreaterThan(0.5)
  })

  it('shifty: board draait weg en terug, de schouders blijven waar ze waren', () => {
    const sh = m('shifty')
    const before = solve(at(sh, 1.1))
    const mid = at(sh, 1.38)
    expect(mid.heading).toBeGreaterThan(140)
    const diff = Math.abs(((shoulderYaw(solve(mid)) - shoulderYaw(before) + 540) % 360) - 180)
    expect(diff).toBeLessThan(15)
    expect(at(sh, 1.66).heading).toBeCloseTo(90, 0)
  })

  it('180: opwinden tegen de draai in, schouders leiden, switch landen', () => {
    for (const [id, dir] of [
      ['fs-180', 1],
      ['bs-180', -1],
    ] as const) {
      const sp = m(id)
      // opwinden: schouders in de wereld tegen de draai in (board draait in de wereld -dir)
      const board = (s: number) => -at(sp, s).heading
      const sh = (s: number) => -at(sp, s).heading + at(sp, s).twist
      expect(Math.sign(sh(1.0) - board(1.0))).toBe(dir)
      // tijdens de draai lopen de schouders vóór het board uit
      expect(Math.sign(sh(1.25) - board(1.25))).toBe(-dir)
      expect(at(sp, 2.5).heading).toBeCloseTo(90 + 180 * dir, 0)
      expect(at(sp, 2.5).look).toBeLessThan(0)
    }
  })

  it('presses: tip op de sneeuw, board blijft op de grond, bovenlijf rechtop', () => {
    for (const [id, sign] of [
      ['nose-press', -1],
      ['tail-press', 1],
    ] as const) {
      const p = m(id)
      const hold = at(p, 2)
      expect(Math.sign(hold.pitch)).toBe(sign)
      expect(Math.abs(hold.pitch)).toBeGreaterThan(6)
      expect(hold.upright).toBe(1)
      expect(p.keys.every((k) => (k.y ?? 0) === 0)).toBe(true)
      expect(lowestPoint(solve(hold))).toBeLessThan(0.03)
      expect(lowestPoint(solve(hold))).toBeGreaterThan(-0.02)
    }
  })

  it('alle flat-tricks: stappen op volgorde en binnen de tijdlijn, met een cue', () => {
    for (const [id, make] of Object.entries(FREESTYLE)) {
      const st = make().steps
      for (let i = 0; i < st.length; i++) {
        expect(st[i].t, id).toBeGreaterThanOrEqual(0)
        expect(st[i].t, id).toBeLessThanOrEqual(1)
        if (i) expect(st[i].t, id).toBeGreaterThan(st[i - 1].t)
        expect(st[i].cue, id).toBeTruthy()
      }
    }
  })
})
