// Jibs: box en rail in meters, gedeeld door het 3D-model en de beweging.
// Box: je rijdt hem op via een korte ramp (geen ollie nodig). Rail: je ollie't erop met een echte boog
// die net over het begin van de rail komt en dalend op de rail landt. Eraf: kleine pop, vallen, landen.
// Boardslide = board dwars, borst blijft in de rijrichting (je kijkt naar het einde van de jib).
import { normalize, SIDE_DEFAULT, type SideAnim, type Step } from '../anim/engine'
import { channel, type Pose } from './freestyle'
import type { Key3, Motion } from './types'

const G = 9.81
const deg = (r: number) => (r * 180) / Math.PI

export type JibKind = 'box' | 'rail'

/** Afmetingen in meters (hellingsassenstelsel, z = het dal in). */
export const JIB = {
  box: { start: 0, ramp: 1.2, len: 5, height: 0.35, width: 0.5 },
  rail: { start: 0, len: 5, height: 0.42, radius: 0.035 },
}

/** Begin en einde van het glijdeel, en de hoogte waar het board op ligt. */
export function jibTop(kind: JibKind) {
  if (kind === 'box') {
    const b = JIB.box
    return { from: b.start + b.ramp, to: b.start + b.ramp + b.len, y: b.height }
  }
  const r = JIB.rail
  return { from: r.start, to: r.start + r.len, y: r.height + r.radius }
}

export interface JibRide {
  samples: { s: number; z: number; y: number; pitch: number; phase: 'sneeuw' | 'lucht' | 'jib' }[]
  /** pop (rail), op de jib, eraf, weer op de sneeuw */
  pop: number
  on: number
  off: number
  down: number
  duration: number
}

/** Rit over een box of rail op vaste snelheid langs de helling. */
export function simulateJib(kind: JibKind, speed = 4.5, dt = 1 / 120): JibRide {
  const top = jibTop(kind)
  const samples: JibRide['samples'] = []
  let s = 0
  let z = -10
  const push = (y: number, pitch: number, phase: JibRide['samples'][number]['phase']) => samples.push({ s, z, y, pitch, phase })
  let pop = 0
  let on = 0
  if (kind === 'box') {
    const b = JIB.box
    const angle = deg(Math.atan2(b.height, b.ramp))
    while (z < top.from) {
      const onRamp = z >= b.start
      push(onRamp ? ((z - b.start) / b.ramp) * b.height : 0, onRamp ? angle : 0, 'sneeuw')
      s += dt
      z += speed * dt
    }
    pop = s
    on = s
  } else {
    // ollie zo dat je net over het begin van de rail komt en dalend op de rail landt
    const popZ = top.from - 1.2
    const landZ = top.from + 0.6
    const T = (landZ - popZ) / speed
    const vy = (top.y + (G * T * T) / 2) / T
    while (z < popZ) {
      push(0, 0, 'sneeuw')
      s += dt
      z += speed * dt
    }
    pop = s
    while (z < landZ) {
      const t = s - pop
      push(Math.max(0, vy * t - (G * t * t) / 2), 0, 'lucht')
      s += dt
      z += speed * dt
    }
    on = s
  }
  // glijden: een beetje snelheid eraf door wrijving
  let v = speed
  while (z < top.to) {
    push(top.y, 0, 'jib')
    s += dt
    v = Math.max(3, v - 0.25 * dt)
    z += v * dt
  }
  const off = s
  // eraf met een kleine pop, vallen tot de sneeuw
  const vy = 1
  for (;;) {
    const t = s - off
    const y = top.y + vy * t - (G * t * t) / 2
    if (y <= 0) break
    push(y, 0, 'lucht')
    s += dt
    z += v * dt
  }
  const down = s
  while (s <= down + 1.3) {
    push(0, 0, 'sneeuw')
    s += dt
    z += v * dt
  }
  return { samples, pop, on, off, down, duration: s }
}

