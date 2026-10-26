// Sneeuw Daddy icon set.
// Regels: 24×24 grid, stroke 1.8, vierkante uiteinden (square caps), scherpe hoeken (miter joins),
// geen vulling tenzij het icoon "solid" is. Nooit emoji gebruiken; voeg hier een icoon toe.
import type { SVGProps } from 'react'

const P = {
  // navigatie & UI
  home: 'M3 11 12 4l9 7M5.5 9.5V20h4.5v-6h4v6h4.5V9.5',
  log: 'M5 3h14v18H5zM9 3v18M12.5 8H16M12.5 12H16',
  book: 'M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z',
  crew: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2.2.6 3.5 2.8 3.5 6',
  more: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  plus: 'M12 4v16M4 12h16',
  minus: 'M4 12h16',
  close: 'M5 5l14 14M19 5 5 19',
  back: 'M15 4l-8 8 8 8',
  chevron: 'M9 4l8 8-8 8',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  check: 'M4 12.5 9.5 18 20 6',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  replay: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  share: 'M12 3v12M7 8l5-5 5 5M5 12v8h14v-8',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z',
  cloudOff: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9zM3 3l18 18',
  device: 'M7 2h10v20H7zM11 18h2',
  sync: 'M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4',
  alert: 'M12 3 2 20h20zM12 9v5M12 17v.5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12v.01',
  chat: 'M4 4h16v12H9l-5 4zM8.5 10v.01M12 10v.01M15.5 10v.01',
  send: 'M4 12 20 4l-6 16-3-7zM11 13l9-9',
  vault: 'M3 4h18v15H3zM7 19v2M17 19v2M14 11.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM11.5 9V7.5M18 9v5',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6',
  chart: 'M4 4v16h16M8 16v-5M12 16V8M16 16v-3',
  suitcase: 'M3 8h18v12H3zM9 8V4h6v4M3 13h18',
  board: 'M2 13.5c0-1.7 1.3-3 3-3h14c1.7 0 3 1.3 3 3s-1.3 3-3 3H5c-1.7 0-3-1.3-3-3zM8 7.5v5M16 7.5v5',
  quiz: 'M3 3h18v18H3zM9 9.5a3 3 0 1 1 4.4 2.6c-.9.5-1.4 1.1-1.4 2.2M12 17.5v.01',
  star: 'M12 3l2.6 6 6.4.5-4.9 4.2 1.5 6.3L12 16.6 6.4 20l1.5-6.3L3 9.5 9.4 9z',
  mirror: 'M12 3v18M9 7 3 17h6zM15 7l6 10h-6z',
  trail: 'M3 14h6v6H3zM9 9h6v6H9zM15 4h6v6h-6z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  logout: 'M14 4h6v16h-6M10 8l-4 4 4 4M6 12h10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  list: 'M4 6h2M10 6h10M4 12h2M10 12h10M4 18h2M10 18h10',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  palette:
    'M12 3a9 9 0 1 0 0 18c1.2 0 1.6-.9 1.2-1.8-.5-1.1.2-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10zM7.5 12v.01M10 7.5v.01M15 7.5v.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  // snowboard & berg
  mountain: 'M2 20 9 8l4 6 3-4 6 10zM7.3 11 9 12.3l1.7-1.3',
  lift: 'M2 4l20 6M9 6.1V12M6 12h6v6H6zM6 15h6',
  kicker: 'M2 20h20M4 20c6 0 9-3 11-9h2v9',
  impact: 'M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M5 19l3.5-3.5M15.5 8.5 19 5',
  bandage: 'M4 15 15 4a3 3 0 0 1 5 5L9 20a3 3 0 0 1-5-5zM9.5 9.5l5 5',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  image: 'M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M15.5 9h.01',
  sparkle: 'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z',
  // weer
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  partly:
    'M8 3V1.5M3 8H1.5M4.5 4.5l-1-1M11.5 4.5l1-1M5.2 10.5A3.5 3.5 0 0 1 11 6.4M9 21h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 9 13.5 3.8 3.8 0 0 0 9 21z',
  snow: 'M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 6a4.5 4.5 0 0 0 1 9zM8 19v.01M12 21v.01M16 19v.01',
  rain: 'M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 6a4.5 4.5 0 0 0 1 9zM8 18l-1 3M12 18l-1 3M16 18l-1 3',
  fog: 'M3 8h18M5 12h14M3 16h18M7 20h10',
  wind: 'M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7',
  snowflake: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9.5 4 12 6l2.5-2M9.5 20 12 18l2.5 2',
  thermo: 'M10 14V4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0zM12 17v-5',
  // reacties
  flame: 'M12 22c4 0 7-2.7 7-6.6 0-3.8-2.8-6-4-9.4-1.6 1.6-2.2 3.3-2.3 5-1.5-1-2.4-2.8-2.4-5C7 8 5 11.5 5 15.4 5 19.3 8 22 12 22z',
  crown: 'M3 18 2 7l5.5 4L12 4l4.5 7L22 7l-1 11zM3 21h18',
  skull: 'M5 11a7 7 0 1 1 14 0v4h-3v4H8v-4H5zM8.5 11h2v2h-2zM13.5 11h2v2h-2zM12 19v-2',
  stomp: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM7.5 12.5l3 3 6-7',
  lol: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM7.5 13.5h9a4.5 4.5 0 0 1-9 0zM8 9.5l2 1-2 1M16 9.5l-2 1 2 1',
  // moods 1-5
  mood1: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 9l2 2M10 9l-2 2M14 9l2 2M16 9l-2 2M8.5 17c1.2-1.6 5.8-1.6 7 0',
  mood2: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10v1M15 10v1M8.5 16.2c2-.8 5-.8 7 .4',
  mood3: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10v1M15 10v1M8.5 14.5c1.5 1.3 5.5 1.3 7 0',
  mood4: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM6.5 9h4.5v2.5H6.5zM13 9h4.5v2.5H13zM11 10h2M8.5 15c1.5 1.5 5.5 1.5 7 0',
  mood5: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM7.5 13.5h9a4.5 4.5 0 0 1-9 0zM8 10c.7-1 1.8-1 2.5 0M13.5 10c.7-1 1.8-1 2.5 0',
} as const

