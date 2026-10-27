// Pseudo-3D pose → 2D tekenlaag. Lokaal assenstelsel van het board:
//   X = langs het board (neus +), Y = omhoog, Z = naar de tenen (rider kijkt naar +Z).
// Daarna pitch (flip, om Z), yaw (spin, om Y) en een orthografische projectie (camera op +Z).
// De renderer krijgt gesorteerde vormen (achter → voor) plus benoemde punten voor coaching-markeringen.
import type { BodyPart, FullSideKey, GrabKind } from './engine'

export type V3 = [number, number, number]
export type P2 = [number, number]
export type Fill = 'jacket' | 'pants' | 'gear' | 'board' | 'binding' | 'lens' | 'skin'

export type Shape =
  | { type: 'line'; a: P2; b: P2; w: number; fill: Fill; z: number }
  | { type: 'poly'; pts: P2[]; fill: Fill; z: number }
  | { type: 'circle'; c: P2; r: number; fill: Fill; z: number }

export interface PoseOut {
  shapes: Shape[]
  points: Record<BodyPart, P2>
  /** >0 kijkt naar de camera, <0 ervan af */
  facing: number
}

const L = 36 // halve boardlengte
const W = 7.5 // halve boardbreedte
const S = 15 // halve stance

const GRAB_TARGET: Record<GrabKind, { hand: 'front' | 'back'; x: number; z: number }> = {
  indy: { hand: 'back', x: -0.05, z: 1 },
  mute: { hand: 'front', x: 0.3, z: 1 },
  melon: { hand: 'front', x: 0.05, z: -1 },
  stalefish: { hand: 'back', x: -0.15, z: -1 },
  nose: { hand: 'front', x: 0.95, z: 0 },
  tail: { hand: 'back', x: -0.95, z: 0 },
  method: { hand: 'front', x: 0, z: -1 },
  japan: { hand: 'front', x: 0.35, z: 1 },
  roast: { hand: 'back', x: -0.3, z: -1 },
  seatbelt: { hand: 'front', x: -0.9, z: 0 },
}

const rad = (d: number) => (d * Math.PI) / 180
const lerp3 = (a: V3, b: V3, u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mid = (a: V3, b: V3): V3 => lerp3(a, b, 0.5)

function rotX(p: V3, ang: number, pivot: V3): V3 {
  const y = p[1] - pivot[1]
  const z = p[2] - pivot[2]
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c]
}

/** Knie zo plaatsen dat dij en scheen (ongeveer) gelijke lengte houden: knie buigt naar de tenen. */
function knee(foot: V3, hip: V3, len: number): V3 {
  const m = mid(foot, hip)
  const d = Math.hypot(hip[0] - foot[0], hip[1] - foot[1], hip[2] - foot[2])
  const bend = Math.sqrt(Math.max(0, len * len - (d / 2) ** 2))
  return [m[0], m[1], m[2] + bend]
}

