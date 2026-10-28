import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const api = vi.hoisted(() => ({
  cachedRider: vi.fn(),
  loadRider: vi.fn(),
  riderMedia: vi.fn(),
  nicknameInbox: vi.fn(),
  answerNickname: vi.fn(),
  suggestNickname: vi.fn(),
  makeAvatar: vi.fn(),
}))
vi.mock('../lib/riders', async (orig) => ({ ...(await orig<typeof import('../lib/riders')>()), ...api }))
vi.mock('../lib/sync', async (orig) => ({ ...(await orig<typeof import('../lib/sync')>()), scheduleSync: vi.fn() }))
const ladderApi = vi.hoisted(() => ({ loadPodiums: vi.fn(), cachedPodiums: vi.fn(), backend: { on: false } }))
vi.mock('../lib/ladder', async (orig) => ({
  ...(await orig<typeof import('../lib/ladder')>()),
  loadPodiums: ladderApi.loadPodiums,
  cachedPodiums: ladderApi.cachedPodiums,
}))
vi.mock('../lib/supabase', async (orig) => {
  const real = await orig<typeof import('../lib/supabase')>()
  return {
    ...real,
    get hasBackend() {
      return ladderApi.backend.on || real.hasBackend
    },
  }
})

import Rider from '../pages/Rider'
import { SkiPass, StickerBoard, StickerTracks } from '../components/RiderParts'
import { authStore, getProfile, saveProfile } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { create } from '../lib/repo'
import { EMPTY_DRAFT } from '../lib/sessions'
import { toastStore } from '../lib/toast'
import { TRICKS } from '../content/tricks'

