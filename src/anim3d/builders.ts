// Bouwers voor 3D-bewegingen.
// Bochten en traverses worden fysiek afgeleid uit hun baan: de kanteling van het board volgt uit
// de kracht die de sneeuw moet leveren (bochtkracht + zwaartekracht langs de helling),
// de blik gaat naar de rijrichting en de schouders draaien vóór het board de nieuwe bocht in.
import { Vector3 } from 'three'
import { normalize, sample, SIDE_DEFAULT, TOP_DEFAULT, type SideAnim, type Step, type TopAnim } from '../anim/engine'
import { MAX_ROLL, headingVectors } from './solve'
import type { CameraPreset, Key3, Motion, Terrain } from './types'

const G = 9.81
const deg = (r: number) => (r * 180) / Math.PI
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export const steps = (pairs: [number, string, Step['cue']?][]): Step[] =>
  pairs.map(([t, label, cue]) => (cue === undefined ? { t, label } : { t, label, cue }))

export interface PathPoint {
  x: number
  z: number
  /** board-richting; standaard de rijrichting (+180 bij switch) */
  heading?: number
  y?: number
}

export interface BodyStyle {
  /** hoeveel van de fysieke kanteling het board echt haalt (slippen = minder) */
  edgeGain?: number
  /** basishouding en extra diepte in de bocht */
  crouch?: number
  crouchInTurn?: number
  /** schouders vóór het board laten draaien (graden per graad koersverandering) */
  lead?: number
  /** hoe ver vooruit (s) de schouders al naar de nieuwe richting draaien */
  anticipate?: number
  /** gewicht naar voren bij het starten van een bocht */
  initLean?: number
  switch?: boolean
  arms?: Key3['arms']
}

/**
 * Bemonstert een baan (u = 0..1 over `duration`) en vult edge, houding, schouders en blik in.
 * `override` mag per sample velden overschrijven (bijv. een stop of een expliciete edge).
 */
export function fromPath(
  path: (u: number) => PathPoint,
  duration: number,
  slopeDeg: number,
  style: BodyStyle = {},
  samples = 90,
  override?: (u: number, k: Key3) => Partial<Key3>,
): Key3[] {
  const s = { edgeGain: 1, crouch: 0.3, crouchInTurn: 0.35, lead: 0.5, anticipate: 0.3, initLean: 0.2, arms: 'uit' as const, ...style }
  const dt = duration / samples
  const pos = (u: number) => {
    const p = path(clamp(u, 0, 1))
    return new Vector3(p.x, p.y ?? 0, p.z)
  }
  const vel = (u: number) =>
    pos(u + 0.5 / samples)
      .sub(pos(u - 0.5 / samples))
      .divideScalar(dt)
  const travelHeading = (u: number) => {
    const v = vel(u)
    return v.lengthSq() < 1e-6 ? null : deg(Math.atan2(v.z, v.x))
  }
  const gSlope = new Vector3(0, 0, G * Math.sin((slopeDeg * Math.PI) / 180))
  const gNormal = G * Math.cos((slopeDeg * Math.PI) / 180)
  const keys: Key3[] = []
  let lastHeading = 90
  for (let i = 0; i <= samples; i++) {
    const u = i / samples
    const p = path(u)
    const v = vel(u)
    const a = vel(u + 0.5 / samples)
      .sub(vel(u - 0.5 / samples))
      .divideScalar(dt)
    const th = travelHeading(u) ?? lastHeading - (s.switch ? 180 : 0)
    const heading = p.heading ?? th + (s.switch ? 180 : 0)
    lastHeading = heading
    const { nose, toe } = headingVectors(heading)
    // kracht die de sneeuw op het board moet leveren (per kg), loodrecht op het board
    const fSnow = a.clone().sub(gSlope)
    const lateral = fSnow.dot(toe)
    const roll = Math.atan2(Math.abs(lateral), gNormal) * Math.sign(lateral)
    const edge = clamp((roll / MAX_ROLL) * s.edgeGain, -1.7, 1.7)
    // schouders leiden: draai alvast mee met de koers die eraan komt
    const ahead = travelHeading(u + s.anticipate / duration) ?? th
    const turnAhead = ((ahead - th + 540) % 360) - 180
    const twist = clamp(-turnAhead * s.lead, -40, 40)
    // blik naar de rijrichting
    let look = s.switch ? -80 : 80
    if (v.lengthSq() > 0.04) {
      const fwd = v.clone().normalize()
      const yaw = deg(Math.atan2(fwd.dot(nose), fwd.dot(toe)))
      look = clamp(yaw - twist, -105, 110)
    }
    const flat = 1 - Math.min(1, Math.abs(edge) * 2.2)
    const k: Key3 = {
      t: u,
      x: p.x,
      z: p.z,
      y: p.y ?? 0,
      heading,
      edge,
      crouch: clamp(s.crouch + s.crouchInTurn * Math.min(1, Math.abs(edge)) - 0.08 * flat, 0, 1),
      lean: (s.switch ? -1 : 1) * s.initLean * flat,
      twist,
      look,
      arms: s.arms,
    }
    keys.push({ ...k, ...(override?.(u, k) ?? {}) })
  }
  return keys
}

