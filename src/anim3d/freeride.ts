// Freeride: bulten, bomen en poeder. Net als kicker en jibs één vorm voor terrein én beweging:
// de bulten zijn een hoogteveld waar het board overheen rijdt, de bomen staan om de baan van de rider
// heen, en de poeder is een laag verse sneeuw boven de harde ondergrond.
import { fromPath, type PathPoint } from './builders'
import type { Step } from '../anim/engine'
import type { Motion } from './types'

const deg = (r: number) => (r * 180) / Math.PI
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const HALF = 0.775

// ── Bulten ──────────────────────────────────────────────────────────────────

/** Bulten in versprongen rijen; elke rij heeft er één op de lijn x = 0. */
export const MOGULS = { rowGap: 3.4, colGap: 3.2, height: 0.55, radius: 1.15, from: -12, to: 40 }

/** Hoogte van het bultenveld op (x, z). */
export function mogulHeight(x: number, z: number): number {
  if (z < MOGULS.from - MOGULS.radius || z > MOGULS.to + MOGULS.radius) return 0
  const { rowGap, colGap, height, radius } = MOGULS
  let h = 0
  const k0 = Math.floor(z / rowGap)
  for (let k = k0 - 1; k <= k0 + 2; k++) {
    for (const half of [0, 0.5]) {
      const cz = (k + half) * rowGap
      if (cz < MOGULS.from || cz > MOGULS.to) continue
      const off = half ? colGap / 2 : 0
      const m = Math.round((x - off) / colGap)
      for (const mm of [m - 1, m, m + 1]) {
        const d = Math.hypot(x - (off + mm * colGap), z - cz)
        if (d < radius) h = Math.max(h, height * Math.cos((Math.PI * d) / (2 * radius)) ** 2)
      }
    }
  }
  return h
}

/** Board als rechte lat op het oppervlak: hoogte van het midden en pitch t.o.v. de neus. */
export function restOn(surface: (x: number, z: number) => number, x: number, z: number, heading: number) {
  const h = (heading * Math.PI) / 180
  const dx = HALF * Math.cos(h)
  const dz = HALF * Math.sin(h)
  const yN = surface(x + dx, z + dz)
  const yT = surface(x - dx, z - dz)
  return { y: Math.max(surface(x, z), (yN + yT) / 2), pitch: deg(Math.atan2(yN - yT, 2 * HALF)) }
}

interface TurnPath {
  /** lengte van één bocht langs de helling */
  len: number
  width: number
  speed: number
  /** board dwarser dan de rijrichting (slippen) */
  skid: number
  count: number
  slope: number
}

function weave(p: TurnPath, first = 1): { path: (u: number) => PathPoint; duration: number; total: number } {
  const total = p.len * p.count
  return {
    total,
    duration: total / (p.speed * 0.8),
    path: (u) => {
      const z = u * total
      const x = first * p.width * Math.sin((Math.PI * z) / p.len)
      const dx = first * p.width * (Math.PI / p.len) * Math.cos((Math.PI * z) / p.len)
      const th = deg(Math.atan2(1, dx))
      return { x, z, heading: clamp(90 + (th - 90) * p.skid, 4, 176) }
    },
  }
}

/** Bulten: wisselen op de top van de bult (board kort, makkelijk draaien), bocht afmaken in het dal. */
export function mogulMotion(st: Step[]): Motion {
  const p: TurnPath = { len: MOGULS.rowGap, width: 0.8, speed: 3.6, skid: 1.3, count: 6, slope: 18 }
  const { path, duration } = weave(p)
  const keys = fromPath(path, duration, p.slope, { edgeGain: 0.5, crouch: 0.32, crouchInTurn: 0.2, lead: 0.5 }, 220, (_, k) => {
    const rest = restOn(mogulHeight, k.x ?? 0, k.z ?? 0, k.heading ?? 90)
    // knieën zijn je schokbrekers: gebogen op de top, lang in het dal
    const absorb = rest.y / MOGULS.height
    return { y: rest.y, pitch: rest.pitch, crouch: clamp(0.3 + 0.55 * absorb + 0.15 * Math.abs(k.edge ?? 0), 0, 1), upright: 0.85 }
  })
  return { keys, duration, steps: st, terrain: 'bulten', slope: p.slope, camera: 'mee', surface: mogulHeight }
}

