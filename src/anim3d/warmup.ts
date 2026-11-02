// Warming-up in 3D: de echte rider staat op vlakke sneeuw met zijn board aan en doet elke oefening voor.
// Pose-to-pose per kanaal (`perform()` met snelheid 0, dus op de plek); armen en sprongetjes per frame erbij.
import { motion, steps } from './builders'
import { airHeight, perform, type Pose } from './freestyle'
import type { ArmPose, CameraPreset, Key3, Motion } from './types'

/** Herhaal een cyclus van poses `n` keer binnen `d` seconden. */
function repeat(d: number, n: number, cycle: (s0: number, len: number) => Pose[]): Pose[] {
  const len = d / n
  return Array.from({ length: n }, (_, i) => cycle(i * len, len)).flat()
}

function build(
  d: number,
  poses: Pose[],
  label: string,
  opts: { camera?: CameraPreset; arms?: (s: number) => ArmPose; hops?: { at: number; airtime: number }[] } = {},
): Motion {
  const keys: Key3[] = perform(d, poses, undefined, { speed: 0 }).map((k) => {
    const s = k.t * d
    return {
      ...k,
      y: (opts.hops ?? []).reduce((y, h) => y + airHeight(s, h.at, h.airtime, 0), 0),
      arms: opts.arms ? opts.arms(s) : 'uit',
    }
  })
  return motion(keys, d, steps([[0, label, null]]), { terrain: 'vlak', slope: 0, camera: opts.camera ?? 'zij' })
}

export const WARMUP_3D: Record<string, () => Motion> = {
  knieen: () =>
    build(
      4.8,
      repeat(4.8, 2, (s, l) => [
        { s, crouch: 0.15, upright: 1 },
        { s: s + l / 2, crouch: 0.95 },
        { s: s + l, crouch: 0.15 },
      ]),
      'Door de knieën',
      { arms: () => 'voor' },
    ),
  armen: () =>
    build(
      4,
      repeat(4, 2, (s, l) => [
        { s, crouch: 0.2, upright: 1 },
        { s: s + l / 2, crouch: 0.15 },
        { s: s + l, crouch: 0.2 },
      ]),
      'Armen rond',
      // uit, omhoog, uit, los: zo zwaaien ze rond
      { arms: (s) => (['uit', 'omhoog', 'uit', 'los'] as const)[Math.floor((s % 2) / 0.5)] },
    ),
  draaien: () =>
    build(
      5.2,
      repeat(5.2, 2, (s, l) => [
        { s, twist: 0, look: 70, crouch: 0.3, upright: 1 },
        { s: s + l / 4, twist: 38, look: 90 },
        { s: s + l / 2, twist: 0, look: 70 },
        { s: s + (3 * l) / 4, twist: -38, look: 30 },
        { s: s + l, twist: 0, look: 70 },
      ]),
      'Bovenlijf draaien',
      {},
    ),
  gewicht: () =>
    build(
      5.2,
      repeat(5.2, 2, (s, l) => [
        { s, lean: 0, crouch: 0.4, upright: 1 },
        { s: s + l / 4, lean: 1, crouch: 0.45 },
        { s: s + l / 2, lean: 0, crouch: 0.4 },
        { s: s + (3 * l) / 4, lean: -1, crouch: 0.45 },
        { s: s + l, lean: 0, crouch: 0.4 },
      ]),
      'Neus, dan tail',
    ),
  hops: () => {
    // drie hopjes; de laatste is uitgeveerd voor het eind, zodat de lus naadloos doorloopt
    const hops = [0.45, 1.4, 2.35].map((at) => ({ at, airtime: 0.34 }))
    const poses: Pose[] = [
      { s: 0, crouch: 0.35, upright: 1 },
      { s: 3, crouch: 0.35 },
      ...hops.flatMap(({ at }) => [
        { s: at - 0.3, crouch: 0.35, upright: 1 },
        { s: at - 0.05, crouch: 0.65 },
        { s: at + 0.05, crouch: 0.2 },
        { s: at + 0.2, crouch: 0.45 },
        { s: at + 0.36, crouch: 0.7 },
        { s: at + 0.6, crouch: 0.35 },
      ]),
    ]
    return build(3, poses, 'Hop', { hops })
  },
  press: () =>
    build(
      6,
      [
        { s: 0, crouch: 0.3, lean: 0, pitch: 0, upright: 1 },
        { s: 0.5, crouch: 0.42, lean: 0.85 },
        { s: 0.8, crouch: 0.4, lean: 1, pitch: -9 },
        { s: 2.2, crouch: 0.4, lean: 1, pitch: -9 },
        { s: 2.6, crouch: 0.32, lean: 0, pitch: 0 },
        { s: 3.5, crouch: 0.42, lean: -0.85 },
        { s: 3.8, crouch: 0.4, lean: -1, pitch: 9 },
        { s: 5.2, crouch: 0.4, lean: -1, pitch: 9 },
        { s: 5.6, crouch: 0.32, lean: 0, pitch: 0 },
        { s: 6, crouch: 0.3 },
      ],
      'Press',
    ),
  ollie: () => {
    const pop = { at: 1.1, airtime: 0.5 }
    return build(
      2.8,
      [
        { s: 0, crouch: 0.3, lean: 0, pitch: 0, upright: 0.9 },
        { s: 0.8, crouch: 0.62, lean: -0.25 },
        { s: 1.02, crouch: 0.55, lean: -0.85, pitch: 10 },
        { s: 1.1, crouch: 0.15, lean: -0.7, pitch: 17 },
        { s: 1.24, crouch: 0.52, lean: -0.15, pitch: 8 },
        { s: 1.36, crouch: 0.86, lean: 0, pitch: 0 },
        { s: 1.5, crouch: 0.6 },
        { s: 1.62, crouch: 0.45 },
        { s: 1.76, crouch: 0.74 },
        { s: 2.2, crouch: 0.36 },
        { s: 2.8, crouch: 0.3 },
      ],
      'Pop',
      { hops: [pop] },
    )
  },
  adem: () =>
    build(
      4,
      repeat(4, 4, (s, l) => [
        { s, crouch: 0.15, twist: 0, upright: 1 },
        { s: s + l / 2, crouch: 0.28, twist: s % 2 ? 6 : -6 },
        { s: s + l, crouch: 0.15, twist: 0 },
      ]),
      'Los',
      { arms: () => 'los' },
    ),
}
