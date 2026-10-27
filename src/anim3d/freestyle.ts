// Handgemaakte flat-tricks: ollie, nollie, shifty, 180s, 360, presses, butters en revert.
// Pose-to-pose per kanaal (elk lichaamsdeel heeft zijn eigen timing), de sprong zelf is een echte
// ballistische boog: uit de luchttijd volgt de pophoogte. Bovenlijf blijft rechtop terwijl het board
// onder je kantelt (`upright`), zoals bij een echte pop of press.
import { motion, steps } from './builders'
import { BOARD } from './solve'
import type { Key3, Motion } from './types'

const G = 9.81
const SLOPE = 8
/** rijsnelheid op een flauw stuk piste, m/s */
const SPEED = 4

type Channel = 'heading' | 'pitch' | 'crouch' | 'lean' | 'twist' | 'look' | 'upright'
/** Een pose op tijdstip `s` (seconden). Alleen de kanalen die je noemt krijgen hier een doel. */
export type Pose = { s: number } & Partial<Record<Channel, number>>

const smooth = (u: number) => u * u * (3 - 2 * u)

/** Waarde van één kanaal: zacht van pose naar pose (in tijdsvolgorde); tussen poses zonder dit kanaal loopt het door. */
export function channel(poses: Pose[], f: Channel, s: number, fallback: number): number {
  const pts = poses.filter((p) => p[f] !== undefined).sort((a, b) => a.s - b.s)
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
export function perform(
  duration: number,
  poses: Pose[],
  air?: { pop: number; airtime: number },
  opts: { pivot?: { tip: 'nose' | 'tail'; from: number }; speed?: number } = {},
  fps = 30,
): Key3[] {
  const keys: Key3[] = []
  const n = Math.round(duration * fps)
  const v = opts.speed ?? SPEED
  const half = BOARD.length / 2
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * duration
    const heading = channel(poses, 'heading', s, 90)
    let x = 0
    let z = -v * (duration / 2) + v * s
    // butter: het board draait om de tip die op de sneeuw drukt, niet om zijn midden
    if (opts.pivot && s >= opts.pivot.from) {
      const sign = opts.pivot.tip === 'nose' ? 1 : -1
      const h = (heading * Math.PI) / 180
      // de tip rijdt rechtdoor; het midden zit een halve boardlengte achter (of voor) de tip
      x = -sign * half * Math.cos(h)
      z += sign * half - sign * half * Math.sin(h)
    }
    keys.push({
      t: i / n,
      x,
      z,
      y: air ? airHeight(s, air.pop, air.airtime) : 0,
      heading,
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

/** Flat spin (180 of 360): opwinden, ollie, schouders leiden en het board volgt. */
function flatSpin(deg: number): Motion {
  const r = Math.sign(deg)
  const turns = Math.abs(deg) / 180
  const landSwitch = turns % 2 === 1
  const d = 3.2
  const airtime = turns > 1 ? 0.68 : 0.6
  const land = 1.1 + airtime
  const air = { pop: 1.1, airtime }
  const poses: Pose[] = [
    ...popPoses(1).filter((p) => p.s < 1.5),
    { s: land - 0.12, crouch: 0.6, pitch: 0 },
    { s: land, crouch: 0.45, pitch: 0, lean: 0 },
    { s: land + 0.14, crouch: 0.74 },
    { s: land + 0.62, crouch: 0.36 },
    { s: d, crouch: 0.3 },
    // schouders: eerst tegen de draai in opwinden, dan los en vóór het board uit.
    // (wereldrichting board = -heading, schouders = -heading + twist: voorlopen = twist tegen r in)
    { s: 0.55, twist: 0, heading: 90, look: 80 },
    { s: 0.9, twist: (turns > 1 ? 40 : 28) * r },
    { s: 1.04, twist: (turns > 1 ? 44 : 32) * r, heading: 90 },
    { s: 1.2, twist: -34 * r, heading: 90 + 0.25 * deg },
    { s: 1.1 + airtime * 0.55, twist: -30 * r, heading: 90 + 0.7 * deg, look: landSwitch ? 30 : 20 },
    { s: land - 0.1, twist: -6 * r, heading: 90 + deg - 2 * r, look: landSwitch ? -70 : 70 },
    { s: land + 0.02, twist: 0, heading: 90 + deg, look: landSwitch ? -80 : 80 },
  ]
  return motion(
    perform(d, poses, air),
    d,
    at(d, [
      [0, 'Aanrijden, knieën los', 'knees'],
      [0.85, turns > 1 ? 'Wind je schouders ver op, tegen de draai in' : 'Wind je schouders op, tegen de draai in', 'shoulders'],
      [1.1, 'Ollie en laat je schouders los: zij leiden, het board volgt', 'shoulders'],
      [1.3, turns > 1 ? 'Blijf draaien: hoofd eerst, zoek je landing' : 'Hoofd draait mee, zoek je landing over je schouder', 'head'],
      [land, landSwitch ? 'Land plat en switch, door de knieën' : 'Land plat, door de knieën', 'knees'],
      [land + 0.5, landSwitch ? 'Rij switch weg, kijk over je andere schouder' : 'Rij weg, blik vooruit', 'head'],
    ]),
    { terrain: 'piste', slope: SLOPE, camera: 'zij' },
  )
}

/** Butter: in een press draai je het board rond de tip die op de sneeuw blijft. */
function butter(nose: boolean, deg: number): Motion {
  const d = 4
  const s = nose ? 1 : -1
  const r = Math.sign(deg)
  const landSwitch = (Math.abs(deg) / 180) % 2 === 1
  const from = 1.25
  const spin = Math.abs(deg) > 180 ? 1.5 : 1.0
  const poses: Pose[] = [
    { s: 0, crouch: 0.3, lean: 0, pitch: 0, upright: 1, heading: 90, twist: 0, look: 80 },
    { s: 0.6, crouch: 0.35, twist: 0 },
    // schouders licht opwinden, gewicht naar de tip
    { s: 0.95, crouch: 0.42, lean: 0.85 * s, twist: 18 * r },
    { s: from, crouch: 0.4, lean: 1 * s, pitch: -9 * s, heading: 90, twist: 22 * r },
    // schouders leiden, het board draait op de tip mee
    { s: from + 0.25, twist: -25 * r, heading: 90 + 0.15 * deg },
    { s: from + spin * 0.6, twist: -28 * r, heading: 90 + 0.7 * deg, look: landSwitch ? 20 : 40 },
    { s: from + spin, twist: -4 * r, heading: 90 + deg, pitch: -9 * s, look: landSwitch ? -80 : 80 },
    // board plat en wegrijden
    { s: from + spin + 0.3, pitch: 0, lean: 0, crouch: 0.38, twist: 0 },
    { s: d, crouch: 0.3 },
  ]
  return motion(
    perform(d, poses, undefined, { pivot: { tip: nose ? 'nose' : 'tail', from }, speed: 2.6 }),
    d,
    at(d, [
      [0, 'Rustig aanrijden, niet te hard', 'board'],
      [0.85, 'Schouders licht opwinden, gewicht naar de ' + (nose ? 'neus' : 'tail'), nose ? 'front-foot' : 'back-foot'],
      [from, nose ? 'Druk op de neus, de tail komt los' : 'Druk op de tail, de neus komt los', nose ? 'nose' : 'tail'],
      [from + 0.25, `Schouders leiden, het board draait ${Math.abs(deg)}° op de ${nose ? 'neus' : 'tail'} mee`, 'shoulders'],
      [from + spin + 0.15, landSwitch ? 'Board plat en switch wegrijden' : 'Board plat en wegrijden', 'board'],
    ]),
    { terrain: 'piste', slope: SLOPE, camera: 'zij' },
  )
}

/** Revert: het board draait plat over de sneeuw 180° rond, je rijdt switch verder. */
function revert(): Motion {
  const d = 3.2
  const poses: Pose[] = [
    { s: 0, crouch: 0.32, heading: 90, twist: 0, look: 80, upright: 0.9 },
    { s: 0.9, crouch: 0.36, twist: 0, heading: 90 },
    { s: 1.2, crouch: 0.4, twist: -30, heading: 100 },
    { s: 1.55, twist: -25, heading: 200, look: 10 },
    { s: 1.85, twist: 0, heading: 270, look: -80, crouch: 0.38 },
    { s: d, crouch: 0.32 },
  ]
  return motion(
    perform(d, poses, undefined, { speed: 3.2 }),
    d,
    at(d, [
      [0, 'Rij plat, geen edge', 'board'],
      [1.0, 'Draai je schouders en heupen', 'shoulders'],
      [1.3, 'Het board draait mee over de sneeuw: blijf plat', 'board'],
      [1.9, 'Rij switch weg, kijk over je andere schouder', 'head'],
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
  'fs-180': () => flatSpin(180),
  'bs-180': () => flatSpin(-180),
  'fs-360': () => flatSpin(360),
  'nose-butter': () => butter(true, 180),
  'tail-butter': () => butter(false, 180),
  'butter-360': () => butter(true, 360),
  revert,
  'nose-press': () => press(true),
  'tail-press': () => press(false),
}
