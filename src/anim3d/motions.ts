// Handgemaakte 3D-bewegingen voor basis, liften, bochten en carven (flat-tricks: freestyle.ts).
// Gebaseerd op de standaard opbouw uit snowboardles (stance → glijden → remmen → sideslip →
// falling leaf → traverse → garlands → J-turn → gekoppelde bochten → carven).
// Alle andere tricks worden automatisch omgezet vanuit hun 2D-animatie.
import type { Trick } from '../content/tricks'
import { drive, fromPath, fromSide, fromTop, motion, steps, turns, turnsDuration, type Segment } from './builders'
import { FREESTYLE } from './freestyle'
import { airTrickFrom, kickerMotion } from './kicker'
import type { Key3, Motion } from './types'

const SLOPE = 14

/** Bouw keys uit een rijbaan, met lichaamsstijl en per-sample aanpassingen. */
function ride(
  segs: Segment[],
  opts: { slope?: number; crouch?: number; start?: { x?: number; z?: number } } = {},
  override?: (u: number, k: Key3, travelX: number) => Partial<Key3>,
) {
  const { path, duration } = drive(segs, opts.start)
  const keys = fromPath(path, duration, opts.slope ?? SLOPE, { crouch: opts.crouch ?? 0.32, edgeGain: 0.9 }, 120, (u, k) => {
    const a = path(Math.max(0, u - 0.01))
    const b = path(Math.min(1, u + 0.01))
    return override?.(u, k, b.x - a.x) ?? {}
  })
  return { keys, duration }
}

const leanToTravel = (travelX: number, noseX: number) => (Math.abs(travelX) < 0.002 ? 0 : Math.sign(travelX) * Math.sign(noseX) * 0.55)

function stance(): Motion {
  return motion(
    [
      { t: 0, crouch: 0.22, lean: 0, look: 80 },
      { t: 0.3, crouch: 0.3, lean: 0.35, look: 85 },
      { t: 0.62, crouch: 0.3, lean: -0.3, look: 75 },
      { t: 1, crouch: 0.22, lean: 0, look: 80 },
    ],
    5,
    steps([
      [0, 'Links voor = regular, rechts voor = goofy', 'front-foot'],
      [0.28, 'Voel waar je gewicht natuurlijk heen wil', 'hips'],
      [0.6, 'Knieën licht gebogen, nooit op slot', 'knees'],
      [0.85, 'Blik over je voorste schouder, waar je heen gaat', 'head'],
    ]),
    { terrain: 'vlak', slope: 0, camera: 'zij' },
  )
}

function strapIn(): Motion {
  return motion(
    [
      { t: 0, heading: 0, edge: -0.35, down: 0.9, crouch: 0.95, free: 1, stride: 0.5, arms: 'voor', look: 20 },
      { t: 0.35, free: 1 },
      { t: 0.6, free: 0.45 },
      { t: 0.75, free: 0 },
      { t: 1, free: 0, arms: 'los' },
    ],
    5,
    steps([
      [0, 'Board dwars op de helling, dan kan hij niet wegglijden', 'board'],
      [0.15, 'Ga aan de bergkant zitten', 'hips'],
      [0.4, 'Voorste voet zit vast, nu de achterste: hiel helemaal achterin', 'back-foot'],
      [0.75, 'Ankle strap eerst, dan toe strap. Strak, niet knellend', 'back-foot'],
    ]),
    { slope: 10, camera: 'zij' },
  )
}

function skate(): Motion {
  const keys: Key3[] = []
  const cycles = 3
  let z = -3
  for (let i = 0; i < cycles; i++) {
    const t0 = i / cycles
    keys.push({ t: t0, z, heading: 90, free: 1, stride: 1, crouch: 0.35, lean: 0.35, look: 85 })
    z += 1.4
    keys.push({ t: t0 + 0.45 / cycles, z, heading: 90, free: 1, stride: -1, crouch: 0.42, lean: 0.45 })
    z += 0.9
    keys.push({ t: t0 + 0.75 / cycles, z, heading: 90, free: 0.75, stride: 0, crouch: 0.32, lean: 0.3 })
  }
  keys.push({ t: 1, z: z + 0.6, heading: 90, free: 1, stride: 1, crouch: 0.35, lean: 0.35 })
  return motion(
    keys,
    5,
    steps([
      [0, 'Voorste voet vast, achterste voet los naast je board', 'back-foot'],
      [0.15, 'Zet af naast de tenen-kant, niet achter je board', 'back-foot'],
      [0.45, 'Kleine pasjes, gewicht op je voorste been', 'nose'],
      [0.75, 'Glijden? Zet je losse voet op de stomp pad', 'back-foot'],
    ]),
    { terrain: 'vlak', slope: 2, camera: 'zij' },
  )
}

