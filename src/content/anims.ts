// Bouwstenen voor trick-animaties. Elke builder geeft een complete animatie terug;
// de stappen-teksten lopen synchroon mee met de keyframes.
import type { GrabKind, SideAnim, SideKey, Step, TopAnim, TopKey } from '../anim/engine'

const steps = (pairs: [number, string][]): Step[] => pairs.map(([t, label]) => ({ t, label }))

// ── Zijaanzicht ────────────────────────────────────────────────────────────

export function glide(labels: string[] = ['Rustig rechtuit', 'Knieën los, blik vooruit']): SideAnim {
  return {
    view: 'side',
    duration: 3,
    slope: 6,
    keys: [
      { t: 0, x: -0.9, crouch: 0.25 },
      { t: 0.5, x: 0, crouch: 0.35 },
      { t: 1, x: 0.9, crouch: 0.25 },
    ],
    steps: steps([
      [0, labels[0]],
      [0.5, labels[1]],
    ]),
  }
}

export function ollie(nollie = false): SideAnim {
  const s = nollie ? -1 : 1
  return {
    view: 'side',
    duration: 3.2,
    keys: [
      { t: 0, x: -0.9, crouch: 0.25 },
      { t: 0.25, x: -0.45, crouch: 0.6, lean: -0.8 * s, flip: 4 * s },
      { t: 0.34, x: -0.3, y: 0.08, crouch: 0.2, lean: -0.6 * s, flip: 22 * s },
      { t: 0.48, x: -0.05, y: 0.42, crouch: 0.75, lean: 0, flip: 0, arms: 'uit' },
      { t: 0.62, x: 0.2, y: 0.1, crouch: 0.4 },
      { t: 0.7, x: 0.32, y: 0, crouch: 0.7 },
      { t: 1, x: 0.9, crouch: 0.3 },
    ],
    steps: steps(
      nollie
        ? [
            [0, 'Kom aanrijden, knieën los'],
            [0.2, 'Gewicht naar voren, laad je neus'],
            [0.32, 'Pop van de neus, achterbeen omhoog'],
            [0.45, 'Knieën naar je borst'],
            [0.65, 'Land met twee voeten tegelijk, door de knieën'],
          ]
        : [
            [0, 'Kom aanrijden, knieën los'],
            [0.2, 'Gewicht naar achter, laad je tail als een veer'],
            [0.32, 'Voorbeen omhoog, dan pop van de tail'],
            [0.45, 'Knieën naar je borst, board komt mee'],
            [0.65, 'Land met twee voeten tegelijk, door de knieën'],
          ],
    ),
  }
}

export function press(nose: boolean): SideAnim {
  const s = nose ? 1 : -1
  return {
    view: 'side',
    duration: 3.4,
    keys: [
      { t: 0, x: -0.9, crouch: 0.3 },
      { t: 0.25, x: -0.4, crouch: 0.4, lean: 0.9 * s, flip: 0 },
      { t: 0.38, x: -0.2, y: 0.09, flip: -11 * s, lean: 1 * s, crouch: 0.35 },
      { t: 0.72, x: 0.45, y: 0.09, flip: -11 * s, lean: 1 * s },
      { t: 0.84, x: 0.65, y: 0, flip: 0, lean: 0, crouch: 0.35 },
      { t: 1, x: 0.9, crouch: 0.3 },
    ],
    steps: steps([
      [0, 'Rij rechtuit op een vlak stuk'],
      [0.2, nose ? 'Gewicht over je voorste been' : 'Gewicht over je achterste been'],
      [0.35, nose ? 'Tail los van de sneeuw, voorbeen gebogen' : 'Neus los van de sneeuw, achterbeen gebogen'],
      [0.6, 'Vasthouden, armen voor balans'],
      [0.82, 'Rustig terug naar midden'],
    ]),
  }
}

