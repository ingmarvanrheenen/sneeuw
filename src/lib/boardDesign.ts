// Board-ontwerp op je skipas: patroon + basiskleur + accentkleur, opgeslagen in je profiel als ids.
import type { CSSProperties } from 'react'
import { BOARD_COLORS, BOARD_PATTERNS, type BoardColor, type BoardPatternId } from '../content/boards'

export interface BoardDesign {
  pattern: BoardPatternId
  base: string
  accent: string
}

const color = (id: unknown): BoardColor | undefined => BOARD_COLORS.find((c) => c.id === id)

/** Alleen geldige ids uit het palet; alles anders (ook van een ander zijn profiel) wordt null. */
export function checkDesign(raw: unknown): BoardDesign | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pattern = BOARD_PATTERNS.find((p) => p.id === r.pattern)?.id
  const base = color(r.base)
  const accent = color(r.accent)
  if (!pattern || !base || !accent) return null
  return { pattern, base: base.id, accent: accent.id }
}

/** Achtergrond van het board. `design` moet al gecheckt zijn. */
export function boardStyle(design: BoardDesign): CSSProperties {
  const b = color(design.base)!.hex
  const a = color(design.accent)!.hex
  const layers: Record<BoardPatternId, Pick<CSSProperties, 'backgroundImage' | 'backgroundSize' | 'backgroundPosition'>> = {
    effen: {},
    strepen: { backgroundImage: `repeating-linear-gradient(115deg, transparent 0 22px, ${a} 22px 30px)` },
    blokken: {
      backgroundImage: `conic-gradient(${a} 25%, transparent 0 50%, ${a} 0 75%, transparent 0)`,
      backgroundSize: '36px 36px',
    },
    stippen: { backgroundImage: `radial-gradient(${a} 3.5px, transparent 4.5px)`, backgroundSize: '22px 22px' },
    zigzag: {
      backgroundImage: `linear-gradient(135deg, ${a} 25%, transparent 25%), linear-gradient(225deg, ${a} 25%, transparent 25%)`,
      backgroundSize: '28px 28px',
      backgroundPosition: '-14px 0, -14px 0',
    },
    fade: { backgroundImage: `linear-gradient(90deg, ${b}, ${a})` },
    split: { backgroundImage: `linear-gradient(90deg, ${b} 50%, ${a} 50%)` },
  }
  return { backgroundColor: b, ...layers[design.pattern] }
}

/** Donker board: inserts en tekst erop licht. */
export const isDarkBoard = (design: BoardDesign) => color(design.base)!.dark

/** Voor "Verras me": een willekeurig ontwerp met twee verschillende kleuren. */
export function randomDesign(rng: () => number = Math.random): BoardDesign {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]
  const base = pick(BOARD_COLORS)
  const accent = pick(BOARD_COLORS.filter((c) => c.id !== base.id))
  return { pattern: pick(BOARD_PATTERNS.filter((p) => p.id !== 'effen')).id, base: base.id, accent: accent.id }
}