function straight(): Motion {
  const { keys, duration } = ride([{ dur: 4, from: 90, v0: 1.5, v1: 4 }], { slope: 9, crouch: 0.3, start: { z: -6 } }, () => ({
    lean: 0.25,
    look: 85,
  }))
  return motion(
    keys,
    duration,
    steps([
      [0, 'Board recht naar het dal, op een flauw stuk met uitloop', 'board'],
      [0.25, 'Gewicht licht op je voorste been', 'nose'],
      [0.5, 'Knieën los, schouders in de lijn van het board', 'knees'],
      [0.75, 'Kijk vooruit, niet naar je board', 'head'],
    ]),
    { slope: 9, camera: 'zij' },
  )
}

function heelStop(): Motion {
  const { keys, duration } = ride(
    [
      { dur: 1.5, from: 90, v0: 2.5, v1: 4 },
      { dur: 0.6, from: 90, to: 78, v0: 4, v1: 3.6, board0: 0, board1: -62 },
      { dur: 1.2, from: 78, to: 62, v0: 3.6, v1: 0.15, board0: -62, board1: -62 },
      { dur: 0.9, from: 62, v0: 0.15, v1: 0, board0: -62 },
    ],
    { start: { z: -5 } },
    (u) => ({ crouch: u < 0.35 ? 0.3 : 0.6 }),
  )
  return motion(
    keys,
    duration,
    steps([
      [0, 'Rechtuit, gewicht licht voor', 'nose'],
      [0.35, 'Kijk over je voorste schouder en draai je schouders mee', 'shoulders'],
      [0.55, 'Hielen in, tenen omhoog: de heel edge bijt', 'heel-edge'],
      [0.75, 'Zak door je knieën, alsof je op een stoel gaat zitten', 'knees'],
    ]),
    { camera: 'zij' },
  )
}

function sideslip(edge: 'heel' | 'toe'): Motion {
  const board = edge === 'heel' ? -90 : 90
  const segs: Segment[] = []
  for (let i = 0; i < 3; i++) {
    segs.push({ dur: 1.1, from: 90, v0: 0, v1: 1.3, board0: board })
    segs.push({ dur: 0.9, from: 90, v0: 1.3, v1: 0, board0: board })
  }
  const { keys, duration } = ride(segs, { crouch: 0.45, start: { z: -3 } }, () => ({
    arms: 'voor',
    look: edge === 'heel' ? 15 : 10,
  }))
  return motion(
    keys,
    duration,
    steps(
      edge === 'heel'
        ? [
            [0, 'Board dwars, gezicht naar het dal, op je hielen', 'heel-edge'],
            [0.1, 'Laat je tenen iets zakken: het board gaat glijden', 'heel-edge'],
            [0.33, 'Tenen weer omhoog: de edge bijt en je remt', 'heel-edge'],
            [0.5, 'Billen laag, rug recht, armen voor je', 'hips'],
            [0.7, 'Zo bepaal jij de snelheid op elk steil stuk', 'board'],
          ]
        : [
            [0, 'Board dwars, gezicht naar de berg, op je tenen', 'toe-edge'],
            [0.1, 'Hielen iets laten zakken: het board glijdt', 'toe-edge'],
            [0.33, 'Tenen in, knieën naar de helling: je remt', 'knees'],
            [0.5, 'Kont niet naar achter, heupen boven je voeten', 'hips'],
            [0.7, 'Kijk af en toe over je schouder het dal in', 'head'],
          ],
    ),
    { camera: 'zij' },
  )
}