export function pose(k: FullSideKey): PoseOut {
  const crouch = Math.max(0, Math.min(1, k.crouch))
  const down = k.down
  const legLen = 24 // dij = scheen
  const H = 47 - 19 * crouch - Math.abs(down) * 14 // heuphoogte boven het board
  const pelvis: V3 = [k.lean * 9, 5 + H, -(1 + 9 * crouch)]
  const hipF = add(pelvis, [5, 0, 0])
  const hipB = add(pelvis, [-5, 0, 0])
  const fwd = 0.16 + 0.5 * crouch // romp buigt voorover bij door de knieën gaan
  const T = 26
  const chest: V3 = [pelvis[0] + k.lean * 4, pelvis[1] + T * Math.cos(fwd), pelvis[2] + T * Math.sin(fwd)]
  const shF = add(chest, [8.5, 0, 0])
  const shB = add(chest, [-8.5, 0, 0])
  const neck = add(chest, [k.lean * 1.5, 4, 1])
  const head = add(chest, [k.lean * 2, 12.5, 2.5])
  const footF: V3 = [S, 5, 0]
  const footB: V3 = [-S, 5, 0]
  const kneeF = knee(footF, hipF, legLen)
  const kneeB = knee(footB, hipB, legLen)

  let handF: V3
  let handB: V3
  if (k.arms === 'omhoog') {
    handF = add(chest, [12, 15, 3])
    handB = add(chest, [-12, 15, 3])
  } else if (k.arms === 'los') {
    handF = add(pelvis, [11, -1, 8])
    handB = add(pelvis, [-11, -1, 8])
  } else {
    // armen ontspannen boven het board voor balans
    handF = add(chest, [25, -11, 5])
    handB = add(chest, [-24, -12, 5])
  }
  if (k.grab && k.g > 0) {
    const tgt = GRAB_TARGET[k.grab]
    const p: V3 = [tgt.x * L, 4, tgt.z * (W + 1)]
    if (tgt.hand === 'front') handF = lerp3(handF, p, k.g)
    else handB = lerp3(handB, p, k.g)
  }
  const elbow = (s: V3, h: V3): V3 => add(mid(s, h), [0, -3, 4])

  // vallen: lichaam (niet het board) kantelt om de as langs het board
  const pivot: V3 = [0, 5, 0]
  const fall = (p: V3): V3 => (down ? rotX(p, rad(-down * 80), pivot) : p)
  const raw = { pelvis, hipF, hipB, chest, shF, shB, neck, head, kneeF, kneeB, handF, handB }
  const B = Object.fromEntries(Object.entries(raw).map(([n, p]) => [n, fall(p)])) as typeof raw
  const elbowF = elbow(B.shF, B.handF)
  const elbowB = elbow(B.shB, B.handB)

  // pitch (flip) om Z, dan yaw (spin) om Y
  const cp = Math.cos(rad(k.flip))
  const sp = Math.sin(rad(k.flip))
  const cy = Math.cos(rad(k.spin))
  const sy = Math.sin(rad(k.spin))
  const tf = (p: V3): V3 => {
    const x1 = p[0] * cp - p[1] * sp
    const y1 = p[0] * sp + p[1] * cp
    const z1 = p[2]
    return [x1 * cy + z1 * sy, y1, -x1 * sy + z1 * cy]
  }
  const pr = (p: V3): P2 => {
    const q = tf(p)
    return [q[0], -q[1]]
  }
  const zOf = (...ps: V3[]) => ps.reduce((a, p) => a + tf(p)[2], 0) / ps.length

  const shapes: Shape[] = []
  const line = (a: V3, b: V3, w: number, fill: Fill, bias = 0) =>
    shapes.push({ type: 'line', a: pr(a), b: pr(b), w, fill, z: zOf(a, b) + bias })

  // board met opgebogen neus en tail
  const corners: V3[] = [
    [-L * 1.07, 8, -W * 0.75],
    [-L, 2.5, -W],
    [L, 2.5, -W],
    [L * 1.07, 8, -W * 0.75],
    [L * 1.07, 8, W * 0.75],
    [L, 2.5, W],
    [-L, 2.5, W],
    [-L * 1.07, 8, W * 0.75],
  ]
  shapes.push({ type: 'poly', pts: corners.map(pr), fill: 'board', z: -100 })
  // bindingen
  for (const f of [footF, footB]) line(add(f, [0, 0, -W * 0.85]), add(f, [0, 0, W * 0.85]), 4, 'binding', -50)

  // benen (broek) en boots
  line(footB, B.kneeB, 8.5, 'pants')
  line(B.kneeB, B.hipB, 10, 'pants')
  line(footF, B.kneeF, 8.5, 'pants')
  line(B.kneeF, B.hipF, 10, 'pants')
  line(add(footB, [-3, -1, 0]), add(footB, [3, -1, 1.5]), 8, 'gear', 0.5)
  line(add(footF, [-3, -1, 0]), add(footF, [3, -1, 1.5]), 8, 'gear', 0.5)

  // romp (jas) als vlak tussen heupen en schouders
  shapes.push({
    type: 'poly',
    pts: [pr(add(B.hipB, [-1.5, -2, 0])), pr(add(B.hipF, [1.5, -2, 0])), pr(B.shF), pr(B.shB)],
    fill: 'jacket',
    z: zOf(B.pelvis, B.chest),
  })
  line(B.pelvis, B.chest, 12, 'jacket')
  line(B.chest, B.neck, 6, 'jacket')

  // armen (jas) en handschoenen
  line(B.shB, elbowB, 6.5, 'jacket')
  line(elbowB, B.handB, 6, 'jacket')
  line(B.shF, elbowF, 6.5, 'jacket')
  line(elbowF, B.handF, 6, 'jacket')
  shapes.push({ type: 'circle', c: pr(B.handB), r: 3.6, fill: 'gear', z: zOf(B.handB) + 0.5 })
  shapes.push({ type: 'circle', c: pr(B.handF), r: 3.6, fill: 'gear', z: zOf(B.handF) + 0.5 })

  // hoofd: helm + goggle aan de gezichtskant
  const faceDir = tf([0, 0, 1])
  const origin = tf([0, 0, 0])
  const facing = faceDir[2] - origin[2]
  shapes.push({ type: 'circle', c: pr(B.head), r: 8.5, fill: 'gear', z: zOf(B.head) })
  const lensCenter = add(B.head, [0, 0.5, 7])
  if (tf(lensCenter)[2] > tf(B.head)[2] - 1) {
    line(add(lensCenter, [-4.5, 0, -1]), add(lensCenter, [4.5, 0, -1]), 4.5, 'lens', 0)
    const last = shapes[shapes.length - 1]
    last.z = zOf(B.head) + 1
  }

  shapes.sort((a, b) => a.z - b.z)

  const points: Record<BodyPart, P2> = {
    head: pr(B.head),
    shoulders: pr(B.chest),
    hands: pr(mid(B.handF, B.handB)),
    'front-hand': pr(B.handF),
    'back-hand': pr(B.handB),
    hips: pr(B.pelvis),
    knees: pr(mid(B.kneeF, B.kneeB)),
    'front-foot': pr(footF),
    'back-foot': pr(footB),
    nose: pr([L * 1.05, 6, 0]),
    tail: pr([-L * 1.05, 6, 0]),
    board: pr([0, 3, 0]),
    'heel-edge': pr([0, 3, -W]),
    'toe-edge': pr([0, 3, W]),
  }
  return { shapes, points, facing }
}