// ── Bomen ───────────────────────────────────────────────────────────────────

const TREE_PATH: TurnPath = { len: 5, width: 2, speed: 5, skid: 1.15, count: 5, slope: 20 }
/** eerste bocht naar links (x < 0), zodat de eerste stam rechts van je staat */
const TREE_FIRST = -1

export interface Tree {
  x: number
  z: number
  /** hoogte in meters */
  h: number
}

/** Bomen rond de baan: in elke bocht een stam aan de binnenkant, aan de randen het bos. */
export function treeLayout(): Tree[] {
  const p = TREE_PATH
  const trees: Tree[] = []
  for (let k = 0; k < p.count; k++) {
    // binnenkant van elke bocht: je rijdt eromheen (kijk naar het gat, niet naar de boom)
    trees.push({ x: 0, z: (k + 0.5) * p.len, h: 4.5 + ((k * 7) % 3) * 0.6 })
    // buitenkant: het gat waar je doorheen gaat
    trees.push({ x: TREE_FIRST * (k % 2 ? -1 : 1) * (p.width + 2.4), z: (k + 0.5) * p.len + 0.6, h: 5 + (k % 2) * 0.8 })
  }
  // bos aan beide kanten, vast patroon zodat het elke keer hetzelfde bos is
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1
    trees.push({ x: side * (6 + ((i * 37) % 7)), z: -12 + i * 2.6 + ((i * 13) % 5) * 0.4, h: 4 + ((i * 11) % 5) * 0.5 })
  }
  return trees
}

export function treeMotion(st: Step[]): Motion {
  const p = TREE_PATH
  // de bochten gaan rond de stammen op x = 0
  const { path, duration } = weave(p, TREE_FIRST)
  const keys = fromPath(path, duration, p.slope, { edgeGain: 0.6, crouch: 0.32, crouchInTurn: 0.38, lead: 0.55, anticipate: 0.4 }, 200)
  // van boven zie je het best hoe je door de gaten gaat (en de camera vliegt niet door de bomen)
  return { keys, duration, steps: st, terrain: 'bomen', slope: p.slope, camera: 'boven' }
}

// ── Poeder ──────────────────────────────────────────────────────────────────

/** Diepte van de verse sneeuw boven de harde ondergrond. */
export const POWDER_DEPTH = 0.3

export function powderMotion(st: Step[]): Motion {
  const p: TurnPath = { len: 9, width: 3.4, speed: 6.5, skid: 1, count: 3, slope: 22 }
  const { path, duration } = weave(p)
  const keys = fromPath(path, duration, p.slope, { edgeGain: 0.6, crouch: 0.32, crouchInTurn: 0.4, lead: 0.3 }, 140, (_, k) => {
    const turn = Math.min(1, Math.abs(k.edge ?? 0) * 1.8)
    return {
      // pompen: tussen de bochten komt het board omhoog (de neus steekt boven de sneeuw uit), in de bocht zakt het weg
      y: 0.25 * (1 - turn),
      crouch: clamp(0.22 + 0.45 * turn, 0, 1),
      // gewicht achter; tussen de bochten de neus omhoog (zweven), in de bocht vlakker zodat hij wegzakt
      lean: -0.45,
      pitch: 9 - 4 * turn,
      upright: 0.7,
    }
  })
  return { keys, duration, steps: st, terrain: 'poeder', slope: p.slope, camera: 'mee', powder: POWDER_DEPTH }
}

export const FREERIDE: Record<string, (st: Step[]) => Motion> = {
  bulten: mogulMotion,
  bomen: treeMotion,
  poeder: powderMotion,
}