function fallingLeaf(edge: 'heel' | 'toe'): Motion {
  // heel: board rond 0° (neus rechts), toe: rond 180° (neus links)
  const segs: Segment[] =
    edge === 'heel'
      ? [
          { dur: 1.3, from: 25, v0: 0.2, v1: 1.6, board0: -13 },
          { dur: 1.0, from: 25, v0: 1.6, v1: 0.1, board0: -13 },
          { dur: 0.7, from: 25, to: 155, v0: 0.1, v1: 0.1, board0: -13, board1: -167 },
          { dur: 1.3, from: 155, v0: 0.1, v1: 1.6, board0: -167 },
          { dur: 1.0, from: 155, v0: 1.6, v1: 0.1, board0: -167 },
          { dur: 0.7, from: 155, to: 25, v0: 0.1, v1: 0.1, board0: -167, board1: -13 },
        ]
      : [
          { dur: 1.3, from: 155, v0: 0.2, v1: 1.6, board0: 13 },
          { dur: 1.0, from: 155, v0: 1.6, v1: 0.1, board0: 13 },
          { dur: 0.7, from: 155, to: 25, v0: 0.1, v1: 0.1, board0: 13, board1: 167 },
          { dur: 1.3, from: 25, v0: 0.1, v1: 1.6, board0: 167 },
          { dur: 1.0, from: 25, v0: 1.6, v1: 0.1, board0: 167 },
          { dur: 0.7, from: 25, to: 155, v0: 0.1, v1: 0.1, board0: 167, board1: 13 },
        ]
  const noseX = edge === 'heel' ? 1 : -1
  const { keys, duration } = ride(segs, { crouch: 0.42 }, (_, k, travelX) => ({
    lean: leanToTravel(travelX, noseX),
    arms: 'uit',
    edge: Math.sign(edge === 'heel' ? -1 : 1) * Math.max(0.28, Math.abs(k.edge ?? 0)),
  }))
  return motion(
    keys,
    duration,
    steps(
      edge === 'heel'
        ? [
            [0, 'Op je hielen, gezicht naar het dal', 'heel-edge'],
            [0.06, 'Kijk over je voorste schouder en zet daar je gewicht: je glijdt die kant op', 'head'],
            [0.4, 'Rustig remmen, het board stopt', 'heel-edge'],
            [0.5, 'Kijk de andere kant op en verschuif je gewicht', 'hips'],
            [0.85, 'De edge blijft de hele tijd in de sneeuw', 'heel-edge'],
          ]
        : [
            [0, 'Op je tenen, gezicht naar de berg', 'toe-edge'],
            [0.06, 'Kijk over je schouder, gewicht naar dat been', 'head'],
            [0.4, 'Remmen met je tenen', 'toe-edge'],
            [0.5, 'Andere kant op: gewicht naar je andere been', 'hips'],
            [0.85, 'Knieën naar de helling, edge blijft in de sneeuw', 'knees'],
          ],
    ),
    { camera: 'zij' },
  )
}

function traverse(): Motion {
  const { keys, duration } = ride([{ dur: 3.5, from: 28, v0: 3, v1: 4 }], { start: { x: -6 } })
  return motion(
    keys,
    duration,
    steps([
      [0, 'Kijk naar een punt aan de andere kant van de piste', 'head'],
      [0.3, 'Hielen in: de heel edge houdt je op koers', 'heel-edge'],
      [0.6, 'Meer edge = minder snelheid, minder edge = sneller', 'heel-edge'],
    ]),
    { camera: 'mee' },
  )
}

function garlands(): Motion {
  const { keys, duration } = ride(
    [
      { dur: 1.4, from: 28, v0: 3, v1: 3.5 },
      { dur: 1.3, from: 28, to: 72, v0: 3.5, v1: 5 },
      { dur: 1.3, from: 72, to: 28, v0: 5, v1: 3.5 },
      { dur: 1.3, from: 28, to: 72, v0: 3.5, v1: 5 },
      { dur: 1.3, from: 72, to: 28, v0: 5, v1: 3.5 },
    ],
    { start: { x: -8 } },
  )
  return motion(
    keys,
    duration,
    steps([
      [0, 'Traverse op je hielen', 'heel-edge'],
      [0.2, 'Druk je voorbeen iets in: de neus draait naar het dal', 'nose'],
      [0.4, 'Vóór je te snel gaat: hielen in, terug op koers', 'heel-edge'],
      [0.62, 'Nog een keer. Zo went de valrichting', 'board'],
    ]),
    { camera: 'mee' },
  )
}

