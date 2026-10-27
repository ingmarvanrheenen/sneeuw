// Handgemaakte flat-tricks: ollie, nollie, shifty, 180s en presses.
// Pose-to-pose per kanaal (elk lichaamsdeel heeft zijn eigen timing), de sprong zelf is een echte
// ballistische boog: uit de luchttijd volgt de pophoogte. Bovenlijf blijft rechtop terwijl het board
// onder je kantelt (`upright`), zoals bij een echte pop of press.
import { motion, steps } from './builders'
import type { Key3, Motion } from './types'

const G = 9.81
const SLOPE = 8
/** rijsnelheid op een flauw stuk piste, m/s */
const SPEED = 4

type Channel = 'heading' | 'pitch' | 'crouch' | 'lean' | 'twist' | 'look' | 'upright'
/** Een pose op tijdstip `s` (seconden). Alleen de kanalen die je noemt krijgen hier een doel. */
export type Pose = { s: number } & Partial<Record<Channel, number>>

const smooth = (u: number) => u * u * (3 - 2 * u)

/** Waarde van één kanaal: zacht van pose naar pose; tussen poses zonder dit kanaal loopt het door. */
export function channel(poses: Pose[], f: Channel, s: number, fallback: number): number {
  const pts = poses.filter((p) => p[f] !== undefined)
  if (!pts.length) return fallback
  if (s <= pts[0].s) return pts[0][f]!
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (s <= b.s) return a[f]! + (b[f]! - a[f]!) * smooth((s - a.s) / (b.s - a.s))
  }
  return pts[pts.length - 1][f]!
}

/** Ballistische sprong: hoogte boven de sneeuw tussen pop en landing. Piekhoogte = g·T²/8. */
export function airHeight(s: number, pop: number, airtime: number, slope = SLOPE): number {
  if (s <= pop || s >= pop + airtime) return 0
  const g = G * Math.cos((slope * Math.PI) / 180)
  const t = s - pop
  return Math.max(0, (g * airtime * t) / 2 - (g * t * t) / 2)
}

export const popHeight = (airtime: number, slope = SLOPE) => (G * Math.cos((slope * Math.PI) / 180) * airtime * airtime) / 8

/** Zet poses en een sprong om in keys op een vast raster, zodat elk kanaal zijn eigen timing houdt. */
export function perform(duration: number, poses: Pose[], air?: { pop: number; airtime: number }, fps = 30): Key3[] {
  const keys: Key3[] = []
  const n = Math.round(duration * fps)
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * duration
    keys.push({
      t: i / n,
      x: 0,
      z: -SPEED * (duration / 2) + SPEED * s,
      y: air ? airHeight(s, air.pop, air.airtime) : 0,
      heading: channel(poses, 'heading', s, 90),
      edge: 0,
      pitch: channel(poses, 'pitch', s, 0),
      crouch: channel(poses, 'crouch', s, 0.3),
      lean: channel(poses, 'lean', s, 0),
      twist: channel(poses, 'twist', s, 0),
      look: channel(poses, 'look', s, 80),
      upright: channel(poses, 'upright', s, 0.9),
      arms: 'uit',
    })
  }
  return keys
}

const at = (duration: number, list: [number, string, Parameters<typeof steps>[0][number][2]?][]) =>
  steps(list.map(([s, label, cue]) => [s / duration, label, cue]))

