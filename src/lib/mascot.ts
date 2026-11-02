// Je eigen mascotte: de Episch-sticker uit het app-icoon, met jouw kleuren, goggles, hoofddeksel en lach.
// Opgeslagen in je profiel als ids (synct mee, je crew ziet hem); de tekening staat in src/design/Mascot.tsx.

export type FaceId = 'lime' | 'ijs' | 'roze' | 'paars' | 'wit' | 'oranje'
export type StarId = 'oranje' | 'lime' | 'ijs' | 'roze' | 'paars'
export type GoggleId = 'wit' | 'oranje' | 'lime' | 'spiegel' | 'zwart'
export type HeadId = 'geen' | 'muts' | 'pet' | 'helm'
export type MouthId = 'lach' | 'grijns' | 'tong'

export interface Mascot {
  face: FaceId
  ster: StarId
  goggles: GoggleId
  hoofd: HeadId
  mond: MouthId
}

/** Artwork-kleuren (zoals de stickers): in licht en donker hetzelfde. */
export const FACES: { id: FaceId; name: string; hex: string }[] = [
  { id: 'lime', name: 'Lime', hex: '#d7ff3c' },
  { id: 'ijs', name: 'IJsblauw', hex: '#9fdcff' },
  { id: 'roze', name: 'Roze', hex: '#ffaad4' },
  { id: 'paars', name: 'Paars', hex: '#c9b2ff' },
  { id: 'wit', name: 'Wit', hex: '#f5f5ef' },
  { id: 'oranje', name: 'Oranje', hex: '#ffa463' },
]
export const STARS: { id: StarId; name: string; hex: string }[] = [
  { id: 'oranje', name: 'Oranje', hex: '#ff5b22' },
  { id: 'lime', name: 'Lime', hex: '#d7ff3c' },
  { id: 'ijs', name: 'IJsblauw', hex: '#5fc0ff' },
  { id: 'roze', name: 'Roze', hex: '#ff6fb5' },
  { id: 'paars', name: 'Paars', hex: '#8f6bff' },
]
export const GOGGLES: { id: GoggleId; name: string; hex: string }[] = [
  { id: 'wit', name: 'Wit', hex: '#ffffff' },
  { id: 'oranje', name: 'Oranje', hex: '#ff5b22' },
  { id: 'lime', name: 'Lime', hex: '#d7ff3c' },
  { id: 'spiegel', name: 'Spiegel', hex: '#6fb3ff' },
  { id: 'zwart', name: 'Zwart', hex: '#0d0d0f' },
]
export const HEADS: { id: HeadId; name: string }[] = [
  { id: 'geen', name: 'Niks' },
  { id: 'muts', name: 'Muts' },
  { id: 'pet', name: 'Pet' },
  { id: 'helm', name: 'Helm' },
]
export const MOUTHS: { id: MouthId; name: string }[] = [
  { id: 'lach', name: 'Lach' },
  { id: 'grijns', name: 'Grijns' },
  { id: 'tong', name: 'Tong' },
]

/** De mascotte van het app-icoon. */
export const DEFAULT_MASCOT: Mascot = { face: 'lime', ster: 'oranje', goggles: 'wit', hoofd: 'geen', mond: 'lach' }

const one = <T extends { id: string }>(list: T[], v: unknown, fallback: T['id']): T['id'] => list.find((x) => x.id === v)?.id ?? fallback

/** Alleen geldige ids; wat er niet klopt (ook uit een ander profiel) valt terug op de standaard. */
export function checkMascot(raw: unknown): Mascot {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    face: one(FACES, r.face, DEFAULT_MASCOT.face),
    ster: one(STARS, r.ster, DEFAULT_MASCOT.ster),
    goggles: one(GOGGLES, r.goggles, DEFAULT_MASCOT.goggles),
    hoofd: one(HEADS, r.hoofd, DEFAULT_MASCOT.hoofd),
    mond: one(MOUTHS, r.mond, DEFAULT_MASCOT.mond),
  }
}

/** Voor "Verras me". Gezicht en ster nooit dezelfde kleur (anders verdwijnt je gezicht). */
export function randomMascot(rng: () => number = Math.random): Mascot {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]
  const face = pick(FACES)
  const ster = pick(STARS.filter((s) => s.id !== face.id))
  return { face: face.id, ster: ster.id, goggles: pick(GOGGLES).id, hoofd: pick(HEADS).id, mond: pick(MOUTHS).id }
}

export const hexOf = <T extends { id: string; hex: string }>(list: T[], id: string) => list.find((x) => x.id === id)!.hex
