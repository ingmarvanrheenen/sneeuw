// Stickers: de stemmingen (1-5) en de crew-reacties als die-cut stickers met een witte rand, in park-stijl.
// Dit is artwork, net als de pistekleuren: de kleuren staan hier vast en zijn in licht en donker hetzelfde,
// zodat een sticker er altijd uitziet als een sticker. Geen emoji: alles is getekend in een 64-grid.
import type { CSSProperties } from 'react'

const INK = '#0d0d0f'
const LIME = '#d7ff3c'
const HOT = '#ff5b22'
const ICE = '#9fdcff'
const GREY = '#d9d8d0'
const CREAM = '#fff6e0'
const WHITE = '#ffffff'
const PALE = '#e9f7b8'

/** Die-cut: de vorm eerst dik in wit (de rand van de sticker), daarna komt de tekening erop. */
const cut = (shape: string) => `<g stroke="${WHITE}" stroke-width="7" stroke-linejoin="round" fill="${WHITE}">${shape}</g>`
const face = (fill: string) => `<circle cx="32" cy="34" r="23" fill="${fill}"/>`
const faceCut = cut('<circle cx="32" cy="34" r="23"/>')
const goggleUp = (lens: string) =>
  `<path d="M9 22c6-5 40-5 46 0"/><rect x="18" y="14" width="28" height="11" rx="5.5" fill="${lens}"/><path d="M22 18h8" stroke="${WHITE}" stroke-width="2"/>`
const burst = (r1: number, r2: number, n: number, fill: string) => {
  let d = ''
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1
    const a = (i * Math.PI) / n - Math.PI / 2
    d += `${i ? 'L' : 'M'}${(32 + r * Math.cos(a)).toFixed(1)} ${(32 + r * Math.sin(a)).toFixed(1)}`
  }
  return `<path d="${d}Z" fill="${fill}"/>`
}

const MOODS: Record<1 | 2 | 3 | 4 | 5, string> = {
  // Kapot: bevroren, kruisjes als ogen, pleister en ijspegels
  1:
    faceCut +
    face(ICE) +
    `<g transform="rotate(-25 44 18)"><rect x="36" y="14" width="16" height="7" rx="2" fill="${CREAM}"/><path d="M42 16v3M46 16v3" stroke-width="1.6"/></g>` +
    '<path d="M20 30l6 6M26 30l-6 6M38 30l6 6M44 30l-6 6"/><path d="M22 47c3-3 5 0 8-2s5 0 8-2 4 0 5 1"/>' +
    `<path d="M14 40l2 6 2-5M48 44l2 5 1-6" fill="${WHITE}" stroke-width="1.8"/>`,
  // Meh: muts over de ogen, rechte mond
  2:
    cut('<circle cx="32" cy="34" r="23"/><path d="M8 26c0-16 48-16 48 0z"/><circle cx="32" cy="7" r="5"/>') +
    face(GREY) +
    `<path d="M8 27c0-17 48-17 48 0z" fill="${HOT}"/><path d="M8 27h48"/>` +
    `<path d="M14 22v4M20 19v7M26 18v8M32 17v9M38 18v8M44 19v7M50 22v4" stroke-width="1.4" opacity=".35"/><circle cx="32" cy="8" r="5" fill="${LIME}"/>` +
    '<path d="M20 35h8M36 35h8"/><path d="M21 33.5c2-1 5-1 7 0M37 33.5c2-1 5-1 7 0" stroke-width="1.6"/><path d="M25 47h14"/>',
  // Prima: goggles op je voorhoofd, glimlach
  3:
    faceCut +
    face(PALE) +
    goggleUp(HOT) +
    `<circle cx="24" cy="34" r="2.3" fill="${INK}" stroke="none"/><circle cx="40" cy="34" r="2.3" fill="${INK}" stroke="none"/><path d="M23 43c4 4 14 4 18 0"/>`,
  // Chill: goggles op, scheve grijns
  4:
    faceCut +
    face(LIME) +
    `<path d="M9 31h46"/><rect x="13" y="25" width="38" height="14" rx="7" fill="${INK}"/><path d="M17 28c6-2 20-2 30 0" stroke="${HOT}" stroke-width="3"/>` +
    `<path d="M19 33l5-4M38 33l5-4" stroke="${WHITE}" stroke-width="1.6" opacity=".8"/><path d="M24 47c5 2 11 1 15-3"/>`,
  // Episch: op een oranje ster, grote lach
  5:
    cut(burst(31, 24, 10, WHITE)) +
    burst(30, 23, 10, HOT) +
    face(LIME) +
    goggleUp(WHITE) +
    `<path d="M20 33c1.5-2.5 5-2.5 6.5 0M37.5 33c1.5-2.5 5-2.5 6.5 0"/><path d="M20 40h24c0 8-5 12-12 12s-12-4-12-12z" fill="${INK}"/>` +
    `<path d="M26 47c3-2 9-2 12 0" stroke="${HOT}" stroke-width="3"/>`,
}