/** Box of rail, en of het een boardslide is, uit de 2D-animatie van de trick. */
export function jibFrom(anim: SideAnim): { kind: JibKind; sideways: boolean } {
  const keys = normalize(anim.keys, SIDE_DEFAULT)
  return { kind: anim.obstacle === 'rail' ? 'rail' : 'box', sideways: keys.some((k) => Math.abs(k.spin) >= 80) }
}

/** Uitlegtijden van de 2D-jib (op 0.33, eraf 0.68-0.76, landen 0.84) naar de nieuwe tijdlijn. */
export function remapJibSteps(st: Step[], ride: JibRide): Step[] {
  const D = ride.duration
  const from = [0, 0.18, 0.33, 0.68, 0.84, 1]
  const to = [0, (ride.pop - 0.4) / D, (ride.on + 0.05) / D, (ride.off - 0.1) / D, (ride.down + 0.05) / D, 1]
  const map = (t: number) => {
    for (let i = 0; i < from.length - 1; i++)
      if (t <= from[i + 1]) return to[i] + ((t - from[i]) / (from[i + 1] - from[i])) * (to[i + 1] - to[i])
    return 1
  }
  return st.map((s) => ({ ...s, t: map(s.t) }))
}

export function jibMotion(kind: JibKind, sideways: boolean, st: Step[]): Motion {
  const ride = simulateJib(kind)
  const { pop, on, off, down, duration: D } = ride
  // boardslide: board 90° dwars, de tenen (en je borst) wijzen het dal in
  const across = sideways ? 0 : 90
  const poses: Pose[] = [
    { s: 0, crouch: 0.35, lean: 0, heading: 90, look: 80, twist: 0 },
    { s: pop - 0.45, crouch: 0.42 },
    // rail: ollie erop
    ...(kind === 'rail'
      ? [
          { s: pop - 0.12, crouch: 0.6, lean: -0.5 },
          { s: pop + 0.02, crouch: 0.2, lean: -0.3 },
          { s: pop + 0.16, crouch: 0.62, lean: 0 },
        ]
      : [{ s: on - 0.15, crouch: 0.4 }]),
    // landen op de jib: inveren, dan rustig en centraal
    { s: on, crouch: 0.48, heading: across, look: sideways ? 0 : 80 },
    { s: on + 0.18, crouch: 0.5 },
    { s: off - 0.15, crouch: 0.44, heading: across, look: sideways ? 0 : 80 },
    // eraf: kleine pop, board terug recht in de lucht
    { s: off + 0.02, crouch: 0.25 },
    { s: off + 0.2, crouch: 0.55, heading: 90, look: 80 },
    { s: down, crouch: 0.45 },
    { s: down + 0.14, crouch: 0.76 },
    { s: down + 0.7, crouch: 0.38 },
    { s: D, crouch: 0.35 },
  ]
  if (sideways) {
    // het board draait op de jib (box) of in de lucht (rail) dwars
    poses.push({ s: kind === 'rail' ? pop + 0.05 : on - 0.2, heading: 90, look: 80 })
  }

  const keys: Key3[] = []
  const fps = 40
  const n = Math.round(D * fps)
  let j = 0
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * D
    while (j < ride.samples.length - 1 && ride.samples[j + 1].s <= s) j++
    const p = ride.samples[j]
    // op een rail balanceer je: kleine correcties op je edges
    const wobble = p.phase === 'jib' && kind === 'rail' ? 0.05 * Math.sin((s - on) * 9) : 0
    keys.push({
      t: i / n,
      x: 0,
      z: p.z,
      y: p.y,
      heading: channel(poses, 'heading', s, 90),
      edge: wobble,
      pitch: p.pitch,
      crouch: channel(poses, 'crouch', s, 0.35),
      lean: channel(poses, 'lean', s, 0),
      twist: channel(poses, 'twist', s, 0),
      look: channel(poses, 'look', s, 80),
      upright: 0.6,
      arms: 'uit',
    })
  }
  return { keys, duration: D, steps: remapJibSteps(st, ride), terrain: kind, slope: 8, camera: 'zij' }
}
