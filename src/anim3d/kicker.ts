// Kicker: één profiel in meters voor het 3D-model én de beweging, zodat het board precies over
// het oppervlak rijdt. De rit is gesimuleerd: snelheid verlies je op de transition (zwaartekracht),
// de vlucht is een ballistische boog vanaf de lip tot hij de landing raakt.
// Grabs, spins en flips komen uit de 2D-animatie van de trick; de uitleg ook (tijden omgezet).
import { normalize, type GrabKind, type SideAnim, type Step } from '../anim/engine'
import { SIDE_DEFAULT } from '../anim/engine'
import { channel, type Pose } from './freestyle'
import type { Key3, Motion } from './types'

const G = 9.81
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Afmetingen (meter, graden). De aanloop ligt op een plateau, de runout op y = 0. */
export const KICKER = {
  approach: 2.6,
  /** horizontale lengte van de transition */
  trans: 4,
  lip: 26,
  deck: 2,
  land: 30,
  /** afronding van knuckle en de overgang naar de runout */
  knuckleR: 2,
  bottomR: 5,
  start: -40,
}

const R = KICKER.trans / Math.sin(rad(KICKER.lip))
export const LIP_Y = KICKER.approach + R * (1 - Math.cos(rad(KICKER.lip)))
const tanL = Math.tan(rad(KICKER.land))
/** waar de (onafgeronde) landing de runout raakt */
const LAND_END = KICKER.deck + LIP_Y / tanL
const dk = KICKER.knuckleR * Math.tan(rad(KICKER.land / 2))
const db = KICKER.bottomR * Math.tan(rad(KICKER.land / 2))

/** Hoogte en hellingshoek (graden, + = omhoog in rijrichting) van het oppervlak op afstand z. */
export function kickerSurface(z: number): { y: number; angle: number } {
  const { approach: A, trans, deck, knuckleR: Rk, bottomR: Rb } = KICKER
  if (z <= -trans) return { y: A, angle: 0 }
  if (z <= 0) {
    const phi = Math.asin((z + trans) / R)
    return { y: A + R * (1 - Math.cos(phi)), angle: deg(phi) }
  }
  // deck, met een afgeronde knuckle
  const k0 = deck - dk
  if (z <= k0) return { y: LIP_Y, angle: 0 }
  const kEnd = deck + dk * Math.cos(rad(KICKER.land))
  if (z <= kEnd) {
    const dz = z - k0
    return { y: LIP_Y - Rk + Math.sqrt(Rk * Rk - dz * dz), angle: -deg(Math.asin(dz / Rk)) }
  }
  // landing, met een afgeronde overgang naar de runout
  const b0 = LAND_END - db * Math.cos(rad(KICKER.land))
  if (z <= b0) return { y: LIP_Y - (z - deck) * tanL, angle: -KICKER.land }
  const zc = LAND_END + db
  if (z <= zc) {
    const dz = zc - z
    return { y: Rb - Math.sqrt(Rb * Rb - dz * dz), angle: -deg(Math.asin(dz / Rb)) }
  }
  return { y: 0, angle: 0 }
}

/** Profielpunten (z, y) voor het 3D-model, van de aanloop tot een stuk runout. */
export function kickerProfile(step = 0.1): [number, number][] {
  const pts: [number, number][] = []
  for (let z = KICKER.start; z <= LAND_END + db + 1; z += step) pts.push([z, kickerSurface(z).y])
  return pts
}

export const KNUCKLE_Z = KICKER.deck

export interface Ride {
  /** samples op vaste stap: tijd, positie, hoek van het oppervlak (null = in de lucht) */
  samples: { s: number; z: number; y: number; ground: number | null }[]
  takeoff: number
  land: number
  duration: number
  /** snelheid bij de lip */
  speed: number
}