export function butter(nose: boolean, deg: number): SideAnim {
  const s = nose ? 1 : -1
  return {
    view: 'side',
    duration: 3.6,
    keys: [
      { t: 0, x: -0.9, crouch: 0.3 },
      { t: 0.22, x: -0.45, lean: 0.9 * s, crouch: 0.45, spin: -10 },
      { t: 0.32, x: -0.3, y: 0.09, flip: -11 * s, lean: 1 * s, spin: 0 },
      { t: 0.7, x: 0.3, y: 0.09, flip: -11 * s, spin: deg },
      { t: 0.8, x: 0.5, y: 0, flip: 0, lean: 0, spin: deg },
      { t: 1, x: 0.9, spin: deg, crouch: 0.3 },
    ],
    steps: steps([
      [0, 'Rustig aanrijden'],
      [0.18, 'Schouders licht opwinden'],
      [0.3, nose ? 'Druk op de neus, tail komt los' : 'Druk op de tail, neus komt los'],
      [0.45, `Schouders leiden, board draait ${deg}° mee op de ${nose ? 'neus' : 'tail'}`],
      [0.78, 'Board plat en wegrijden'],
    ]),
  }
}

export function flatSpin(deg: number, labels?: string[]): SideAnim {
  return {
    view: 'side',
    duration: 3.4,
    keys: [
      { t: 0, x: -0.9, crouch: 0.25 },
      { t: 0.22, x: -0.5, crouch: 0.6, lean: -0.7, spin: -25 * Math.sign(deg) },
      { t: 0.32, x: -0.32, y: 0.1, crouch: 0.25, flip: 18, spin: -10 * Math.sign(deg) },
      { t: 0.5, x: 0, y: 0.45, crouch: 0.75, flip: 0, spin: deg * 0.6 },
      { t: 0.66, x: 0.25, y: 0.05, crouch: 0.45, spin: deg },
      { t: 0.72, x: 0.35, y: 0, crouch: 0.7, spin: deg },
      { t: 1, x: 0.9, crouch: 0.3, spin: deg },
    ],
    steps: steps(
      (
        labels ?? [
          'Aanrijden, knieën los',
          'Wind je schouders op (tegen de draai in)',
          'Ollie en laat je schouders los',
          'Hoofd kijkt over je schouder naar de landing',
          'Land plat, door de knieën',
        ]
      ).map((l, i) => [[0, 0.18, 0.3, 0.42, 0.66][i] ?? 0.8, l] as [number, string]),
    ),
  }
}

export function revert(deg = 180): SideAnim {
  return {
    view: 'side',
    duration: 3,
    keys: [
      { t: 0, x: -0.9, crouch: 0.3 },
      { t: 0.3, x: -0.3, crouch: 0.4, spin: 0 },
      { t: 0.65, x: 0.3, crouch: 0.35, spin: deg },
      { t: 1, x: 0.9, crouch: 0.3, spin: deg },
    ],
    steps: steps([
      [0, 'Rij plat, geen edge'],
      [0.25, 'Draai schouders en heupen'],
      [0.45, 'Board draait mee over de sneeuw, blijf plat'],
      [0.7, 'Rij switch weg'],
    ]),
  }
}

export function shifty(): SideAnim {
  return {
    view: 'side',
    duration: 3,
    keys: [
      { t: 0, x: -0.9 },
      { t: 0.25, x: -0.45, crouch: 0.6, lean: -0.6 },
      { t: 0.33, x: -0.3, y: 0.1, crouch: 0.25, flip: 15 },
      { t: 0.47, x: -0.05, y: 0.42, crouch: 0.7, flip: 0, spin: 70 },
      { t: 0.6, x: 0.18, y: 0.15, spin: 0 },
      { t: 0.68, x: 0.3, y: 0, crouch: 0.65 },
      { t: 1, x: 0.9, crouch: 0.3 },
    ],
    steps: steps([
      [0, 'Aanrijden'],
      [0.22, 'Ollie'],
      [0.4, 'Bovenlijf blijft stil, draai alleen het board met je benen'],
      [0.56, 'Board terug recht vóór de landing'],
      [0.68, 'Landen'],
    ]),
  }
}

