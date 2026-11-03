// Warming-up voor de eerste lift (3, 5 of 10 minuten, met je board aan) en een cooling-down na je laatste run.
// De 3D-rider doet ze voor (src/anim3d/warmup.ts); de 2D-animatie hieronder is de terugval zonder WebGL.
// Een routine is een lijst oefeningen met hun eigen tijd; dezelfde oefening kan in een andere routine korter.
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

const WARM: Exercise[] = [
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

/** Rekken na je laatste run: rustig, elke houding vasthouden, niet veren. */
const COOL: Exercise[] = [
  {
    id: 'kuiten',
    name: 'Kuiten en enkels',
    secs: 50,
    how: 'Leun met gebogen knieën naar je neus tot je je kuiten voelt. Vasthouden, rustig ademen, dan naar je tail.',
    anim: still(
      6,
      [
        { t: 0, crouch: 0.3, lean: 0 },
        { t: 0.15, crouch: 0.6, lean: 0.9 },
        { t: 0.45, crouch: 0.6, lean: 0.9 },
        { t: 0.55, crouch: 0.6, lean: -0.9 },
        { t: 0.85, crouch: 0.6, lean: -0.9 },
        { t: 1, crouch: 0.3, lean: 0 },
      ],
      'Vasthouden',
    ),
  },
  {
    id: 'hurk',
    name: 'Diepe hurk',
    secs: 50,
    how: 'Zak zo diep als lukt, hielen plat en ellebogen tegen je knieën. Blijf zitten en voel je heupen opengaan.',
    anim: still(
      6,
      [
        { t: 0, crouch: 0.3 },
        { t: 0.25, crouch: 1 },
        { t: 0.8, crouch: 1 },
        { t: 1, crouch: 0.3 },
      ],
      'Blijf zitten',
    ),
  },
  {
    id: 'hamstrings',
    name: 'Naar de sneeuw',
    secs: 50,
    how: 'Benen bijna gestrekt, laat je bovenlijf hangen en reik naar de sneeuw. Niet veren, gewoon hangen.',
    anim: still(
      6,
      [
        { t: 0, crouch: 0.2, arms: 'los' },
        { t: 0.25, crouch: 0.45, arms: 'los' },
        { t: 0.8, crouch: 0.45, arms: 'los' },
        { t: 1, crouch: 0.2, arms: 'los' },
      ],
      'Hangen',
    ),
  },
  {
    id: 'rug',
    name: 'Rug draaien',
    secs: 50,
    how: 'Draai je bovenlijf langzaam ver naar je neus en houd het even vast. Dan naar je tail. Heupen blijven recht.',
    anim: still(
      7,
      [
        { t: 0, spin: 0, crouch: 0.25 },
        { t: 0.2, spin: 40, crouch: 0.25 },
        { t: 0.4, spin: 40, crouch: 0.25 },
        { t: 0.5, spin: 0, crouch: 0.25 },
        { t: 0.7, spin: -40, crouch: 0.25 },
        { t: 0.9, spin: -40, crouch: 0.25 },
        { t: 1, spin: 0, crouch: 0.25 },
      ],
      'Langzaam draaien',
    ),
  },
  {
    id: 'rekken',
    name: 'Lang maken',
    secs: 50,
    how: 'Armen recht omhoog, maak jezelf zo lang mogelijk en reik naar de lucht. Zak dan rustig terug.',
    anim: still(
      5,
      [
        { t: 0, crouch: 0.2, arms: 'los' },
        { t: 0.25, crouch: 0, arms: 'omhoog' },
        { t: 0.75, crouch: 0, arms: 'omhoog' },
        { t: 1, crouch: 0.2, arms: 'los' },
      ],
      'Omhoog',
    ),
  },
  {
    id: 'uitademen',
    name: 'Uitademen',
    secs: 50,
    how: 'Schud je benen los en adem een paar keer diep in en uit. Drink wat en log je dag.',
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

const POOL = new Map([...WARM, ...COOL].map((e) => [e.id, e]))
/** Oefening uit de pool met een eigen tijd voor deze routine. */
const ex = (id: string, secs: number): Exercise => ({ ...POOL.get(id)!, secs })

export type RoutineId = 'kort' | 'normaal' | 'lang' | 'cooldown'

export interface Routine {
  id: RoutineId
  /** kort label voor de keuze, "5 min" */
  label: string
  exercises: Exercise[]
}

export const ROUTINES: Record<RoutineId, Routine> = {
  kort: {
    id: 'kort',
    label: '3 min',
    exercises: [ex('knieen', 30), ex('draaien', 30), ex('gewicht', 30), ex('hops', 30), ex('ollie', 30), ex('adem', 30)],
  },
  normaal: { id: 'normaal', label: '5 min', exercises: WARM },
  lang: {
    id: 'lang',
    label: '10 min',
    exercises: [
      ex('knieen', 75),
      ex('armen', 60),
      ex('draaien', 75),
      ex('gewicht', 75),
      ex('hops', 75),
      ex('press', 90),
      ex('ollie', 90),
      ex('adem', 60),
    ],
  },
  cooldown: { id: 'cooldown', label: '5 min', exercises: COOL },
}

export const WARMUP_CHOICES: RoutineId[] = ['kort', 'normaal', 'lang']

export const routineSecs = (r: Routine) => r.exercises.reduce((n, e) => n + e.secs, 0)

/** De gewone warming-up van 5 minuten. */
export const WARMUP = WARM
export const WARMUP_SECS = routineSecs(ROUTINES.normaal)
/** Alle oefeningen, voor de 3D- en content-tests. */
export const ALL_EXERCISES = [...POOL.values()]