/** Rit over de kicker: aanloop, transition (snelheid gaat eraf), vlucht, landing, runout. */
export function simulateRide(lipSpeed = 6, after = 1.5, dt = 1 / 120): Ride {
  const A = KICKER.approach
  const v0 = Math.sqrt(lipSpeed * lipSpeed + 2 * G * (LIP_Y - A))
  let z = -14
  let y = A
  let v = v0
  let s = 0
  const samples: Ride['samples'] = []
  // grond tot de lip
  while (z < 0) {
    const g = kickerSurface(z)
    samples.push({ s, z, y: g.y, ground: g.angle })
    v = Math.sqrt(Math.max(1, v0 * v0 - 2 * G * (g.y - A)))
    z = Math.min(0, z + v * Math.cos(rad(g.angle)) * dt)
    if (z === 0) break
    s += dt
  }
  s += dt
  const takeoff = s
  // vlucht
  y = LIP_Y
  const vz = v * Math.cos(rad(KICKER.lip))
  let vy = v * Math.sin(rad(KICKER.lip))
  const speed = v
  for (;;) {
    samples.push({ s, z, y, ground: null })
    z += vz * dt
    vy -= G * dt
    y += vy * dt
    s += dt
    if (z > 0.2 && y <= kickerSurface(z).y) break
  }
  const land = s
  // landing en runout: snelheid langs het oppervlak, zwaartekracht trekt je de landing af
  let g = kickerSurface(z)
  v = vz * Math.cos(rad(g.angle)) + vy * Math.sin(rad(g.angle))
  const end = land + after
  while (s <= end) {
    g = kickerSurface(z)
    samples.push({ s, z, y: g.y, ground: g.angle })
    v = Math.max(3, v - G * Math.sin(rad(g.angle)) * dt)
    z += v * Math.cos(rad(g.angle)) * dt
    s += dt
  }
  return { samples, takeoff, land, duration: s, speed }
}

export interface AirTrick {
  grab?: GrabKind | null
  /** graden rond de verticale as, + = frontside */
  spin?: number
  /** graden, + = backflip (neus omhoog en over) */
  flip?: number
}

/** Parameters van een kicker-trick uit zijn 2D-animatie. */
export function airTrickFrom(anim: SideAnim): AirTrick {
  const keys = normalize(anim.keys, SIDE_DEFAULT)
  const last = keys[keys.length - 1]
  return { grab: keys.find((k) => k.grab)?.grab ?? null, spin: last.spin, flip: last.flip }
}

/** Uitlegtijden van de 2D-kicker (lip ±0.3, lucht 0.36-0.72, landing 0.78) naar de nieuwe tijdlijn. */
export function remapSteps(st: Step[], ride: Ride): Step[] {
  const D = ride.duration
  const from = [0, 0.24, 0.36, 0.72, 0.78, 1]
  const to = [0, (ride.takeoff - 0.6) / D, (ride.takeoff + 0.05) / D, (ride.land - 0.12) / D, (ride.land + 0.05) / D, 1]
  const map = (t: number) => {
    for (let i = 0; i < from.length - 1; i++)
      if (t <= from[i + 1]) return to[i] + ((t - from[i]) / (from[i + 1] - from[i])) * (to[i + 1] - to[i])
    return 1
  }
  return st.map((s) => ({ ...s, t: map(s.t) }))
}

/** Grab-tweaks: method en japan trekken het board scheef achter/onder je. */
const TWEAK: Partial<Record<GrabKind, { edge: number; twist: number }>> = {
  method: { edge: 0.9, twist: 18 },
  japan: { edge: -0.6, twist: -10 },
}

