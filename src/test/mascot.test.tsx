// Mascotte aanpassen: geldige opties, Verras me, de tekening, en waar hij verschijnt (skipas, deelkaart).
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { checkMascot, DEFAULT_MASCOT, FACES, GOGGLES, HEADS, MOUTHS, randomMascot, STARS } from '../lib/mascot'
import { mascotInner, mascotSvg, MascotSticker } from '../design/Mascot'
import { stickerSvg } from '../design/Stickers'
import { RiderAvatar, SkiPass } from '../components/RiderParts'
import { cardMascotSvg } from '../lib/shareCard'
import { saveProfile } from '../lib/auth'
import { db } from '../lib/db'
import { seeded } from '../lib/random'

afterEach(cleanup)

describe('mascotte-opties', () => {
  it('niks of rommel wordt de standaard (de Episch-sticker van het app-icoon)', () => {
    expect(checkMascot(undefined)).toEqual(DEFAULT_MASCOT)
    expect(checkMascot('hoi')).toEqual(DEFAULT_MASCOT)
    expect(checkMascot({ face: 'ijs', ster: '<script>', goggles: 42, hoofd: 'muts', mond: 'tong', extra: 1 })).toEqual({
      ...DEFAULT_MASCOT,
      face: 'ijs',
      hoofd: 'muts',
      mond: 'tong',
    })
  })

  it('verras me: altijd geldig, en de ster nooit in de kleur van het gezicht', () => {
    const rng = seeded('mascotte')
    for (let i = 0; i < 300; i++) {
      const m = randomMascot(rng)
      expect(checkMascot(m)).toEqual(m)
      expect(m.ster).not.toBe(m.face)
    }
  })

  it('alle kleuren zijn hex en elke optie heeft een naam', () => {
    for (const c of [...FACES, ...STARS, ...GOGGLES]) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
    for (const o of [...FACES, ...STARS, ...GOGGLES, ...HEADS, ...MOUTHS]) expect(o.name.length).toBeGreaterThan(1)
  })
})

describe('mascotte-tekening', () => {
  it('de standaard heeft dezelfde kleuren als de Episch-sticker', () => {
    const svg = mascotSvg(undefined)
    for (const hex of ['#d7ff3c', '#ff5b22', '#0d0d0f']) {
      expect(svg).toContain(hex)
      expect(stickerSvg(5)).toContain(hex)
    }
  })

  it('elke keuze geeft een andere tekening', () => {
    const variants = [
      DEFAULT_MASCOT,
      ...FACES.slice(1).map((f) => ({ ...DEFAULT_MASCOT, face: f.id, ster: 'paars' as const })),
      ...GOGGLES.slice(1).map((g) => ({ ...DEFAULT_MASCOT, goggles: g.id })),
      ...HEADS.slice(1).map((h) => ({ ...DEFAULT_MASCOT, hoofd: h.id })),
      ...MOUTHS.slice(1).map((m) => ({ ...DEFAULT_MASCOT, mond: m.id })),
    ]
    expect(new Set(variants.map(mascotInner)).size).toBe(variants.length)
  })

  it('rare waarden van buiten komen nooit in de svg terecht', () => {
    const svg = mascotSvg({ face: '"/><script>x</script>' } as never, 100)
    expect(svg).not.toContain('script')
    expect(svg).toContain('width="100"')
  })

  it('als sticker met een label voor schermlezers', () => {
    render(<MascotSticker mascot={{ ...DEFAULT_MASCOT, hoofd: 'muts' }} label="Je mascotte" />)
    expect(screen.getByRole('img', { name: 'Je mascotte' }).innerHTML).toContain('#d7ff3c')
  })
})

describe('mascotte in de app', () => {
  it('avatar: foto gaat voor, zonder foto de mascotte, zonder mascotte de voorletter', () => {
    const { container, rerender } = render(<RiderAvatar name="Sam" mascot={DEFAULT_MASCOT} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('S')).toBeNull()
    rerender(<RiderAvatar name="Sam" photo="data:image/png;base64,x" mascot={DEFAULT_MASCOT} />)
    expect(container.querySelector('img')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
    rerender(<RiderAvatar name="Sam" />)
    expect(screen.getByText('S')).toBeTruthy()
  })

  it('skipas zonder foto toont de eigen mascotte (of de standaard)', () => {
    const pass = (profile: object) => render(<SkiPass userId="u1" name="Sam" profile={profile} level={2} levelName="Groentje" />).container
    const mine = pass({ mascot: { ...DEFAULT_MASCOT, face: 'roze' } })
    expect(within(mine).getByRole('group', { name: 'Skipas van Sam' }).innerHTML).toContain('#ffaad4')
    cleanup()
    expect(pass({}).innerHTML).toContain('#d7ff3c')
  })

  it('deelkaart: onderaan jouw mascotte, zonder profiel de standaard', async () => {
    await db.kv.clear()
    expect(await cardMascotSvg(150)).toBe(mascotSvg(DEFAULT_MASCOT, 150))
    await saveProfile({ displayName: 'Sam', favoriteResorts: [], mascot: { ...DEFAULT_MASCOT, goggles: 'zwart', hoofd: 'helm' } })
    expect(await cardMascotSvg(150)).toBe(mascotSvg({ ...DEFAULT_MASCOT, goggles: 'zwart', hoofd: 'helm' }, 150))
  })
})