const FLAME = 'M32 60c12 0 20-7 20-18 0-10-7-15-10-24-4 4-5 8-6 12-4-3-6-8-6-14-9 6-18 15-18 26 0 11 8 18 20 18z'
const STONE = 'M18 54V24a14 14 0 0 1 28 0v30z'
const GOAT_HEAD = 'M20 26c0-8 24-8 24 0v12c0 9-5 15-12 15s-12-6-12-15z'
const horn = (d: string) => `<path d="${d}" stroke-width="7"/><path d="${d}" stroke="${CREAM}" stroke-width="3.6"/>`

/** Crew-reacties, op de sleutel die in de database staat (`reactions.emoji`). */
export const REACTION_ART: Record<string, string> = {
  vuur:
    cut(`<path d="${FLAME}"/>`) +
    `<path d="${FLAME}" fill="${HOT}"/>` +
    `<path d="M32 58c6 0 10-4 10-9 0-6-4-8-6-13-2 3-3 5-3 7-3-1-5-4-5-7-4 4-6 8-6 13 0 5 4 9 10 9z" fill="${LIME}"/>`,
  stomp:
    cut(
      '<g transform="rotate(-14 32 30)"><rect x="8" y="20" width="48" height="15" rx="7.5"/></g><ellipse cx="32" cy="52" rx="26" ry="6"/>',
    ) +
    `<ellipse cx="32" cy="52" rx="26" ry="6" fill="${WHITE}"/><path d="M14 50c6 2 30 2 36 0" stroke-width="1.6" opacity=".4"/>` +
    `<g transform="rotate(-14 32 30)"><rect x="8" y="20" width="48" height="15" rx="7.5" fill="${LIME}"/><rect x="18" y="18" width="8" height="10" rx="2" fill="${INK}"/><rect x="38" y="18" width="8" height="10" rx="2" fill="${INK}"/><path d="M13 31h38" stroke-width="1.6" opacity=".5"/></g>` +
    `<path d="M50 4l-3 9M59 11l-8 5M41 3l-1 8" stroke="${HOT}" stroke-width="3"/><path d="M6 44l4 2M58 42l-4 3" stroke-width="2"/>`,
  lol:
    faceCut +
    face(LIME) +
    `<path d="M19 30l6 3-6 3M45 30l-6 3 6 3"/><path d="M18 40h28c0 9-6 13-14 13s-14-4-14-13z" fill="${INK}"/><path d="M24 48c4-3 12-3 16 0" stroke="${HOT}" stroke-width="3"/>` +
    `<path d="M10 34c-3 4-3 8 0 9s4-3 3-6zM54 34c3 4 3 8 0 9s-4-3-3-6z" fill="${ICE}" stroke-width="2"/>`,
  rip:
    cut(`<path d="M18 52V24a14 14 0 0 1 28 0v28z"/><path d="M4 58c8-8 48-8 56 0z"/>`) +
    `<g transform="rotate(10 52 30)"><rect x="48" y="10" width="8" height="40" rx="4" fill="${HOT}"/><path d="M48 22h8M48 36h8" stroke-width="1.6"/></g>` +
    `<path d="${STONE}" fill="${GREY}"/>` +
    `<path d="M25 25v8M25 25h3a2 2 0 0 1 0 4h-3M28 29l2 4M32 25v8M35 33v-8h3a2 2 0 0 1 0 4h-3" stroke-width="2"/>` +
    '<path d="M24 40h16M26 45h12" stroke-width="1.6" opacity=".5"/>' +
    `<path d="M4 58c8-8 48-8 56 0z" fill="${WHITE}"/>`,
  goat:
    cut(
      `<path d="${GOAT_HEAD}"/><path d="M21 22c-5-7-2-15 5-16M43 22c5-7 2-15-5-16"/><path d="M20 30c-7 0-12 3-14 7 5 2 10 1 14-2M44 30c7 0 12 3 14 7-5 2-10 1-14-2"/><path d="M28 51c0 5 2 9 4 10 2-1 4-5 4-10"/><path d="M24 14l3-9 5 5 5-5 3 9z"/>`,
    ) +
    horn('M22 23c-6-7-3-15 4-17') +
    horn('M42 23c6-7 3-15-4-17') +
    `<path d="M20 30c-7 0-12 3-14 7 5 2 10 1 14-2z" fill="${GREY}"/><path d="M44 30c7 0 12 3 14 7-5 2-10 1-14-2z" fill="${GREY}"/>` +
    `<path d="M28 51c0 5 2 9 4 10 2-1 4-5 4-10" fill="${WHITE}"/><path d="${GOAT_HEAD}" fill="${WHITE}"/>` +
    `<path d="M24 41c0-3 16-3 16 0 0 6-4 10-8 10s-8-4-8-10z" fill="${GREY}"/><path d="M29 44v1.5M35 44v1.5" stroke-width="2.4"/>` +
    '<path d="M24 31l5 1M40 31l-5 1" stroke-width="3"/>' +
    `<path d="M24 16l3-10 5 5 5-5 3 10z" fill="${LIME}"/><circle cx="32" cy="10" r="1.4" fill="${HOT}" stroke="none"/>`,
}