/** De ollie-timing: aanrijden, inzakken, tail laden, pop, knieën op, landen en veren. */
function popPoses(dir: 1 | -1): Pose[] {
  // dir 1 = ollie (pop van de tail), -1 = nollie (pop van de neus)
  return [
    { s: 0, crouch: 0.3, lean: 0, pitch: 0 },
    { s: 0.55, crouch: 0.32, lean: 0 },
    { s: 0.85, crouch: 0.62, lean: -0.25 * dir },
    // laden: gewicht op de tail, de neus komt omhoog en het board buigt
    { s: 1.02, crouch: 0.55, lean: -0.85 * dir, pitch: 10 * dir },
    // pop: achterbeen strekt in één klap
    { s: 1.1, crouch: 0.15, lean: -0.7 * dir, pitch: 17 * dir },
    // knieën omhoog, voorvoet duwt de neus omlaag
    { s: 1.24, crouch: 0.52, lean: -0.15 * dir, pitch: 8 * dir },
    { s: 1.38, crouch: 0.86, lean: 0, pitch: 0 },
    // benen weer lang maken voor de landing
    { s: 1.54, crouch: 0.6, pitch: -2 * dir },
    { s: 1.66, crouch: 0.45, pitch: 0 },
    // veren
    { s: 1.8, crouch: 0.74 },
    { s: 2.25, crouch: 0.36 },
    { s: 3, crouch: 0.3 },
  ]
}

const POP = { pop: 1.1, airtime: 0.56 }

function ollie(nollie: boolean): Motion {
  const d = 3
  const dir = nollie ? -1 : 1
  return motion(
    perform(d, popPoses(dir), POP),
    d,
    at(
      d,
      nollie
        ? [
            [0, 'Rij rechtuit, board plat, knieën los', 'knees'],
            [0.8, 'Zak door je knieën, gewicht naar je voorbeen', 'front-foot'],
            [1.0, 'Laad de neus: de tail komt omhoog', 'nose'],
            [1.1, 'Pop: strek je voorbeen in één klap', 'front-foot'],
            [1.24, 'Knieën naar je borst, achtervoet trekt de tail op', 'knees'],
            [1.6, 'Land met twee voeten tegelijk en veer door je knieën', 'knees'],
          ]
        : [
            [0, 'Rij rechtuit, board plat, knieën los', 'knees'],
            [0.8, 'Zak door je knieën, gewicht naar je achterbeen', 'back-foot'],
            [1.0, 'Laad de tail als een veer: de neus komt omhoog', 'tail'],
            [1.1, 'Pop: strek je achterbeen in één klap', 'back-foot'],
            [1.24, 'Knieën naar je borst, voorvoet duwt de neus omlaag', 'knees'],
            [1.6, 'Land met twee voeten tegelijk en veer door je knieën', 'knees'],
          ],
    ),
    { terrain: 'piste', slope: SLOPE, camera: 'zij' },
  )
}

function shifty(): Motion {
  const d = 3
  const poses: Pose[] = [
    ...popPoses(1),
    // in de lucht draait alleen het board (benen), de schouders blijven waar ze waren (twist = draai board)
    { s: 1.14, heading: 90, twist: 0 },
    { s: 1.38, heading: 162, twist: 62 },
    { s: 1.58, heading: 90, twist: 0 },
  ]
  return motion(
    perform(d, poses, POP),
    d,
    at(d, [
      [0, 'Aanrijden, knieën los', 'knees'],
      [0.9, 'Ollie: laad de tail en pop', 'tail'],
      [1.18, 'Draai het board met je benen, bovenlijf blijft stil', 'hips'],
      [1.36, 'Schouders blijven recht, kijk vooruit', 'shoulders'],
      [1.5, 'Board terug recht vóór je landt', 'board'],
      [1.66, 'Land met twee voeten, door de knieën', 'knees'],
    ]),
    { terrain: 'piste', slope: SLOPE, camera: 'zij' },
  )
}

