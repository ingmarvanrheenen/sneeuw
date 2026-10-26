// Mini-animatie-engine voor trick-uitleg. Een animatie is een lijst keyframes
// (t van 0 tot 1). Ontbrekende waarden erven van de vorige keyframe.

export type GrabKind = 'indy' | 'mute' | 'melon' | 'stalefish' | 'nose' | 'tail' | 'method' | 'japan' | 'roast' | 'seatbelt'

/** Zijaanzicht: de camera kijkt naar de rider, board-neus wijst naar rechts bij spin 0. */
export interface SideKey {
  t: number
  /** -1..1 horizontale positie */
  x?: number
  /** hoogte boven de grond (1 ≈ een riderlengte) */
  y?: number
  /** rotatie rond de verticale as in graden. + = frontside, - = backside */
  spin?: number
  /** rotatie in het vlak in graden. + = neus omhoog */
  flip?: number
  /** 0 = rechtop, 1 = diep door de knieën */
  crouch?: number
  /** gewicht -1 (tail) .. 1 (neus) */
  lean?: number
  grab?: GrabKind | null
  /** 0..1 hoe ver de grab is */
  g?: number
  arms?: 'uit' | 'los' | 'omhoog'
  /** 0..1 rider ligt/valt (voor vallen en opstaan) */
  down?: number
}

export type Obstacle = 'kicker' | 'box' | 'rail' | 'object' | 'pipe' | 'none'

export interface SideAnim {
  view: 'side'
  duration: number
  keys: SideKey[]
  obstacle?: Obstacle
  /** helling van de piste in graden */
  slope?: number
  steps: Step[]
}

/** Bovenaanzicht: dal is onderaan het scherm. */
export interface TopKey {
  t: number
  /** -1..1 */
  x?: number
  /** -1 (boven) .. 1 (onder) */
  y?: number
  /** hoek van het board in graden: 0 = dwars op de helling (neus naar rechts), 90 = neus naar het dal */
  angle?: number
  edge?: 'heel' | 'toe' | 'flat'
}

export interface TopAnim {
  view: 'top'
  duration: number
  keys: TopKey[]
  scenery?: 'trees' | 'moguls' | 'lift' | 'none'
  steps: Step[]
}

export interface Step {
  t: number
  label: string
}

export type Anim = SideAnim | TopAnim

export const SIDE_DEFAULT: Required<Omit<SideKey, 't'>> = {
  x: 0,
  y: 0,
  spin: 0,
  flip: 0,
  crouch: 0.3,
  lean: 0,
  grab: null,
  g: 0,
  arms: 'uit',
  down: 0,
}

export const TOP_DEFAULT: Required<Omit<TopKey, 't'>> = { x: 0, y: 0, angle: 0, edge: 'flat' }

export type FullSideKey = Required<SideKey>
export type FullTopKey = Required<TopKey>

/** Vul ontbrekende waarden aan met die van de vorige keyframe. */
export function normalize<K extends { t: number }>(keys: K[], defaults: Omit<Required<K>, 't'>): Required<K>[] {
  const out: Required<K>[] = []
  let prev = { ...defaults, t: 0 } as Required<K>
  for (const k of [...keys].sort((a, b) => a.t - b.t)) {
    const merged = { ...prev } as Required<K>
    for (const [key, v] of Object.entries(k)) if (v !== undefined) (merged as Record<string, unknown>)[key] = v
    out.push(merged)
    prev = merged
  }
  return out
}

export const ease = (u: number) => u * u * (3 - 2 * u)
const lerp = (a: number, b: number, u: number) => a + (b - a) * u

/** Geeft de geïnterpoleerde pose op tijd t (0..1). */
export function sample<K extends { t: number }>(keys: Required<K>[], t: number): Required<K> {
  if (keys.length === 0) throw new Error('geen keyframes')
  if (t <= keys[0].t) return keys[0]
  const last = keys[keys.length - 1]
  if (t >= last.t) return last
  let i = 0
  while (i < keys.length - 1 && keys[i + 1].t < t) i++
  const a = keys[i]
  const b = keys[i + 1]
  const span = b.t - a.t || 1
  const u = ease((t - a.t) / span)
  const out = { ...a } as Record<string, unknown>
  for (const key of Object.keys(a)) {
    const va = (a as Record<string, unknown>)[key]
    const vb = (b as Record<string, unknown>)[key]
    if (typeof va === 'number' && typeof vb === 'number') out[key] = lerp(va, vb, u)
    else out[key] = u < 0.5 ? va : vb
  }
  out.t = t
  // grab-naam vasthouden zolang er nog gegrabd wordt
  if ('grab' in out && (a as unknown as SideKey).grab && !(b as unknown as SideKey).grab) out.grab = (a as unknown as SideKey).grab
  if ('grab' in out && !(a as unknown as SideKey).grab && (b as unknown as SideKey).grab) out.grab = (b as unknown as SideKey).grab
  return out as Required<K>
}

export function currentStep(steps: Step[], t: number): number {
  let idx = -1
  steps.forEach((s, i) => {
    if (s.t <= t + 1e-6) idx = i
  })
  return idx
}

export function validateAnim(anim: Anim): string[] {
  const errors: string[] = []
  if (anim.keys.length < 2) errors.push('minder dan 2 keyframes')
  for (let i = 1; i < anim.keys.length; i++) {
    if (anim.keys[i].t < anim.keys[i - 1].t) errors.push(`keyframes niet op volgorde bij index ${i}`)
  }
  for (const k of anim.keys) if (k.t < 0 || k.t > 1) errors.push(`t buiten 0..1: ${k.t}`)
  for (const s of anim.steps) if (s.t < 0 || s.t > 1) errors.push(`stap buiten 0..1: ${s.label}`)
  if (anim.duration <= 0) errors.push('duur moet > 0')
  return errors
}
