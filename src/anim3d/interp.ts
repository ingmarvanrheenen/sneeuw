// Vloeiende interpolatie voor 3D-keyframes.
// Monotone kubische spline (Fritsch-Carlson): snelheid loopt door over keyframes heen (geen hapering
// bij dichte fysica-keys), maar schiet nooit voorbij een waarde (een stilstand blijft een stilstand).
import { ease } from '../anim/engine'
import type { ArmPose, FullKey3, Key3 } from './types'
import { KEY3_DEFAULT } from './types'

type NumKey = Exclude<keyof FullKey3, 'arms' | 'grab'>
const NUM: NumKey[] = ['t', 'x', 'z', 'y', 'heading', 'edge', 'pitch', 'crouch', 'lean', 'twist', 'look', 'g', 'down', 'free', 'stride']

/** Een gesamplede pose: als FullKey3, plus een zachte overgang tussen twee armhoudingen. */
export type Pose3 = FullKey3 & { arms2: ArmPose; armsMix: number }

interface Channel {
  v: number[]
  m: number[]
}

export class Track {
  readonly keys: FullKey3[]
  private t: number[]
  private ch = new Map<NumKey, Channel>()

  constructor(raw: Key3[]) {
    // ontbrekende velden erven van de vorige key
    const keys: FullKey3[] = []
    let prev: FullKey3 = { ...KEY3_DEFAULT, t: 0 } as FullKey3
    for (const k of raw) {
      const full = { ...prev, ...k } as FullKey3
      if (!('grab' in k)) full.grab = prev.grab
      keys.push(full)
      prev = full
    }
    this.keys = keys
    this.t = keys.map((k) => k.t)
    for (const f of NUM) {
      if (f === 't') continue
      const v = keys.map((k) => k[f] as number)
      this.ch.set(f, { v, m: tangents(this.t, v) })
    }
  }

  sample(t: number): Pose3 {
    const keys = this.keys
    const n = keys.length
    const tt = Math.max(keys[0].t, Math.min(keys[n - 1].t, t))
    let i = 0
    while (i < n - 2 && keys[i + 1].t < tt) i++
    const a = keys[i]
    const b = keys[Math.min(n - 1, i + 1)]
    const h = b.t - a.t
    const u = h > 0 ? (tt - a.t) / h : 0
    const out = { ...a } as Pose3
    out.t = t
    if (h > 0) {
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1
      const h10 = u ** 3 - 2 * u ** 2 + u
      const h01 = -2 * u ** 3 + 3 * u ** 2
      const h11 = u ** 3 - u ** 2
      for (const [f, c] of this.ch) {
        ;(out as unknown as Record<string, number>)[f] = h00 * c.v[i] + h10 * h * c.m[i] + h01 * c.v[i + 1] + h11 * h * c.m[i + 1]
      }
    }
    // armen: vloeiend van de ene houding naar de andere
    out.arms = a.arms
    out.arms2 = b.arms
    out.armsMix = a.arms === b.arms ? 0 : ease(u)
    // grab-naam vasthouden zolang de hand nog onderweg is
    out.grab = a.grab ?? b.grab
    return out
  }
}

/** Fritsch-Carlson-tangenten: monotoon tussen keys, dus geen overshoot. */
function tangents(t: number[], v: number[]): number[] {
  const n = v.length
  if (n < 2) return [0]
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push(t[i + 1] > t[i] ? (v[i + 1] - v[i]) / (t[i + 1] - t[i]) : 0)
  const m = new Array<number>(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const k = 3 / Math.sqrt(s)
      m[i] = k * a * d[i]
      m[i + 1] = k * b * d[i]
    }
  }
  return m
}