export function kickerMotion(trick: AirTrick, st: Step[]): Motion {
  const ride = simulateRide()
  const { takeoff: tT, land: tL, duration: D } = ride
  const T = tL - tT
  const spin = trick.spin ?? 0
  const flip = trick.flip ?? 0
  const r = Math.sign(spin)
  const grab = trick.grab ?? null
  const tweak = grab ? TWEAK[grab] : undefined
  const landSwitch = Math.round(Math.abs(spin) / 180) % 2 === 1

  const poses: Pose[] = [
    { s: 0, crouch: 0.35, lean: 0, twist: 0, look: 80, heading: 90 },
    // transition: centraal blijven, licht inveren
    { s: tT - 0.6, crouch: 0.45, lean: 0, twist: spin ? 22 * r : 0, heading: 90 },
    { s: tT - 0.1, crouch: 0.5, lean: -0.15, twist: spin ? 30 * r : 0, heading: 90 },
    // pop van de lip: benen strekken
    { s: tT + 0.02, crouch: 0.15, lean: -0.3, heading: 90 },
    // knieën naar je borst: bij een grab een echte tuck (> 1), het board komt naar je hand
    { s: tT + 0.2, crouch: grab ? 0.95 : 0.55, lean: 0 },
    { s: tT + 0.35, crouch: grab ? 1.45 : flip ? 1.1 : 0.65 },
    { s: tL - 0.3, crouch: grab ? 1.4 : flip ? 1.05 : 0.62 },
    // board onder je, benen lang om de landing te pakken
    { s: tL - 0.12, crouch: 0.5 },
    { s: tL, crouch: 0.45 },
    { s: tL + 0.14, crouch: 0.82, lean: 0.1 },
    { s: tL + 0.7, crouch: 0.4, lean: 0 },
    { s: D, crouch: 0.35 },
  ]
  if (spin) {
    // schouders leiden de draai (twist tegen r in = vóór het board uit), board volgt
    poses.push(
      { s: tT + 0.08, heading: 90 + 0.06 * spin, twist: -25 * r },
      { s: tT + T * 0.5, heading: 90 + 0.55 * spin, twist: -30 * r, look: Math.abs(spin) >= 360 ? 20 : 40 },
      { s: tL - 0.12, heading: 90 + spin, twist: -6 * r, look: landSwitch ? -75 : 75 },
      { s: tL + 0.1, twist: 0, look: landSwitch ? -80 : 80 },
    )
  }

  const keys: Key3[] = []
  const fps = 40
  const n = Math.round(D * fps)
  let j = 0
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * D
    while (j < ride.samples.length - 1 && ride.samples[j + 1].s <= s) j++
    const p = ride.samples[j]
    const air = p.ground === null
    const u = air ? Math.min(1, Math.max(0, (s - tT) / T)) : 0
    const e = u * u * (3 - 2 * u)
    // in de lucht van de lip-hoek naar de hoek van de landing (+ flip)
    const pitch = air ? KICKER.lip + (-KICKER.land + flip - KICKER.lip) * e : (p.ground ?? 0) + (s > tL ? flip : 0)
    // grab: na de pop pakken, vóór de landing loslaten
    const gIn = Math.min(1, Math.max(0, (s - tT - 0.12) / 0.18))
    const gOut = Math.min(1, Math.max(0, (tL - 0.18 - s) / 0.14))
    const g = grab ? Math.min(gIn, gOut) : 0
    keys.push({
      t: i / n,
      x: 0,
      z: p.z,
      y: p.y,
      heading: channel(poses, 'heading', s, 90),
      edge: tweak ? tweak.edge * g : 0,
      pitch,
      crouch: channel(poses, 'crouch', s, 0.35),
      lean: channel(poses, 'lean', s, 0),
      twist: channel(poses, 'twist', s, 0) + (tweak ? tweak.twist * g : 0),
      look: channel(poses, 'look', s, 80),
      // op de kicker sta je haaks op je board; in de lucht iets rechter, bij een flip draai je helemaal mee
      upright: air ? (flip ? 0 : 0.45) : 0.15,
      arms: 'uit',
      grab,
      g,
    })
  }
  return { keys, duration: D, steps: remapSteps(st, ride), terrain: 'kicker', slope: 0, camera: 'zij' }
}