const online = (on: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })
const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rider/:id" element={<Rider />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  setCurrentUserId(null)
  authStore.set({ ...authStore.get(), user: null })
  online(true)
  toastStore.set([])
  api.riderMedia.mockResolvedValue([])
  api.nicknameInbox.mockResolvedValue([])
  api.answerNickname.mockResolvedValue(undefined)
  api.suggestNickname.mockResolvedValue(undefined)
  api.cachedRider.mockResolvedValue(null)
  ladderApi.backend.on = false
  ladderApi.loadPodiums.mockResolvedValue([])
  ladderApi.cachedPodiums.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('skipas en stickerboek', () => {
  it('skipas: naam, bijnaam, motto, stance, thuisresort, seizoen en pasnummer', () => {
    render(
      <SkiPass
        userId="a1b2c3d4-0000"
        name="Ingmar"
        profile={{
          nickname: 'Valkoning',
          motto: 'Vallen is ook een trick',
          stance: 'goofy',
          angleFront: 15,
          angleBack: -15,
          homeResort: 'val-thorens',
        }}
        level={3}
        levelName="Zijslipper"
        progress={0.4}
        now={new Date(2026, 10, 1)}
      />,
    )
    const pass = screen.getByRole('group', { name: 'Skipas van Ingmar' })
    for (const t of ['Ingmar', '“Valkoning”', 'Vallen is ook een trick', 'Goofy · 15° / -15°', '26/27', 'A1B2 C3D4'])
      expect(within(pass).getByText(t)).toBeTruthy()
    expect(within(pass).getByText(/Zijslipper/)).toBeTruthy()
    expect(within(pass).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40')
  })

  it('skipas zonder keuzes: nette lege velden, geen voortgangsbalk voor een crewgenoot', () => {
    render(<SkiPass userId={null} name="Sem" profile={{}} level={1} levelName="Groentje" />)
    expect(screen.getAllByText('Nog niet gekozen')).toHaveLength(2)
    expect(screen.getByText('LOKAAL')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('board: je stickers erop, de rest als "+N"', () => {
    const many = TRICKS.slice(0, 20).map((t) => t.id)
    render(<StickerBoard landed={many} />)
    const board = screen.getByRole('img', { name: /Je board met stickers/ })
    expect(board.getAttribute('aria-label')).toMatch(/en nog 13$/)
    expect(within(board).getByText('+13')).toBeTruthy()
  })

  it('leeg board: uitleg', () => {
    render(<StickerBoard landed={[]} />)
    expect(screen.getByRole('img', { name: 'Leeg board, nog geen stickers' })).toBeTruthy()
    expect(screen.getByText(/Land je eerste trick/)).toBeTruthy()
  })

  it('tracks: één regel per track met de volgende sticker; tik toont alles, ook de lege plekken', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <StickerTracks landed={['ollie']} />
      </MemoryRouter>,
    )
    const flat = TRICKS.filter((t) => t.track === 'flat')
    const row = screen.getByRole('button', { name: new RegExp(`^Flatland.*1/${flat.length}`) })
    expect(row.textContent).toMatch(/Volgende: /)
    await user.click(row)
    const sheet = screen.getByRole('dialog', { name: 'Flatland' })
    expect(within(sheet).getByRole('link', { name: 'Ollie' }).getAttribute('href')).toBe('/tricks/ollie')
    expect(within(sheet).getAllByRole('link', { name: /nog te verdienen$/ })).toHaveLength(flat.length - 1)
  })
})

describe('je eigen skipas', () => {
  async function seed() {
    await saveProfile({ ...(await getProfile()), displayName: 'Ingmar', stance: 'regular', motto: 'Send it' })
    await create('session', { ...EMPTY_DRAFT, date: '2027-01-16', hours: 6, falls: 9, pistes: ['rood'] })
    await create('trick', { trickId: 'ollie', status: 'geland', mediaIds: [] })
    // een trick die niet meer in de bijbel staat
    await create('trick', { trickId: 'oude-trick', status: 'geland', mediaIds: [] })
  }

  it('werkt zonder account: skipas, eerlijke stats en stickerboek uit je logboek', async () => {
    await seed()
    at('/rider/ik')
    const pass = await screen.findByRole('group', { name: 'Skipas van Ingmar' })
    expect(within(pass).getByText('Send it')).toBeTruthy()
    expect(within(pass).getByText('LOKAAL')).toBeTruthy()
    expect(screen.getByText('9 keer gevallen')).toBeTruthy()
    expect(screen.getByText('En nooit opgegeven')).toBeTruthy()
    expect(screen.getByText('max 9 op een dag')).toBeTruthy()
    expect(screen.getByText('6 u')).toBeTruthy()
    // één dag: enkelvoud
    expect(screen.getByText('Dag')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Je board met stickers: Ollie' })).toBeTruthy()
    expect(api.nicknameInbox).not.toHaveBeenCalled()
  })

  it('bewerken: motto, signature trick en thuisresort komen op je pas', async () => {
    const user = userEvent.setup()
    await seed()
    at('/rider/ik')
    await user.click(await screen.findByRole('button', { name: 'Bewerk' }))
    const motto = screen.getByPlaceholderText(/vallen is ook een trick/)
    await user.clear(motto)
    await user.type(motto, 'Altijd de eerste lift')
    expect(screen.queryByRole('button', { name: 'oude-trick' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ollie' }))
    await user.click(screen.getByRole('button', { name: 'Klaar' }))
    await waitFor(async () => expect((await getProfile()).motto).toBe('Altijd de eerste lift'))
    expect((await getProfile()).signatureTrick).toBe('ollie')
    expect(await screen.findByText('Signature trick')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: /Skipas/ })).getByText('Altijd de eerste lift')).toBeTruthy()
  })

  it('board ontwerpen: patroon en kleuren live op je board, en opgeslagen in je profiel', async () => {
    const user = userEvent.setup()
    await seed()
    at('/rider/ik')
    await user.click(await screen.findByRole('button', { name: 'Bewerk' }))
    await user.click(screen.getByRole('button', { name: /Je board/ }))
    const sheet = screen.getByRole('dialog', { name: 'Je board' })
    const board = () => within(sheet).getByRole('img', { name: /board/ })
    expect(board().getAttribute('data-pattern')).toBe('standaard')
    await user.click(within(sheet).getByRole('button', { name: 'Stippen' }))
    expect(board().getAttribute('data-pattern')).toBe('stippen')
    const base = within(sheet).getByRole('group', { name: 'Basiskleur' })
    const accent = within(sheet).getByRole('group', { name: 'Accentkleur' })
    await user.click(within(base).getByRole('button', { name: 'Zwart' }))
    await user.click(within(accent).getByRole('button', { name: 'Lime' }))
    // accent kan niet dezelfde kleur zijn als de basis
    expect((within(accent).getByRole('button', { name: 'Zwart' }) as HTMLButtonElement).disabled).toBe(true)
    // basis op de accentkleur zetten: dan wisselen ze om
    await user.click(within(base).getByRole('button', { name: 'Lime' }))
    expect(within(accent).getByRole('button', { name: 'Zwart' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(base).getByRole('button', { name: 'Zwart' }))
    await user.click(within(accent).getByRole('button', { name: 'Lime' }))
    await user.click(within(sheet).getByRole('button', { name: 'Klaar' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Profiel bewerken' })).getByRole('button', { name: 'Klaar' }))
    await waitFor(async () => expect((await getProfile()).board).toEqual({ pattern: 'stippen', base: 'zwart', accent: 'lime' }))
    expect(screen.getByRole('img', { name: 'Je board met stickers: Ollie' }).getAttribute('data-pattern')).toBe('stippen')
  })

  it('verras me geeft een ontwerp, standaard haalt het weer weg', async () => {
    const user = userEvent.setup()
    await seed()
    at('/rider/ik')
    await user.click(await screen.findByRole('button', { name: 'Bewerk' }))
    await user.click(screen.getByRole('button', { name: /Je board/ }))
    const sheet = screen.getByRole('dialog', { name: 'Je board' })
    await user.click(within(sheet).getByRole('button', { name: /Verras me/ }))
    expect(within(sheet).getByRole('img', { name: /board/ }).getAttribute('data-pattern')).not.toBe('standaard')
    await user.click(within(sheet).getByRole('button', { name: 'Standaard' }))
    expect(within(sheet).getByRole('img', { name: /board/ }).getAttribute('data-pattern')).toBe('standaard')
    await user.click(within(sheet).getByRole('button', { name: 'Klaar' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Profiel bewerken' })).getByRole('button', { name: 'Klaar' }))
    await waitFor(async () => expect((await getProfile()).board).toBeUndefined())
  })

  it('bijnaam-voorstel van je crew: ja zet hem op je pas', async () => {
    const user = userEvent.setup()
    await seed()
    setCurrentUserId('me')
    authStore.set({ ...authStore.get(), user: { id: 'me' } as never })
    api.nicknameInbox.mockResolvedValue([{ id: 'n1', from_user: 'daan', fromName: 'Daan', nickname: 'Valkoning' }])
    at('/rider/ik')
    expect(await screen.findByText('van Daan')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Ja' }))
    expect(api.answerNickname).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), true)
    expect(screen.queryByText('van Daan')).toBeNull()
    expect(toastStore.get().some((t) => t.title === 'Je heet nu “Valkoning”')).toBe(true)
  })

  it('je eigen user-id in de link is ook je eigen pas', async () => {
    await seed()
    setCurrentUserId('me')
    authStore.set({ ...authStore.get(), user: { id: 'me' } as never })
    at('/rider/me')
    expect(await screen.findByRole('button', { name: 'Bewerk' })).toBeTruthy()
    expect(api.loadRider).not.toHaveBeenCalled()
  })
})

describe('skipas van een crewgenoot', () => {
  const daan = {
    userId: 'daan',
    name: 'Daan',
    profile: { nickname: 'Sendlord', signatureTrick: 'ollie', homeResort: 'Ischgl' },
    stats: { level: 4, levelName: 'Falling Leaf', days: 5, hours: 22, falls: 31, landed: ['ollie', 'shifty'], badgeIds: [] },
  }

  it('laat zijn pas, stats en stickers zien, zonder bewerken', async () => {
    api.loadRider.mockResolvedValue(daan)
    at('/rider/daan')
    const pass = await screen.findByRole('group', { name: 'Skipas van Daan' })
    expect(within(pass).getByText('“Sendlord”')).toBeTruthy()
    expect(within(pass).getByText('Ischgl')).toBeTruthy()
    expect(screen.getByText('31 keer gevallen')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Skipas' })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Je board met stickers: (Shifty, Ollie|Ollie, Shifty)$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Bewerk' })).toBeNull()
    expect(api.riderMedia).toHaveBeenCalledWith('daan')
  })

  it('het board-ontwerp van een crewgenoot staat op de pas; rommel in het profiel wordt het standaard board', async () => {
    api.loadRider.mockResolvedValue({ ...daan, profile: { ...daan.profile, board: { pattern: 'zigzag', base: 'rood', accent: 'sneeuw' } } })
    const { unmount } = at('/rider/daan')
    expect((await screen.findByRole('img', { name: /Je board/ })).getAttribute('data-pattern')).toBe('zigzag')
    unmount()
    api.loadRider.mockResolvedValue({
      ...daan,
      profile: { ...daan.profile, board: { pattern: 'zigzag', base: 'url(x)', accent: 'sneeuw' } },
    })
    at('/rider/daan')
    expect((await screen.findByRole('img', { name: /Je board/ })).getAttribute('data-pattern')).toBe('standaard')
  })

  it('podium van vorig seizoen staat als medaille op de pas', async () => {
    ladderApi.backend.on = true
    ladderApi.loadPodiums.mockResolvedValue([
      { crewId: 'c1', crewName: 'Shredheads', season: '25/26', rank: 1, of: 4 },
      { crewId: 'c2', crewName: 'Familie', season: '25/26', rank: 3, of: 5 },
    ])
    api.loadRider.mockResolvedValue(daan)
    at('/rider/daan')
    const sec = (await screen.findByRole('heading', { name: 'Seizoensladder' })).closest('section') as HTMLElement
    expect(within(sec).getByText('Kampioen 25/26')).toBeTruthy()
    expect(within(sec).getByText('Shredheads')).toBeTruthy()
    expect(within(sec).getByText('3e plek 25/26')).toBeTruthy()
    expect(ladderApi.loadPodiums).toHaveBeenCalledWith('daan')
  })

  it('geen podium: geen lege seizoensladder', async () => {
    ladderApi.backend.on = true
    api.loadRider.mockResolvedValue(daan)
    at('/rider/daan')
    await screen.findByRole('group', { name: 'Skipas van Daan' })
    expect(screen.queryByRole('heading', { name: 'Seizoensladder' })).toBeNull()
  })

  it('bijnaam voorstellen', async () => {
    const user = userEvent.setup()
    api.loadRider.mockResolvedValue(daan)
    at('/rider/daan')
    await user.click(await screen.findByRole('button', { name: 'Bijnaam voorstellen' }))
    await user.type(screen.getByPlaceholderText('Bijv. Valkoning'), 'Poederkoning')
    await user.click(screen.getByRole('button', { name: 'Voorstellen' }))
    expect(api.suggestNickname).toHaveBeenCalledWith('daan', 'Poederkoning')
    await waitFor(() => expect(toastStore.get().some((t) => t.title === 'Voorgesteld')).toBe(true))
  })

  it('offline: de laatst bekende pas, zonder voorstellen', async () => {
    online(false)
    api.cachedRider.mockResolvedValue(daan)
    at('/rider/daan')
    expect(await screen.findByRole('group', { name: 'Skipas van Daan' })).toBeTruthy()
    expect(api.loadRider).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Bijnaam voorstellen' })).toBeNull()
  })

  it('niet in je crew: uitleg in plaats van een lege pagina', async () => {
    api.loadRider.mockResolvedValue(null)
    at('/rider/vreemd')
    expect(await screen.findByText('Profiel niet gevonden')).toBeTruthy()
  })
})