function jTurn(): Motion {
  const { keys, duration } = ride(
    [
      { dur: 1.5, from: 90, v0: 2.5, v1: 4.2 },
      { dur: 0.9, from: 90, to: 125, v0: 4.2, v1: 3.4, board0: 0, board1: 30 },
      { dur: 1.1, from: 125, to: 135, v0: 3.4, v1: 0.2, board0: 30, board1: 45 },
      { dur: 0.8, from: 135, v0: 0.2, v1: 0, board0: 45 },
    ],
    { start: { z: -5 } },
    (u) => ({ crouch: u < 0.38 ? 0.3 : 0.55 }),
  )
  return motion(
    keys,
    duration,
    steps([
      [0, 'Recht naar beneden, gewicht op je voorbeen', 'nose'],
      [0.35, 'Kijk over je voorste schouder, schouders draaien mee', 'shoulders'],
      [0.5, 'Tenen in, knieën naar de helling', 'toe-edge'],
      [0.75, 'Het board draait dwars en je remt af', 'board'],
    ]),
    { camera: 'mee' },
  )
}

function turnMotion(
  style: Parameters<typeof turns>[0],
  count: number,
  first: 'toe' | 'heel',
  st: Parameters<typeof steps>[0],
  opts: { switch?: boolean } = {},
): Motion {
  return motion(turns(style, count, first, opts), turnsDuration(style, count), steps(st), { camera: 'mee', slope: 16 })
}

function fall(heel: boolean): Motion {
  const d = heel ? 1 : -1
  const heading = heel ? 0 : 180
  const edge = heel ? -0.3 : 0.3
  return motion(
    [
      { t: 0, z: 0, heading, edge, crouch: 0.4, look: 15 },
      { t: 0.25, z: 0.5, heading, edge, crouch: 0.85, arms: 'voor' },
      { t: 0.45, z: 0.8, heading, edge, crouch: 0.95, down: 0.95 * d, arms: 'voor', look: 0 },
      { t: 1, z: 0.9, heading, edge, crouch: 0.95, down: 0.95 * d, arms: 'voor', look: 0 },
    ],
    3.6,
    steps(
      heel
        ? [
            [0, 'Je voelt dat je achterover gaat', 'hips'],
            [0.2, 'Zak meteen door je knieën: maak je klein', 'knees'],
            [0.42, 'Billen eerst in de sneeuw, kin op je borst', 'hips'],
            [0.65, 'Vuisten dicht, armen voor je borst. Niet je handen neerzetten', 'hands'],
          ]
        : [
            [0, 'Je voelt dat je voorover gaat', 'shoulders'],
            [0.2, 'Zak door je knieën', 'knees'],
            [0.42, 'Land op je knieën en onderarmen', 'hands'],
            [0.65, 'Vuisten dicht, nooit met gestrekte armen (pols!)', 'hands'],
          ],
    ),
    { slope: 8, camera: 'zij' },
  )
}

function standUp(heel: boolean): Motion {
  const d = heel ? 1 : -1
  const heading = heel ? 0 : 180
  const edge = heel ? -0.35 : 0.35
  return motion(
    [
      { t: 0, heading, edge, crouch: 0.95, down: 0.95 * d, arms: 'voor', look: 10 },
      { t: 0.35, heading, edge, crouch: 1, down: 0.6 * d, arms: 'voor' },
      { t: 0.75, heading, edge, crouch: 0.65, down: 0.12 * d, arms: 'uit' },
      { t: 1, heading, edge, crouch: 0.4, down: 0, arms: 'uit', look: 40 },
    ],
    4,
    steps(
      heel
        ? [
            [0, 'Board dwars op de helling, onder je', 'board'],
            [0.2, 'Hielen in, trek het board dicht naar je billen', 'heel-edge'],
            [0.45, 'Duw jezelf omhoog en kom met je heupen boven je voeten', 'hips'],
            [0.8, 'Hielen blijven op de edge: je staat!', 'heel-edge'],
          ]
        : [
            [0, 'Op je knieën, board dwars op de helling', 'board'],
            [0.2, 'Tenen in de sneeuw', 'toe-edge'],
            [0.45, 'Duw jezelf omhoog met je handen', 'hands'],
            [0.8, 'Gewicht op je tenen: je staat', 'toe-edge'],
          ],
    ),
    { slope: 10, camera: 'zij' },
  )
}

