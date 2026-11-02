// Warming-up voor de eerste lift: 5 minuten, met je board aan (boven bij de lift of op de vlakte).
// De 3D-rider doet ze voor (src/anim3d/warmup.ts); de 2D-animatie hieronder is de terugval zonder WebGL.
import type { SideAnim, SideKey } from '../anim/engine'

export interface Exercise {
  id: string
  name: string
  /** seconden */
  secs: number
  /** hoe doe je het, in één of twee zinnen */
  how: string
  anim: SideAnim
}

const still = (duration: number, keys: SideKey[], label: string): SideAnim => ({
  view: 'side',
  duration,
  slope: 0,
  obstacle: 'none',
  keys: keys.map((k) => ({ x: 0, ...k })),
  steps: [{ t: 0, label, cue: null }],
})

export const WARMUP: Exercise[] = [
  {
    id: 'knieen',
    name: 'Knieën los',
    secs: 40,
    how: 'Diep door je knieën en weer omhoog, rustig. Rug recht, armen naar voren.',
    anim: still(
      2.4,
      [
        { t: 0, crouch: 0.15 },
        { t: 0.5, crouch: 0.9 },
        { t: 1, crouch: 0.15 },
      ],
      'Door de knieën',
    ),
  },
  {
    id: 'armen',
    name: 'Armen zwaaien',
    secs: 30,
    how: 'Grote cirkels met je armen, eerst naar voren, dan naar achteren. Schouders los.',
    anim: still(
      2,
      [
        { t: 0, crouch: 0.2, arms: 'uit' },
        { t: 0.5, crouch: 0.15, arms: 'omhoog' },
        { t: 1, crouch: 0.2, arms: 'uit' },
      ],
      'Armen rond',
    ),
  },
  {
    id: 'draaien',
    name: 'Opwinden',
    secs: 40,
    how: 'Draai je bovenlijf naar je neus en dan naar je tail. Kijk mee met je schouders.',
    anim: still(
      2.6,
      [
        { t: 0, spin: 0, crouch: 0.3 },
        { t: 0.25, spin: 28, crouch: 0.35 },
        { t: 0.5, spin: 0, crouch: 0.3 },
        { t: 0.75, spin: -28, crouch: 0.35 },
        { t: 1, spin: 0, crouch: 0.3 },
      ],
      'Bovenlijf draaien',
    ),
  },
  {
    id: 'gewicht',
    name: 'Gewicht verplaatsen',
    secs: 40,
    how: 'Leun naar je neus, dan naar je tail. Voel waar je gewicht zit, knieën blijven zacht.',
    anim: still(
      2.6,
      [
        { t: 0, lean: 0, crouch: 0.4 },
        { t: 0.25, lean: 0.9, crouch: 0.45 },
        { t: 0.5, lean: 0, crouch: 0.4 },
        { t: 0.75, lean: -0.9, crouch: 0.45 },
        { t: 1, lean: 0, crouch: 0.4 },
      ],
      'Neus, dan tail',
    ),
  },
  {
    id: 'hops',
    name: 'Kleine hops',
    secs: 40,
    how: 'Kleine sprongetjes op de plek, land zacht door je knieën. Niet te hoog.',
    anim: still(
      1.4,
      [
        { t: 0, crouch: 0.6, y: 0 },
        { t: 0.3, crouch: 0.2, y: 0.18 },
        { t: 0.55, crouch: 0.3, y: 0.05 },
        { t: 0.7, crouch: 0.7, y: 0 },
        { t: 1, crouch: 0.6, y: 0 },
      ],
      'Hop',
    ),
  },
  {
    id: 'press',
    name: 'Nose en tail press',
    secs: 40,
    how: 'Druk je neus omhoog door op je achterbeen te leunen, dan andersom. Houd hem even vast.',
    anim: still(
      3,
      [
        { t: 0, flip: 0, lean: 0, crouch: 0.35 },
        { t: 0.2, flip: -12, lean: 0.8, crouch: 0.45 },
        { t: 0.4, flip: -12, lean: 0.8, crouch: 0.45 },
        { t: 0.5, flip: 0, lean: 0, crouch: 0.35 },
        { t: 0.7, flip: 12, lean: -0.8, crouch: 0.45 },
        { t: 0.9, flip: 12, lean: -0.8, crouch: 0.45 },
        { t: 1, flip: 0, lean: 0, crouch: 0.35 },
      ],
      'Press',
    ),
  },
  {
    id: 'ollie',
    name: 'Ollie-veer',
    secs: 40,
    how: 'Laad je tail als een veer en pop een klein ollietje op de plek. Land met twee voeten tegelijk.',
    anim: still(
      2,
      [
        { t: 0, crouch: 0.3 },
        { t: 0.3, crouch: 0.65, lean: -0.8, flip: 6 },
        { t: 0.42, crouch: 0.25, lean: -0.5, flip: 18, y: 0.05 },
        { t: 0.55, crouch: 0.7, lean: 0, flip: 0, y: 0.22, arms: 'uit' },
        { t: 0.72, crouch: 0.6, y: 0 },
        { t: 1, crouch: 0.3 },
      ],
      'Pop',
    ),
  },
  {
    id: 'adem',
    name: 'Uitschudden',
    secs: 30,
    how: 'Schud je armen en schouders los en adem drie keer diep in en uit. Klaar voor de lift.',
    anim: still(
      3,
      [
        { t: 0, crouch: 0.15, arms: 'los' },
        { t: 0.5, crouch: 0.25, arms: 'los' },
        { t: 1, crouch: 0.15, arms: 'los' },
      ],
      'Los',
    ),
  },
]

export const WARMUP_SECS = WARMUP.reduce((n, e) => n + e.secs, 0)