interface AirOpts {
  grab?: GrabKind
  spin?: number
  flip?: number
  labels?: [number, string][]
  height?: number
}

/** Sprong over een kicker met optionele grab/spin/flip. */
export function kicker(opts: AirOpts = {}): SideAnim {
  const { grab, spin = 0, flip = 0, height = 0.85 } = opts
  const keys: SideKey[] = [
    { t: 0, x: -0.95, y: 0, crouch: 0.35 },
    { t: 0.14, x: -0.6, y: 0, crouch: 0.45 },
    { t: 0.24, x: -0.42, y: 0.03, flip: 14, crouch: 0.45, spin: spin ? -15 * Math.sign(spin) : 0 },
    { t: 0.32, x: -0.24, y: 0.22, flip: 22, crouch: 0.6, spin: spin ? -20 * Math.sign(spin) : 0 },
    { t: 0.36, x: -0.17, y: 0.3, flip: 16, crouch: 0.2 },
    { t: 0.5, x: 0.08, y: height, flip: flip * 0.45, crouch: grab ? 0.85 : 0.65, grab: grab ?? null, g: grab ? 1 : 0, spin: spin * 0.45 },
    {
      t: 0.62,
      x: 0.32,
      y: height * 0.75,
      flip: flip * 0.9,
      crouch: grab ? 0.85 : 0.6,
      grab: grab ?? null,
      g: grab ? 1 : 0,
      spin: spin * 0.85,
    },
    { t: 0.72, x: 0.5, y: 0.12, flip: flip, crouch: 0.45, g: 0, grab: null, spin },
    { t: 0.78, x: 0.6, y: 0, flip: flip, crouch: 0.75, spin },
    { t: 1, x: 0.95, y: 0, flip: flip, crouch: 0.35, spin },
  ]
  const labels: [number, string][] = opts.labels ?? [
    [0, 'Speed check: zelfde snelheid als iemand die het al kan'],
    [0.14, 'Board plat, gewicht centraal op de kicker'],
    [0.3, 'Pop op de lip, strek je benen'],
    [0.45, grab ? 'Knieën omhoog, pak het board (niet bukken!)' : 'Knieën omhoog, blik op de landing'],
    [0.68, 'Board onder je, laat los en spot de landing'],
    [0.76, 'Land op beide voeten, absorbeer met je knieën'],
  ]
  return { view: 'side', duration: 3.8, obstacle: 'kicker', keys, steps: steps(labels) }
}

export function slide(kind: 'box' | 'rail', sideways: boolean, labels?: [number, string][]): SideAnim {
  const h = kind === 'box' ? 0.2 : 0.3
  const sp = sideways ? 90 : 0
  return {
    view: 'side',
    duration: 3.8,
    obstacle: kind,
    keys: [
      { t: 0, x: -0.95, crouch: 0.35 },
      { t: 0.18, x: -0.6, crouch: 0.5, lean: -0.4 },
      { t: 0.27, x: -0.45, y: h + 0.12, crouch: 0.6, flip: 6 },
      { t: 0.33, x: -0.35, y: h, crouch: 0.45, flip: 0, spin: sp, lean: 0 },
      { t: 0.68, x: 0.33, y: h, crouch: 0.45, spin: sp },
      { t: 0.76, x: 0.48, y: h + 0.06, spin: sp ? sp * 0.3 : 0 },
      { t: 0.84, x: 0.6, y: 0, crouch: 0.7, spin: 0 },
      { t: 1, x: 0.95, crouch: 0.35, spin: 0 },
    ],
    steps: steps(
      labels ?? [
        [0, 'Recht op de box af, speed rustig'],
        [0.18, 'Kleine ollie of rij er vlak op'],
        [0.33, sideways ? 'Draai het board 90°, schouders blijven in de rijrichting' : 'Board plat, geen edge! Blik naar het einde'],
        [0.55, 'Gewicht centraal, knieën los'],
        [0.76, sideways ? 'Draai terug aan het einde en land plat' : 'Rij eraf en land plat'],
      ],
    ),
  }
}