export type TurnStyle = 'slip' | 'controle' | 'dynamisch' | 'carve' | 'euro'

const TURN: Record<
  TurnStyle,
  { speed: number; len: number; width: number; skid: number; gain: number; crouch: number; inTurn: number; lead: number }
> = {
  slip: { speed: 3.6, len: 6, width: 3.4, skid: 1.35, gain: 0.42, crouch: 0.32, inTurn: 0.35, lead: 0.55 },
  controle: { speed: 3, len: 5, width: 4.2, skid: 1.42, gain: 0.48, crouch: 0.32, inTurn: 0.4, lead: 0.55 },
  dynamisch: { speed: 6, len: 8.5, width: 4.2, skid: 1.15, gain: 0.72, crouch: 0.3, inTurn: 0.45, lead: 0.35 },
  carve: { speed: 9, len: 13, width: 4.6, skid: 1, gain: 1, crouch: 0.32, inTurn: 0.42, lead: 0.12 },
  euro: { speed: 9.5, len: 14, width: 5.2, skid: 1, gain: 1.35, crouch: 0.42, inTurn: 0.45, lead: 0.1 },
}

/** Gekoppelde bochten. `first` = welke bocht je als eerste maakt. */
export function turns(
  style: TurnStyle,
  count: number,
  first: 'toe' | 'heel' = 'toe',
  opts: { switch?: boolean; slope?: number } = {},
): Key3[] {
  const c = TURN[style]
  const slope = opts.slope ?? 16
  const totalZ = c.len * count
  const duration = totalZ / (c.speed * 0.78)
  const sign = (first === 'toe' ? 1 : -1) * (opts.switch ? -1 : 1)
  return fromPath(
    (u) => {
      const z = u * totalZ
      const x = sign * c.width * Math.sin((Math.PI * z) / c.len)
      const dx = sign * c.width * (Math.PI / c.len) * Math.cos((Math.PI * z) / c.len)
      const th = deg(Math.atan2(1, dx))
      // slippen: board staat verder dwars dan de rijrichting
      let heading = clamp(90 + (th - 90) * c.skid, 4, 176)
      if (opts.switch) heading += 180
      return { x, z, heading }
    },
    duration,
    slope,
    {
      edgeGain: c.gain,
      crouch: c.crouch,
      crouchInTurn: c.inTurn,
      lead: c.lead,
      switch: opts.switch,
      arms: style === 'euro' ? 'uit' : 'uit',
    },
    Math.round(36 * count),
    style === 'euro'
      ? (_, k) => ({ arms: (k.edge ?? 0) > 1 ? 'sneeuw' : 'uit', crouch: Math.min(1, (k.crouch ?? 0.4) + 0.15) })
      : undefined,
  )
}

export function turnsDuration(style: TurnStyle, count: number) {
  const c = TURN[style]
  return (c.len * count) / (c.speed * 0.78)
}

export function motion(
  keys: Key3[],
  duration: number,
  st: Step[],
  opts: { terrain?: Terrain; slope?: number; camera?: CameraPreset } = {},
): Motion {
  return { keys, duration, steps: st, terrain: opts.terrain ?? 'piste', slope: opts.slope ?? 16, camera: opts.camera ?? 'zij' }
}

// ── Omzetten van de oude 2D-animaties (freestyle, park, freeride) ──────────────

const OBSTACLE_TERRAIN: Record<string, Terrain> = {
  kicker: 'kicker',
  box: 'box',
  rail: 'rail',
  pipe: 'poeder',
  object: 'vlak',
  none: 'piste',
}
export const SIDE_SCALE = { z: 4, y: 1.4 }

