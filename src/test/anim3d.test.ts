import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { turns } from '../anim3d/builders'
import { HANDMADE, motionFor } from '../anim3d/motions'
import { Track } from '../anim3d/interp'
import { solve } from '../anim3d/solve'
import { KEY3_DEFAULT } from '../anim3d/types'
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
      const track = new Track(m.keys)
      for (let i = 0; i <= 40; i++) {
        const b = solve(track.sample(i / 40))
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

  it('upright: bij een press of pop kantelt het board, het bovenlijf blijft rechtop en de voeten in de bindingen', () => {
    // kanteling van de rug in de lengterichting van het board (neus = +z bij heading 90)
    const tilt = (b: ReturnType<typeof solve>) => (Math.atan2(b.spine.z, b.spine.y) * 180) / Math.PI
    const level = solve({ ...KEY3_DEFAULT, t: 0 })
    const stiff = solve({ ...KEY3_DEFAULT, t: 0, pitch: 18 })
    const upright = solve({ ...KEY3_DEFAULT, t: 0, pitch: 18, upright: 1 })
    // zonder upright hangt de rider mee met het board, met upright staat hij zoals op een vlak board
    expect(Math.abs(tilt(stiff) - tilt(level))).toBeGreaterThan(10)
    expect(Math.abs(tilt(upright) - tilt(level))).toBeLessThan(2)
    for (const b of [stiff, upright]) {
      expect(b.j.hipF.distanceTo(b.j.kneeF) + b.j.kneeF.distanceTo(b.j.ankleF)).toBeCloseTo(0.9, 2)
      expect(b.j.hipB.distanceTo(b.j.kneeB) + b.j.kneeB.distanceTo(b.j.ankleB)).toBeCloseTo(0.9, 2)
    }
  })

  it('upright na een flip: pitch 330° is hetzelfde als -30°', () => {
    const a = solve({ ...KEY3_DEFAULT, t: 0, y: 1, pitch: -30, upright: 0.5 })
    const b = solve({ ...KEY3_DEFAULT, t: 0, y: 1, pitch: 330, upright: 0.5 })
    expect(a.j.head.distanceTo(b.j.head)).toBeLessThan(1e-6)
  })

  it('pop: de tip blijft op de sneeuw en het board gaat zonder sprong de lucht in', () => {
    const tipHeight = (b: ReturnType<typeof solve>) => {
      const half = 0.775
      const nose = new Vector3(half, 0, 0).applyQuaternion(b.boardQuat).add(b.boardPos)
      const tail = new Vector3(-half, 0, 0).applyQuaternion(b.boardQuat).add(b.boardPos)
      return Math.min(nose.y, tail.y)
    }
    let prev: number | null = null
    for (let y = 0; y <= 0.4; y += 0.01) {
      const b = solve({ ...KEY3_DEFAULT, t: 0, y, pitch: 16 })
      // laagste punt van het board nooit (merkbaar) in de sneeuw
      expect(tipHeight(b)).toBeGreaterThan(-0.02)
      if (prev !== null) expect(Math.abs(b.boardPos.y - prev)).toBeLessThan(0.02)
      prev = b.boardPos.y
    }
  })

  it('voeten blijven in de bindingen', () => {
    const b = solve({ ...KEY3_DEFAULT, t: 0, edge: 0.8, crouch: 0.7, twist: 30 })
    const leg = (hip: 'hipF' | 'hipB', knee: 'kneeF' | 'kneeB', ankle: 'ankleF' | 'ankleB') =>
      b.j[hip].distanceTo(b.j[knee]) + b.j[knee].distanceTo(b.j[ankle])
    expect(leg('hipF', 'kneeF', 'ankleF')).toBeCloseTo(0.9, 2)
    expect(leg('hipB', 'kneeB', 'ankleB')).toBeCloseTo(0.9, 2)
  })

  it('interpolatie loopt vloeiend door en schiet niet voorbij een stilstand', () => {
    const track = new Track([
      { t: 0, crouch: 0.2, arms: 'uit' },
      { t: 0.5, crouch: 0.8, arms: 'voor' },
      { t: 1, crouch: 0.8, arms: 'voor' },
    ])
    for (let i = 0; i <= 100; i++) {
      const c = track.sample(i / 100).crouch
      expect(c).toBeGreaterThanOrEqual(0.2 - 1e-9)
      expect(c).toBeLessThanOrEqual(0.8 + 1e-9)
    }
    // armen gaan geleidelijk over, niet in één sprong
    const mid = track.sample(0.25)
    expect(mid.arms2).toBe('voor')
    expect(mid.armsMix).toBeGreaterThan(0.2)
    expect(mid.armsMix).toBeLessThan(0.8)
    // dichte fysica-keys: geen hapering (snelheid zakt niet in tussen twee keys)
    const dense = new Track(Array.from({ length: 11 }, (_, i) => ({ t: i / 10, z: i })))
    const v = (t: number) => (dense.sample(t + 0.001).z - dense.sample(t - 0.001).z) / 0.002
    expect(v(0.5)).toBeCloseTo(v(0.55), 3)
  })
})

describe('grabs', () => {
  it('in een tuck pakt de hand echt het board op de juiste plek', async () => {
    const { GRAB, BOARD } = await import('../anim3d/solve')
    // alle grabs die in de trick-bijbel voorkomen
    const used = new Set(TRICKS.flatMap((t) => (t.anim?.view === 'side' ? t.anim.keys.map((k) => k.grab).filter(Boolean) : [])))
    expect(used.size).toBeGreaterThanOrEqual(8)
    for (const grab of [...used] as (keyof typeof GRAB)[]) {
      const gt = GRAB[grab]
      const b = solve({ ...KEY3_DEFAULT, t: 0, y: 1, crouch: 1.45, grab, g: 1 })
      const target = new Vector3((gt.x * BOARD.length) / 2, BOARD.thick / 2 + 0.03, ((gt.z * BOARD.width) / 2) * 1.05)
        .applyQuaternion(b.boardQuat)
        .add(b.boardPos)
      const hand = gt.hand === 'F' ? b.j.handF : b.j.handB
      expect(hand.distanceTo(target), grab).toBeLessThan(0.06)
    }
  })
})