export function fall(heelside: boolean): SideAnim {
  const d = heelside ? 1 : -1
  return {
    view: 'side',
    duration: 4,
    slope: 4,
    keys: [
      { t: 0, x: -0.6, spin: 90, crouch: 0.3 },
      { t: 0.25, x: -0.25, spin: 90, crouch: 0.75, arms: 'los' },
      { t: 0.45, x: -0.1, spin: 90, crouch: 0.9, down: 0.95 * d, arms: 'omhoog' },
      { t: 0.7, x: -0.05, spin: 90, crouch: 0.9, down: 0.95 * d, arms: 'omhoog' },
      { t: 0.9, x: 0, spin: 90, crouch: 0.6, down: 0.2 * d, arms: 'uit' },
      { t: 1, x: 0.05, spin: 90, crouch: 0.35 },
    ],
    steps: steps(
      heelside
        ? [
            [0, 'Je voelt dat je achterover gaat'],
            [0.22, 'Zak door je knieën, maak je klein'],
            [0.42, 'Billen eerst, dan rollen over je rug. Kin op je borst!'],
            [0.6, 'Vuisten dicht, armen over je borst. Niet je handen neerzetten'],
            [0.85, 'Rustig weer opstaan'],
          ]
        : [
            [0, 'Je voelt dat je voorover gaat'],
            [0.22, 'Zak door je knieën'],
            [0.42, 'Land op je knieën en onderarmen, vuisten dicht'],
            [0.6, 'Niet met gestrekte armen opvangen (pols!)'],
            [0.85, 'Rustig weer opstaan'],
          ],
    ),
  }
}

export function standUp(heelside: boolean): SideAnim {
  const d = heelside ? 1 : -1
  return {
    view: 'side',
    duration: 3.6,
    keys: [
      { t: 0, spin: 90, crouch: 0.9, down: 0.9 * d, arms: 'omhoog' },
      { t: 0.3, spin: 90, crouch: 0.95, down: 0.6 * d, arms: 'uit' },
      { t: 0.7, spin: 90, crouch: 0.6, down: 0.15 * d, arms: 'uit' },
      { t: 1, spin: 90, crouch: 0.35, down: 0 },
    ],
    steps: steps(
      heelside
        ? [
            [0, 'Board dwars op de helling, onder je'],
            [0.25, 'Hielen in, trek je board naar je billen'],
            [0.5, 'Duw jezelf omhoog met je achterste hand of pak je binding'],
            [0.8, 'Hielen blijven op de edge, staan!'],
          ]
        : [
            [0, 'Op je knieën, board dwars op de helling'],
            [0.25, 'Tenen in de sneeuw'],
            [0.5, 'Duw jezelf omhoog met je handen'],
            [0.8, 'Gewicht op je tenen, staan!'],
          ],
    ),
  }
}

export function powder(): SideAnim {
  return {
    view: 'side',
    duration: 3.6,
    slope: 8,
    obstacle: 'pipe',
    keys: [
      { t: 0, x: -0.9, lean: -0.6, flip: 7, crouch: 0.35, y: 0.02 },
      { t: 0.35, x: -0.3, lean: -0.7, flip: 9, crouch: 0.55, y: 0 },
      { t: 0.55, x: 0.05, lean: -0.5, flip: 6, crouch: 0.25, y: 0.06 },
      { t: 0.75, x: 0.45, lean: -0.7, flip: 9, crouch: 0.55, y: 0 },
      { t: 1, x: 0.9, lean: -0.6, flip: 7, crouch: 0.35, y: 0.02 },
    ],
    steps: steps([
      [0, 'Bindingen een paar cm naar achteren (setback)'],
      [0.2, 'Gewicht iets op je achterbeen, neus blijft boven'],
      [0.5, 'Op en neer pompen: zo laat je het board zweven'],
      [0.8, 'Speed houden! Stilstaan in poeder = vastzitten'],
    ]),
  }
}