/** Flat 180: opwinden, ollie, schouders leiden en het board volgt; je landt switch. */
function spin180(frontside: boolean): Motion {
  const d = 3.2
  const r = frontside ? 1 : -1
  const air = { pop: 1.1, airtime: 0.6 }
  const poses: Pose[] = [
    ...popPoses(1).filter((p) => p.s < 1.6),
    { s: 1.68, crouch: 0.45, pitch: 0, lean: 0 },
    { s: 1.82, crouch: 0.74 },
    { s: 2.3, crouch: 0.36 },
    { s: 3.2, crouch: 0.3 },
    // schouders: eerst tegen de draai in opwinden, dan los en vóór het board uit.
    // (wereldrichting board = -heading, schouders = -heading + twist: voorlopen = twist tegen r in)
    { s: 0.55, twist: 0, heading: 90, look: 80 },
    { s: 0.9, twist: 28 * r },
    { s: 1.04, twist: 32 * r, heading: 90 },
    { s: 1.2, twist: -34 * r, heading: 90 + 45 * r },
    { s: 1.4, twist: -30 * r, heading: 90 + 125 * r, look: 30 },
    { s: 1.58, twist: -6 * r, heading: 90 + 178 * r, look: -70 },
    { s: 1.7, twist: 0, heading: 90 + 180 * r, look: -80 },
  ]
  return motion(
    perform(d, poses, air),
    d,
    at(d, [
      [0, 'Aanrijden, knieën los', 'knees'],
      [0.85, 'Wind je schouders op, tegen de draai in', 'shoulders'],
      [1.1, 'Ollie en laat je schouders los: zij leiden, het board volgt', 'shoulders'],
      [1.35, 'Hoofd draait mee, zoek je landing over je schouder', 'head'],
      [1.66, 'Land plat en switch, door de knieën', 'knees'],
      [2.2, 'Rij switch weg, kijk over je andere schouder', 'head'],
    ]),
    { terrain: 'piste', slope: SLOPE, camera: 'zij' },
  )
}

/** Nose of tail press: board kantelt op de tip, jij blijft rechtop erboven. */
function press(nose: boolean): Motion {
  const d = 3.6
  const s = nose ? 1 : -1
  const poses: Pose[] = [
    { s: 0, crouch: 0.3, lean: 0, pitch: 0, upright: 1 },
    { s: 0.7, crouch: 0.34, lean: 0 },
    { s: 1.0, crouch: 0.42, lean: 0.85 * s },
    { s: 1.28, crouch: 0.4, lean: 1 * s, pitch: -9 * s },
    // vasthouden met kleine balanscorrecties
    { s: 1.75, pitch: -8 * s, lean: 0.95 * s },
    { s: 2.15, pitch: -10 * s, lean: 1 * s },
    { s: 2.45, pitch: -9 * s, lean: 1 * s },
    { s: 2.8, crouch: 0.38, lean: 0.1 * s, pitch: 0 },
    { s: 3.6, crouch: 0.3, lean: 0 },
  ]
  return motion(
    perform(d, poses),
    d,
    at(
      d,
      nose
        ? [
            [0, 'Rij rechtuit op een vlak stuk', 'board'],
            [0.85, 'Gewicht over je voorste been', 'front-foot'],
            [1.25, 'De tail komt los: voorknie gebogen, achterbeen lang', 'tail'],
            [1.8, 'Vasthouden: bovenlijf rechtop, armen uit voor balans', 'shoulders'],
            [2.6, 'Rustig terug naar het midden', 'board'],
          ]
        : [
            [0, 'Rij rechtuit op een vlak stuk', 'board'],
            [0.85, 'Gewicht over je achterste been', 'back-foot'],
            [1.25, 'De neus komt los: achterknie gebogen, voorbeen lang', 'nose'],
            [1.8, 'Vasthouden: bovenlijf rechtop, niet achterover hangen', 'shoulders'],
            [2.6, 'Rustig terug naar het midden', 'board'],
          ],
    ),
    { terrain: 'piste', slope: SLOPE, camera: 'zij' },
  )
}

export const FREESTYLE: Record<string, () => Motion> = {
  ollie: () => ollie(false),
  nollie: () => ollie(true),
  shifty,
  'fs-180': () => spin180(true),
  'bs-180': () => spin180(false),
  'nose-press': () => press(true),
  'tail-press': () => press(false),
}
