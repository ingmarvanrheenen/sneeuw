// De mascotte als sticker: ster, gezicht, goggles, hoofddeksel, lach en extraatje, in het 64-grid van de stickers.
import { useState } from 'react'
import { checkMascot, FACES, GOGGLES, hexOf, STARS, type Mascot } from '../lib/mascot'

const INK = '#0d0d0f'
const WHITE = '#ffffff'
const HOT = '#ff5b22'

const burst = (r1: number, r2: number, fill: string) => {
  let d = ''
  for (let i = 0; i < 20; i++) {
    const r = i % 2 ? r2 : r1
    const a = (i * Math.PI) / 10 - Math.PI / 2
    d += `${i ? 'L' : 'M'}${(32 + r * Math.cos(a)).toFixed(1)} ${(32 + r * Math.sin(a)).toFixed(1)}`
  }
  return `<path d="${d}Z" fill="${fill}"/>`
}

/** De tekening (binnenkant van een 64x64-svg). */
export function mascotInner(raw: Partial<Mascot> | undefined): string {
  const m = checkMascot(raw)
  const face = hexOf(FACES, m.face)
  const star = hexOf(STARS, m.ster)
  const lens = hexOf(GOGGLES, m.goggles)
  const shine = m.goggles === 'wit' || m.goggles === 'lime' ? HOT : WHITE
  const goggles = `<path d="M9 22c6-5 40-5 46 0"/><rect x="18" y="14" width="28" height="11" rx="5.5" fill="${lens}"/><path d="M22 18h8" stroke="${shine}" stroke-width="2"/>`
  const head = {
    geen: goggles,
    // muts in inkt met een lime pompon, goggles op de rand
    muts: `<path d="M9 25c0-20 46-20 46 0z" fill="${INK}"/><circle cx="32" cy="6" r="4.5" fill="#d7ff3c"/><path d="M14 20v5M20 17v8M26 15v10M32 14v11M38 15v10M44 17v8M50 20v5" stroke="${WHITE}" stroke-width="1.2" opacity=".35"/>${goggles}`,
    // pet met klep naar rechts, geen goggles
    pet: `<path d="M10 24c0-18 44-18 44 0z" fill="${INK}"/><path d="M40 22h18c0 3-3 6-7 6H38z" fill="${INK}"/><circle cx="32" cy="9" r="2" fill="${star}" stroke="none"/>`,
    // zilveren helm met een glimlijn, goggles erop
    helm: `<path d="M8 30c0-25 48-25 48 0z" fill="#b9bec8"/><path d="M15 17c4-5 10-8 16-8" stroke="${WHITE}" stroke-width="2.4"/>${goggles}`,
    // capuchon: hoort om het gezicht (zie onder), hier alleen de goggles erop
    capuchon: goggles,
  }[m.hoofd]
  // capuchon in de sterkleur, achter het gezicht zodat er een rand omheen staat, met koordjes
  const hood =
    m.hoofd === 'capuchon'
      ? `<path d="M5 42c0-34 54-34 54 0v6c0 5-3 8-8 8H13c-5 0-8-3-8-8z" fill="${star}"/>` +
        `<path d="M25 56v5M39 56v5" stroke="${WHITE}" stroke-width="2.2"/><circle cx="25" cy="61.5" r="1.6" fill="${WHITE}" stroke="none"/><circle cx="39" cy="61.5" r="1.6" fill="${WHITE}" stroke="none"/>`
      : ''
  const extra = {
    geen: '',
    // sjaal om de nek, oranje met lime strepen, een slip naar rechts
    sjaal:
      `<path d="M11 49c11 7 31 7 42 0l2 7c-13 8-33 8-46 0z" fill="${HOT}"/>` +
      `<path d="M40 55l5 8h6l-4-9z" fill="${HOT}"/><path d="M19 53l-1 5M27 55v5M36 55l1 5M46 58h4" stroke="#d7ff3c" stroke-width="2"/>`,
    // het handje dat je board vasthoudt (het board zelf staat achter je gezicht, zie onder)
    board: `<circle cx="53" cy="47" r="4.6" fill="${face}"/>`,
  }[m.extra]
  // board schuin achter je, steekt rechts boven en onder uit
  const board =
    m.extra === 'board'
      ? `<g transform="rotate(24 50 34)"><rect x="45" y="2" width="11" height="60" rx="5.5" fill="${INK}" stroke="${WHITE}" stroke-width="2"/><path d="M50.5 9v46" stroke="#d7ff3c" stroke-width="2.2"/></g>`
      : ''
  const mouth = {
    lach: `<path d="M20 40h24c0 8-5 12-12 12s-12-4-12-12z" fill="${INK}"/><path d="M26 47c3-2 9-2 12 0" stroke="${HOT}" stroke-width="3"/>`,
    grijns: `<path d="M23 45c5 3 13 2 18-3"/>`,
    tong: `<path d="M21 42c5 4 17 4 22 0"/><path d="M29 44c0 6 7 6 7 0z" fill="${HOT}"/>`,
  }[m.mond]
  return (
    `<g stroke="${WHITE}" stroke-width="5" stroke-linejoin="round">${burst(31, 24, WHITE)}</g>` +
    burst(30, 23, star) +
    board +
    hood +
    `<circle cx="32" cy="34" r="23" fill="${face}"/>` +
    head +
    '<path d="M20 33c1.5-2.5 5-2.5 6.5 0M37.5 33c1.5-2.5 5-2.5 6.5 0"/>' +
    mouth +
    extra
  )
}

/** Losse svg-tekst (voor canvas, zoals de deelkaart). */
export function mascotSvg(m: Partial<Mascot> | undefined, size = 64): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" stroke="${INK}" ` +
    `stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${mascotInner(m)}</svg>`
  )
}

export function MascotSticker({
  mascot,
  size = 64,
  label,
  className,
  alive = false,
}: {
  mascot?: Partial<Mascot>
  size?: number
  label?: string
  className?: string
  /** deint rustig en wiebelt als je erop tikt */
  alive?: boolean
}) {
  const [wiggle, setWiggle] = useState(0)
  const svg = (
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
      style={{ filter: 'drop-shadow(0 1.5px 0 rgba(0,0,0,0.18))' }}
      // eigen tekening uit vaste ids (checkMascot), geen invoer van buiten
      dangerouslySetInnerHTML={{ __html: mascotInner(mascot) }}
    />
  )
  if (!alive) return svg
  return (
    <span className="mascot-bob inline-block">
      <span
        key={wiggle}
        role="button"
        tabIndex={0}
        aria-label={label ? `${label}, tik om te wiebelen` : 'Tik om te wiebelen'}
        className={wiggle > 0 ? 'mascot-wiggle inline-block cursor-pointer' : 'inline-block cursor-pointer'}
        onClick={() => setWiggle((n) => n + 1)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setWiggle((n) => n + 1)}
      >
        {svg}
      </span>
    </span>
  )
}