// ── Bovenaanzicht ───────────────────────────────────────────────────────────

export function topStraight(labels = ['Board recht naar het dal', 'Gewicht op je voorste been']): TopAnim {
  return {
    view: 'top',
    duration: 3,
    keys: [
      { t: 0, x: 0, y: -0.85, angle: 90, edge: 'flat' },
      { t: 1, x: 0, y: 0.85, angle: 90, edge: 'flat' },
    ],
    steps: steps([
      [0, labels[0]],
      [0.5, labels[1]],
    ]),
  }
}

export function sideslip(edge: 'heel' | 'toe'): TopAnim {
  return {
    view: 'top',
    duration: 3.6,
    keys: [
      { t: 0, x: 0, y: -0.8, angle: 0, edge },
      { t: 0.45, x: 0.02, y: -0.1, angle: 0, edge: 'flat' },
      { t: 0.6, x: 0.02, y: 0.05, angle: 0, edge },
      { t: 1, x: 0, y: 0.8, angle: 0, edge: 'flat' },
    ],
    steps: steps([
      [0, edge === 'heel' ? 'Board dwars, gezicht naar het dal, hielen in' : 'Board dwars, gezicht naar de berg, tenen in'],
      [0.3, edge === 'heel' ? 'Tenen iets omhoog laten zakken → je glijdt' : 'Hielen iets laten zakken → je glijdt'],
      [0.55, 'Edge weer in → je remt'],
      [0.75, 'Zo bepaal jij de snelheid'],
    ]),
  }
}

export function fallingLeaf(edge: 'heel' | 'toe'): TopAnim {
  return {
    view: 'top',
    duration: 5,
    keys: [
      { t: 0, x: -0.6, y: -0.8, angle: 0, edge },
      { t: 0.25, x: 0.6, y: -0.4, angle: 10, edge },
      { t: 0.5, x: -0.6, y: 0, angle: -10, edge },
      { t: 0.75, x: 0.6, y: 0.4, angle: 10, edge },
      { t: 1, x: -0.6, y: 0.8, angle: -10, edge },
    ],
    steps: steps([
      [0, edge === 'heel' ? 'Op je hielen, kijk naar het dal' : 'Op je tenen, kijk naar de berg'],
      [0.1, 'Kijk naar links, gewicht op dat been → je glijdt die kant op'],
      [0.35, 'Kijk naar rechts, gewicht naar het andere been'],
      [0.6, 'Als een vallend blaadje heen en weer'],
      [0.85, 'Edge blijft de hele tijd in de sneeuw'],
    ]),
  }
}

export function traverse(edge: 'heel' | 'toe'): TopAnim {
  const a = edge === 'heel' ? 25 : 155
  const dir = edge === 'heel' ? 1 : -1
  return {
    view: 'top',
    duration: 3.5,
    keys: [
      { t: 0, x: -0.8 * dir, y: -0.6, angle: a, edge },
      { t: 1, x: 0.8 * dir, y: 0.2, angle: a, edge },
    ],
    steps: steps([
      [0, 'Kijk naar waar je heen wilt'],
      [0.35, edge === 'heel' ? 'Hielen in, schuin de piste over' : 'Tenen in, schuin de piste over'],
      [0.7, 'Meer edge = minder snelheid'],
    ]),
  }
}