function lift(kind: 'band' | 'sleep' | 'stoel'): Motion {
  if (kind === 'stoel') {
    const keys: Key3[] = [
      { t: 0, z: -2, y: 0, heading: 90, free: 0.18, crouch: 0.25, look: 85, arms: 'los' },
      { t: 0.45, z: 1.5, heading: 90, free: 0.18, crouch: 0.35, lean: 0.25, arms: 'uit' },
      { t: 0.7, z: 3, heading: 90, free: 0.18, crouch: 0.3, arms: 'uit' },
      { t: 0.85, z: 3.6, heading: 90, free: 1, stride: 1, crouch: 0.32 },
      { t: 1, z: 4.4, heading: 90, free: 1, stride: -1, crouch: 0.38, lean: 0.35 },
    ]
    return motion(
      keys,
      4.5,
      steps([
        [0, 'Board recht vooruit, achterste voet op de stomp pad', 'back-foot'],
        [0.3, 'Opstaan en gewicht op je voorste been', 'nose'],
        [0.6, 'Rustig wegglijden, armen voor balans', 'hands'],
        [0.82, 'Meteen opzij skaten, uit de uitstap', 'back-foot'],
      ]),
      { slope: 9, camera: 'zij' },
    )
  }
  const speed = kind === 'sleep' ? 2.4 : 1
  const duration = 5
  const keys: Key3[] = [
    { t: 0, z: 3, heading: 270, free: 0.18, crouch: 0.22, look: 85, arms: 'los', lean: 0.3 },
    { t: 1, z: 3 - speed * duration, heading: 270, free: 0.18, crouch: 0.22, look: 85, arms: 'los', lean: 0.3 },
  ]
  return motion(
    keys,
    duration,
    steps(
      kind === 'sleep'
        ? [
            [0, 'Voorste voet vast, achterste los op de stomp pad', 'back-foot'],
            [0.25, 'Bügel tussen je benen of tegen je dij, niet erop zitten', 'hips'],
            [0.5, 'Board recht in het spoor, gewicht op je voorste been', 'nose'],
            [0.8, 'Boven: loslaten en rustig opzij glijden', 'board'],
          ]
        : [
            [0, 'Voorste voet vast, stap er recht op', 'front-foot'],
            [0.35, 'Stilstaan, gewicht in het midden', 'hips'],
            [0.75, 'Boven: rustig eraf skaten en meteen opzij', 'back-foot'],
          ],
    ),
    { slope: kind === 'sleep' ? 14 : 8, camera: 'zij', terrain: kind === 'sleep' ? 'lift' : 'piste' },
  )
}

