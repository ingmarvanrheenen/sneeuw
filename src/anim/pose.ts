// Pseudo-3D pose → 2D lijnen. Lokaal assenstelsel van het board:
//   X = langs het board (neus +), Y = omhoog, Z = naar de tenen (rider kijkt naar +Z).
// Daarna pitch (flip, om Z), yaw (spin, om Y) en een orthografische projectie (camera op +Z).
import type { FullSideKey, GrabKind } from './engine'

export type V3 = [number, number, number]
export interface Seg {
  a: [number, number]
  b: [number, number]
  w: number
  z: number
  part: 'leg' | 'arm' | 'torso'
}
export interface PoseOut {
  segs: Seg[]
  head: { x: number; y: number; r: number; z: number; facing: number }
  board: { pts: [number, number][]; nose: [number, number]; tail: [number, number]; z: number }
}

const L = 36 // halve boardlengte
const W = 7 // halve boardbreedte
const S = 16 // halve stance

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

function rotX(p: V3, ang: number, pivot: V3): V3 {
  const y = p[1] - pivot[1]
  const z = p[2] - pivot[2]
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c]
}

export function pose(k: FullSideKey): PoseOut {
  const crouch = Math.max(0, Math.min(1, k.crouch))
  const down = k.down
  const H = 46 - 18 * crouch - Math.abs(down) * 14
  const hips: V3 = [k.lean * 9, 4 + H, -(2 + 8 * crouch)]
  const fwd = 0.18 + 0.5 * crouch
  const T = 28
  const sh: V3 = [hips[0] + k.lean * 4, hips[1] + T * Math.cos(fwd), hips[2] + T * Math.sin(fwd)]
  const head: V3 = [sh[0] + k.lean * 2, sh[1] + 11, sh[2] + 2]
  const shF: V3 = [sh[0] + 7, sh[1], sh[2]]
  const shB: V3 = [sh[0] - 7, sh[1], sh[2]]
  const footF: V3 = [S, 4, 0]
  const footB: V3 = [-S, 4, 0]
  const kneeF: V3 = [S * 0.72 + k.lean * 4, 4 + H * 0.5, 6 + 14 * crouch]
  const kneeB: V3 = [-S * 0.72 + k.lean * 4, 4 + H * 0.5, 6 + 14 * crouch]

  // armen
  let handF: V3
  let handB: V3
  if (k.arms === 'omhoog') {
    handF = [sh[0] + 12, sh[1] + 16, sh[2] + 2]
    handB = [sh[0] - 12, sh[1] + 16, sh[2] + 2]
  } else if (k.arms === 'los') {
    handF = [hips[0] + 10, hips[1] - 2, 8]
    handB = [hips[0] - 10, hips[1] - 2, 8]
  } else {
    handF = [sh[0] + 26, sh[1] - 12, sh[2] + 4]
    handB = [sh[0] - 26, sh[1] - 12, sh[2] + 4]
  }
  if (k.grab && k.g > 0) {
    const tgt = GRAB_TARGET[k.grab]
    const p: V3 = [tgt.x * L, 3, tgt.z * (W + 1)]
    if (tgt.hand === 'front') handF = lerp3(handF, p, k.g)
    else handB = lerp3(handB, p, k.g)
  }
  const elbow = (s: V3, h: V3): V3 => [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2 - 3, (s[2] + h[2]) / 2 + 3]

  // vallen: lichaam (niet het board) kantelt om de as langs het board
  const pivot: V3 = [0, 4, 0]
  const fall = (p: V3): V3 => (down ? rotX(p, rad(-down * 80), pivot) : p)
  const body = { hips, sh, head, shF, shB, kneeF, kneeB, handF, handB }
  const B = Object.fromEntries(Object.entries(body).map(([n, p]) => [n, fall(p)])) as typeof body

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
  const pr = (p: V3): [number, number] => {
    const q = tf(p)
    return [q[0], -q[1]]
  }
  const zOf = (...ps: V3[]) => ps.reduce((a, p) => a + tf(p)[2], 0) / ps.length

  const segs = (
    [
      { a: pr(footB), b: pr(B.kneeB), w: 7, z: zOf(footB, B.kneeB), part: 'leg' },
      { a: pr(B.kneeB), b: pr(B.hips), w: 8, z: zOf(B.kneeB, B.hips), part: 'leg' },
      { a: pr(footF), b: pr(B.kneeF), w: 7, z: zOf(footF, B.kneeF), part: 'leg' },
      { a: pr(B.kneeF), b: pr(B.hips), w: 8, z: zOf(B.kneeF, B.hips), part: 'leg' },
      { a: pr(B.hips), b: pr(B.sh), w: 13, z: zOf(B.hips, B.sh), part: 'torso' },
      { a: pr(B.shB), b: pr(elbow(B.shB, B.handB)), w: 6, z: zOf(B.shB, B.handB), part: 'arm' },
      { a: pr(elbow(B.shB, B.handB)), b: pr(B.handB), w: 5.5, z: zOf(B.handB), part: 'arm' },
      { a: pr(B.shF), b: pr(elbow(B.shF, B.handF)), w: 6, z: zOf(B.shF, B.handF), part: 'arm' },
      { a: pr(elbow(B.shF, B.handF)), b: pr(B.handF), w: 5.5, z: zOf(B.handF), part: 'arm' },
    ] satisfies Seg[]
  ).sort((a, b) => a.z - b.z) as Seg[]

  const hp = pr(B.head)
  // facing: >0 kijkt naar de camera, <0 van de camera af
  const faceDir = tf([0, 0, 1])
  const origin = tf([0, 0, 0])
  const boardCorners: V3[] = [
    [-L * 1.06, 7, -W * 0.8],
    [-L, 2, -W],
    [L, 2, -W],
    [L * 1.06, 7, -W * 0.8],
    [L * 1.06, 7, W * 0.8],
    [L, 2, W],
    [-L, 2, W],
    [-L * 1.06, 7, W * 0.8],
  ]
  return {
    segs,
    head: { x: hp[0], y: hp[1], r: 8, z: zOf(B.head), facing: faceDir[2] - origin[2] },
    board: { pts: boardCorners.map(pr), nose: pr([L * 1.03, 5, 0]), tail: pr([-L * 1.03, 5, 0]), z: 0 },
  }
}