const SOLID = {
  play: 'M7 4v16l13-8z',
  pause: 'M6.5 4h4v16h-4zM13.5 4h4v16h-4z',
  dot: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
} as const

export type IconName = keyof typeof P | keyof typeof SOLID
export const ICON_NAMES = [...Object.keys(P), ...Object.keys(SOLID)] as IconName[]

export function Icon({
  name,
  size = 22,
  stroke = 1.8,
  className,
  ...rest
}: { name: IconName; size?: number; stroke?: number } & Omit<SVGProps<SVGSVGElement>, 'name' | 'stroke'>) {
  const solid = name in SOLID
  const d = solid ? SOLID[name as keyof typeof SOLID] : P[name as keyof typeof P]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeMiterlimit={8}
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Icon name="sync" size={size} className="animate-spin" />
}

/** Mood 1–5 als eigen gezichtje. */
export function Mood({ value, size = 26, className }: { value: number; size?: number; className?: string }) {
  const v = Math.max(1, Math.min(5, Math.round(value))) as 1 | 2 | 3 | 4 | 5
  return <Icon name={`mood${v}`} size={size} className={className} />
}

export const MOOD_LABELS = ['Kapot', 'Meh', 'Prima', 'Chill', 'Episch'] as const

/** Ruwe path-data (voor canvas-tekeningen zoals de share-kaart). */
export function iconPath(name: IconName): { d: string; solid: boolean } {
  if (name in SOLID) return { d: SOLID[name as keyof typeof SOLID], solid: true }
  return { d: P[name as keyof typeof P], solid: false }
}