const MOTIONS: Record<string, () => Motion> = {
  ...FREESTYLE,
  stance,
  'strap-in': strapIn,
  skaten: skate,
  rechtuit: straight,
  'heelside-stop': heelStop,
  'sideslip-heel': () => sideslip('heel'),
  'sideslip-toe': () => sideslip('toe'),
  vallen: () => fall(true),
  'vallen-toe': () => fall(false),
  'opstaan-heel': () => standUp(true),
  'opstaan-toe': () => standUp(false),
  'lift-band': () => lift('band'),
  'lift-sleep': () => lift('sleep'),
  'lift-stoel': () => lift('stoel'),
  'falling-leaf-heel': () => fallingLeaf('heel'),
  'falling-leaf-toe': () => fallingLeaf('toe'),
  traverse,
  garlands,
  'j-turn': jTurn,
  'gekoppelde-bochten': () =>
    turnMotion('slip', 3, 'toe', [
      [0, 'Start in een traverse, kijk de bocht in', 'head'],
      [0.1, 'Schouders draaien eerst, het board volgt', 'shoulders'],
      [0.2, 'Board plat door de valrichting: even doorbijten', 'board'],
      [0.3, 'Rol naar je tenen en maak de bocht af', 'toe-edge'],
      [0.45, 'Omhoog bij de wissel, zakken in de bocht', 'knees'],
      [0.62, 'Heelside: hielen in, kijk over je voorste schouder', 'heel-edge'],
    ]),
  snelheid: () =>
    turnMotion('controle', 3, 'heel', [
      [0, 'Maak elke bocht af tot het board dwars staat', 'board'],
      [0.25, 'Dat afmaken is je rem: je hoeft niet te slippen', 'heel-edge'],
      [0.5, 'Kortere, rondere bochten = langzamer', 'shoulders'],
      [0.75, 'Rij een C, geen S', 'board'],
    ]),
  switch: () =>
    turnMotion(
      'slip',
      3,
      'toe',
      [
        [0, 'Andere voet voor: je tail is nu je neus', 'tail'],
        [0.2, 'Kijk over je achterste schouder, die is nu voor', 'head'],
        [0.45, 'Zelfde ritme als normaal: zakken, omhoog, zakken', 'knees'],
        [0.7, 'Voelt als dag één? Klopt. Elke dag een paar runs', 'board'],
      ],
      { switch: true },
    ),
  'dynamische-bochten': () =>
    turnMotion('dynamisch', 3, 'toe', [
      [0, 'Laat knieën en heupen de bocht in vallen', 'knees'],
      [0.25, 'Wissel sneller van edge, minder slippen', 'board'],
      [0.5, 'Druk het board aan het eind van de bocht in de sneeuw', 'hips'],
      [0.75, 'Bovenlijf rustig, het werk zit in je benen', 'shoulders'],
    ]),
  'carve-heel': () =>
    turnMotion('carve', 2, 'heel', [
      [0, 'Zak diep, kont richting sneeuw', 'hips'],
      [0.2, 'Kantel het board met enkels en knieën', 'heel-edge'],
      [0.45, 'Laat de taille van het board de bocht maken, niet sturen', 'board'],
      [0.7, 'Kijk achterom naar je spoor: een dun lijntje = carve', 'head'],
    ]),
  'carve-toe': () =>
    turnMotion('carve', 2, 'toe', [
      [0, 'Knieën richting sneeuw, heupen naar binnen', 'knees'],
      [0.25, 'Borst omhoog, niet voorover knakken', 'shoulders'],
      [0.5, 'Je hand kan de sneeuw bijna aaien', 'hands'],
      [0.75, 'Dun lijntje in de sneeuw: dat is een carve', 'toe-edge'],
    ]),
  'rail-to-rail': () =>
    turnMotion('carve', 4, 'toe', [
      [0, 'Van edge naar edge, nooit plat', 'board'],
      [0.25, 'Kom uit je carve door te strekken of te buigen', 'knees'],
      [0.5, 'Kantel meteen naar de andere edge', 'hips'],
      [0.75, 'Bovenlijf stil, de benen doen het', 'shoulders'],
    ]),
  eurocarve: () =>
    turnMotion('euro', 3, 'toe', [
      [0, 'Hard board, stijve bindingen, perfecte corduroy', 'board'],
      [0.25, 'Extreme hoek: lichaam laag over de sneeuw', 'hips'],
      [0.5, 'Je hand raakt de sneeuw', 'hands'],
      [0.75, 'Snel terug naar de andere kant', 'knees'],
    ]),
}

/** Beweging voor een trick: handgemaakt als die er is, anders omgezet uit de 2D-animatie. */
export function motionFor(trick: Trick): Motion | null {
  const own = MOTIONS[trick.id]
  if (own) return own()
  if (!trick.anim) return null
  if (trick.anim.view === 'side' && trick.anim.obstacle === 'kicker') return kickerMotion(airTrickFrom(trick.anim), trick.anim.steps)
  return trick.anim.view === 'side' ? fromSide(trick.anim) : fromTop(trick.anim)
}

export const HANDMADE = Object.keys(MOTIONS)