function Art({
  inner,
  size,
  label,
  className,
  style,
}: {
  inner: string
  size: number
  label?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke={INK}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{ filter: 'drop-shadow(0 1.5px 0 rgba(0,0,0,0.18))', ...style }}
      // vaste, eigen tekening (geen invoer van buiten)
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  )
}

/**
 * Een sticker als losse SVG-tekst (voor canvas, zoals de deelkaart). `art`: een stemming 1-5 of een reactie-sleutel.
 * Onbekend: een lege string.
 */
export function stickerSvg(art: number | string, size = 64): string {
  const inner = typeof art === 'number' ? MOODS[Math.max(1, Math.min(5, Math.round(art || 3))) as 1 | 2 | 3 | 4 | 5] : REACTION_ART[art]
  if (!inner) return ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" stroke="${INK}" ` +
    `stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  )
}

/** Stemming 1-5 als sticker. */
export function MoodSticker({ value, size = 26, label, className }: { value: number; size?: number; label?: string; className?: string }) {
  const v = Math.max(1, Math.min(5, Math.round(value || 3))) as 1 | 2 | 3 | 4 | 5
  return <Art inner={MOODS[v]} size={size} label={label} className={className} />
}

/** Crew-reactie als sticker (onbekende sleutel: niks). */
export function ReactionSticker({ kind, size = 24, className }: { kind: string; size?: number; className?: string }) {
  const inner = REACTION_ART[kind]
  return inner ? <Art inner={inner} size={size} className={className} /> : null
}

/**
 * Stemming in een kiezer: de gekozen sticker klapt erop (een tikje gedraaid), de rest staat er grijzig naast.
 * Geen eigen label: de knop eromheen heeft de tekst al.
 */
export function MoodPick({ value, on, size = 34 }: { value: number; on: boolean; size?: number }) {
  return (
    <span
      key={on ? 'aan' : 'uit'}
      className={on ? 'slap block' : 'block opacity-55 grayscale-[0.6] transition-[opacity,filter] duration-200'}
      style={on ? ({ '--tilt': `${value % 2 ? -8 : 7}deg`, '--delay': '0ms' } as CSSProperties) : undefined}
    >
      <MoodSticker value={value} size={size} />
    </span>
  )
}