export function jTurn(edge: 'heel' | 'toe'): TopAnim {
  const end = edge === 'heel' ? 0 : 180
  const dir = edge === 'heel' ? 1 : -1
  return {
    view: 'top',
    duration: 3.6,
    keys: [
      { t: 0, x: 0, y: -0.85, angle: 90, edge: 'flat' },
      { t: 0.4, x: 0.05 * dir, y: -0.25, angle: 90, edge: 'flat' },
      { t: 0.75, x: 0.45 * dir, y: 0.25, angle: (90 + end) / 2, edge },
      { t: 1, x: 0.7 * dir, y: 0.35, angle: end, edge },
    ],
    steps: steps([
      [0, 'Recht naar beneden, gewicht op je voorbeen'],
      [0.4, edge === 'heel' ? 'Kijk over je voorste schouder, hielen in' : 'Kijk over je voorste schouder, tenen in'],
      [0.75, 'Board draait dwars → je remt af'],
    ]),
  }
}

export function turns(kind: 'skid' | 'dynamic' | 'carve', labels?: [number, string][]): TopAnim & { trail: 'skid' | 'carve' } {
  const w = kind === 'carve' ? 0.55 : 0.6
  const keys: TopKey[] = []
  const n = 4
  for (let i = 0; i <= n; i++) {
    const heelDir = i % 2 === 0
    keys.push({
      t: i / n,
      x: heelDir ? -w : w,
      y: -0.85 + (1.7 * i) / n,
      angle: heelDir ? 170 : 10,
      edge: heelDir ? 'toe' : 'heel',
    })
    if (i < n) {
      keys.push({ t: (i + 0.5) / n, x: 0, y: -0.85 + (1.7 * (i + 0.5)) / n, angle: 90, edge: 'flat' })
    }
  }
  return {
    view: 'top',
    duration: kind === 'carve' ? 4 : 5,
    keys,
    trail: kind === 'carve' ? 'carve' : 'skid',
    steps: steps(
      labels ?? [
        [0, 'Toeside: tenen in, kijk de bocht in'],
        [0.12, 'Board plat door de valrichting'],
        [0.25, 'Heelside: hielen in, schouders mee'],
        [0.37, 'Weer plat, gewicht naar voren'],
        [0.5, 'Ritme: in de knieën → omhoog → in de knieën'],
      ],
    ),
  }
}

export function liftT(): TopAnim {
  return {
    view: 'top',
    duration: 4,
    scenery: 'lift',
    keys: [
      { t: 0, x: -0.15, y: 0.85, angle: -80, edge: 'flat' },
      { t: 1, x: -0.15, y: -0.85, angle: -80, edge: 'flat' },
    ],
    steps: steps([
      [0, 'Voorste voet vast, achterste voet los'],
      [0.25, 'Bügel tussen je benen of achter je dij, niet erop gaan zitten'],
      [0.5, 'Achterste voet op de stomp pad, board recht in het spoor'],
      [0.8, 'Boven: bügel los, rustig opzij glijden'],
    ]),
  }
}

export function trees(): TopAnim & { trail: 'skid' } {
  return {
    ...turns('dynamic'),
    scenery: 'trees',
    trail: 'skid',
    steps: steps([
      [0, 'Kijk naar de gaten, niet naar de bomen'],
      [0.25, 'Korte bochten, snelheid onder controle'],
      [0.5, 'Nooit alleen, altijd een maatje in zicht'],
      [0.75, 'Pas op voor tree wells rond de stam'],
    ]),
  }
}

export function moguls(): TopAnim & { trail: 'skid' } {
  return {
    ...turns('skid'),
    scenery: 'moguls',
    trail: 'skid',
    steps: steps([
      [0, 'Knieën zijn je schokbrekers'],
      [0.25, 'Draai op de top van de bult, daar is het board kort'],
      [0.5, 'Glij af in het dal en pak de volgende'],
      [0.75, 'Rustig tempo, bovenlijf stil'],
    ]),
  }
}
