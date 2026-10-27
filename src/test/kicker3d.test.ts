import { describe, expect, it } from 'vitest'
import { KICKER, LIP_Y, airTrickFrom, kickerMotion, kickerProfile, kickerSurface, remapSteps, simulateRide } from '../anim3d/kicker'
import { motionFor } from '../anim3d/motions'
import { Track } from '../anim3d/interp'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import type { SideAnim } from '../anim/engine'

const ride = simulateRide()
const kickerTricks = TRICKS.filter((t) => t.anim?.view === 'side' && t.anim.obstacle === 'kicker')

describe('kicker-profiel', () => {
  it('aanloop, transition naar een lip van 26°, deck, landing van 30°, runout', () => {
    expect(kickerSurface(-10)).toEqual({ y: KICKER.approach, angle: 0 })
    expect(kickerSurface(0).angle).toBeCloseTo(KICKER.lip, 1)
    expect(kickerSurface(0).y).toBeCloseTo(LIP_Y, 5)
    expect(kickerSurface(1).y).toBeCloseTo(LIP_Y, 5)
    expect(kickerSurface(4.5).angle).toBeCloseTo(-KICKER.land, 5)
    expect(kickerSurface(30)).toEqual({ y: 0, angle: 0 })
  })

  it('oppervlak zonder sprongen of knikken (behalve de lip, die hoort scherp)', () => {
    const pts = kickerProfile(0.02)
    for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i][1] - pts[i - 1][1]), `z=${pts[i][0]}`).toBeLessThan(0.03)
    for (let z = -12; z < 15; z += 0.02) {
      if (Math.abs(z) < 0.03) continue
      expect(Math.abs(kickerSurface(z + 0.02).angle - kickerSurface(z).angle), `z=${z}`).toBeLessThan(1.5)
    }
  })
})

describe('rit over de kicker', () => {
  it('snelheid gaat eraf op de transition, vlucht is een echte boog die midden op de landing uitkomt', () => {
    expect(ride.speed).toBeCloseTo(6, 1)
    const air = ride.land - ride.takeoff
    expect(air).toBeGreaterThan(0.8)
    expect(air).toBeLessThan(1)
    const apex = Math.max(...ride.samples.map((s) => s.y))
    expect(apex - LIP_Y).toBeGreaterThan(0.25)
    expect(apex - LIP_Y).toBeLessThan(0.45)
    const landing = ride.samples.find((s) => s.s >= ride.land)!
    expect(kickerSurface(landing.z).angle).toBeCloseTo(-KICKER.land, 0)
  })

  it('op de grond rijdt het board over het oppervlak, in de lucht er nooit doorheen', () => {
    for (const s of ride.samples) {
      const surf = kickerSurface(s.z).y
      if (s.ground === null) expect(s.y, `z=${s.z}`).toBeGreaterThan(surf - 0.05)
      else expect(s.y).toBeCloseTo(surf, 5)
    }
  })
})

describe('kicker-tricks', () => {
  it('alle kicker-tricks gebruiken de nieuwe kicker, met hun eigen grab/spin/flip', () => {
    expect(kickerTricks.length).toBe(14)
    for (const t of kickerTricks) {
      const m = motionFor(t)!
      expect(m.terrain, t.id).toBe('kicker')
      expect(m.keys[0].z, t.id).toBeCloseTo(-14, 0)
    }
    expect(airTrickFrom(TRICK_BY_ID.get('grab-indy')!.anim as SideAnim)).toMatchObject({ grab: 'indy', spin: 0 })
    expect(airTrickFrom(TRICK_BY_ID.get('kicker-540')!.anim as SideAnim)).toMatchObject({ spin: 540 })
    expect(airTrickFrom(TRICK_BY_ID.get('backflip')!.anim as SideAnim)).toMatchObject({ flip: 360 })
  })

  it('board parallel aan de landing bij het neerkomen; grab vast in de lucht, los bij afzet en landing', () => {
    const m = kickerMotion({ grab: 'indy' }, [])
    const tr = new Track(m.keys)
    const at = (s: number) => tr.sample(s / m.duration)
    expect(at(ride.land).pitch).toBeCloseTo(-KICKER.land, -1)
    expect(at(ride.takeoff).g).toBe(0)
    expect(at((ride.takeoff + ride.land) / 2).g).toBe(1)
    expect(at(ride.land).g).toBe(0)
    expect(at((ride.takeoff + ride.land) / 2).crouch).toBeGreaterThan(1.2)
  })

  it('spins eindigen op de juiste kant (180 en 540 switch), flips komen rond', () => {
    for (const [spin, heading, look] of [
      [180, 270, -1],
      [-180, -90, -1],
      [360, 450, 1],
      [540, 630, -1],
    ] as const) {
      const m = kickerMotion({ spin }, [])
      const last = m.keys[m.keys.length - 1]
      expect(last.heading).toBeCloseTo(heading, 0)
      expect(Math.sign(last.look!)).toBe(look)
    }
    const flip = kickerMotion({ flip: 360 }, [])
    const end = flip.keys[flip.keys.length - 1]
    expect(end.pitch).toBeCloseTo(360, 0)
  })

  it('uitleg blijft op volgorde en de pop-stap valt vlak voor de afzet', () => {
    const t = TRICK_BY_ID.get('kicker-straight')!
    const st = remapSteps((t.anim as SideAnim).steps, ride)
    for (let i = 1; i < st.length; i++) expect(st[i].t).toBeGreaterThan(st[i - 1].t)
    const pop = st.find((s) => /pop/i.test(s.label))!
    expect(pop.t * ride.duration).toBeGreaterThan(ride.takeoff - 0.6)
    expect(pop.t * ride.duration).toBeLessThan(ride.takeoff + 0.1)
  })
})