export function fromSide(anim: SideAnim): Motion {
  const keys = normalize(anim.keys, SIDE_DEFAULT)
  const N = 70
  const out: Key3[] = []
  const spinAt = (t: number) => sample(keys, Math.min(1, Math.max(0, t))).spin
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const k = sample(keys, t)
    // schouders draaien vóór het board (anticipatie) en blik naar de landing
    const lead = clamp(-(spinAt(t + 0.07) - spinAt(t)) * 0.9, -60, 60)
    const heading = 90 + k.spin
    const switchRiding = Math.cos((k.spin * Math.PI) / 180) < 0
    out.push({
      t,
      x: 0,
      z: k.x * SIDE_SCALE.z,
      y: k.y * SIDE_SCALE.y,
      heading,
      edge: 0,
      pitch: k.flip,
      crouch: k.crouch,
      lean: k.lean,
      twist: lead,
      look: switchRiding ? -80 : 80,
      arms: k.arms,
      grab: k.grab,
      g: k.g,
      down: k.down,
    })
  }
  return {
    keys: out,
    duration: anim.duration,
    steps: anim.steps,
    terrain: OBSTACLE_TERRAIN[anim.obstacle ?? 'none'],
    slope: anim.obstacle && anim.obstacle !== 'none' && anim.obstacle !== 'pipe' ? 0 : Math.max(8, anim.slope ?? 8),
    camera: 'zij',
  }
}

export function fromTop(anim: TopAnim): Motion {
  const keys = normalize(anim.keys, TOP_DEFAULT)
  const terrain: Terrain =
    anim.scenery === 'trees' ? 'bomen' : anim.scenery === 'moguls' ? 'bulten' : anim.scenery === 'lift' ? 'lift' : 'piste'
  const out = fromPath(
    (u) => {
      const k = sample(keys, u, ['y'])
      return { x: k.x * 5, z: k.y * 7, heading: k.angle }
    },
    anim.duration,
    16,
    { edgeGain: 0.7 },
    90,
    (u, k) => {
      const e = sample(keys, u, ['y']).edge
      const want = e === 'heel' ? -0.45 : e === 'toe' ? 0.45 : 0
      // edge-richting uit de oude animatie, sterkte uit de fysica
      return { edge: e === 'flat' ? (k.edge ?? 0) * 0.3 : Math.sign(want) * Math.max(Math.abs(k.edge ?? 0), 0.3) }
    },
  )
  return { keys: out, duration: anim.duration, steps: anim.steps, terrain, slope: 16, camera: 'mee' }
}

// ── Rijden over een baan van segmenten ────────────────────────────────────────

export interface Segment {
  /** duur in seconden */
  dur: number
  /** rijrichting (graden) aan het begin en eind van het segment */
  from: number
  to?: number
  /** snelheid m/s aan het begin en eind */
  v0: number
  v1?: number
  /** hoek tussen board en rijrichting (0 = board in rijrichting, -90 = dwars met neus naar links van de rijrichting) */
  board0?: number
  board1?: number
}

/**
 * Integreert segmenten tot een baan. Geeft een padfunctie (u → positie + boardrichting) en de totale duur.
 */
export function drive(segs: Segment[], start: { x?: number; z?: number } = {}) {
  const total = segs.reduce((a, s) => a + s.dur, 0)
  const dt = 1 / 240
  const pts: { t: number; x: number; z: number; heading: number }[] = []
  let x = start.x ?? 0
  let z = start.z ?? 0
  let t = 0
  for (const s of segs) {
    const n = Math.max(1, Math.round(s.dur / dt))
    for (let i = 0; i < n; i++) {
      const f = i / n
      const e = f * f * (3 - 2 * f)
      const th = s.from + ((s.to ?? s.from) - s.from) * e
      const sp = s.v0 + ((s.v1 ?? s.v0) - s.v0) * f
      const bo = (s.board0 ?? 0) + ((s.board1 ?? s.board0 ?? 0) - (s.board0 ?? 0)) * e
      pts.push({ t, x, z, heading: th + bo })
      const r = (th * Math.PI) / 180
      x += Math.cos(r) * sp * (s.dur / n)
      z += Math.sin(r) * sp * (s.dur / n)
      t += s.dur / n
    }
  }
  pts.push({ t, x, z, heading: pts[pts.length - 1].heading })
  const path = (u: number): PathPoint => {
    const tt = u * total
    let i = 0
    while (i < pts.length - 2 && pts[i + 1].t < tt) i++
    const a = pts[i]
    const b = pts[i + 1]
    const f = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 0
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: a.heading + (b.heading - a.heading) * f }
  }
  return { path, duration: total }
}
