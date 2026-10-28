// Board-ontwerper: patronen en kleuren voor de topsheet op je skipas.
// Net als de pistekleuren zijn dit inhoud-kleuren (wat jij kiest), geen thema-tokens: ze zien er in licht en
// donker hetzelfde uit. In het profiel staan alleen de ids; een kleur of patroon van buiten wordt nooit gebruikt.

export interface BoardColor {
  id: string
  name: string
  hex: string
  /** donkere kleur: inserts en tekst erop licht */
  dark: boolean
}

export const BOARD_COLORS: BoardColor[] = [
  { id: 'sneeuw', name: 'Sneeuw', hex: '#f3f2ec', dark: false },
  { id: 'zwart', name: 'Zwart', hex: '#151515', dark: true },
  { id: 'nacht', name: 'Nachtblauw', hex: '#1d2a4d', dark: true },
  { id: 'ijs', name: 'IJsblauw', hex: '#8fc7ff', dark: false },
  { id: 'groen', name: 'Dennengroen', hex: '#2f7a4a', dark: true },
  { id: 'lime', name: 'Lime', hex: '#b8e04a', dark: false },
  { id: 'geel', name: 'Geel', hex: '#ffd23f', dark: false },
  { id: 'oranje', name: 'Oranje', hex: '#ff7a33', dark: false },
  { id: 'rood', name: 'Rood', hex: '#d93a30', dark: true },
  { id: 'roze', name: 'Roze', hex: '#ff8fc1', dark: false },
  { id: 'paars', name: 'Paars', hex: '#6b4ee6', dark: true },
  { id: 'zand', name: 'Zand', hex: '#d9c7a7', dark: false },
]

export const BOARD_PATTERNS = [
  { id: 'strepen', name: 'Strepen' },
  { id: 'effen', name: 'Effen' },
  { id: 'blokken', name: 'Blokken' },
  { id: 'stippen', name: 'Stippen' },
  { id: 'zigzag', name: 'Zigzag' },
  { id: 'fade', name: 'Fade' },
  { id: 'split', name: 'Split' },
] as const

export type BoardPatternId = (typeof BOARD_PATTERNS)[number]['id']
