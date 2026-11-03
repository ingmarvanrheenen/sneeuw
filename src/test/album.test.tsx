// Stickerboek: badges en trick-stickers per seizoen, afgeleid uit je data; en de albumpagina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const share = vi.hoisted(() => ({ renderAlbumCard: vi.fn(), shareImage: vi.fn() }))
vi.mock('../lib/shareCard', async (orig) => ({ ...(await orig<typeof import('../lib/shareCard')>()), ...share }))
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import StickerBook from '../pages/StickerBook'
import { album, albumTotals, inputUntil, seasonEnd, seasonsOf } from '../lib/album'
import { BADGES, unlockedBadges, type ProgressInput } from '../lib/progress'
import { EMPTY_DRAFT } from '../lib/sessions'
import { create } from '../lib/repo'
import { db } from '../lib/db'
import type { Session, TrickProgress } from '../lib/types'
import { albumCardLayout, placePills } from '../lib/shareCard'
import { toastStore } from '../lib/toast'

const day = (date: string, hours = 4) => ({ ...EMPTY_DRAFT, id: date, kind: 'session', date, hours, createdAt: 0, updatedAt: 0 }) as Session
const trick = (trickId: string, firstLandedAt?: string) =>
  ({
    id: trickId,
    kind: 'trick',
    trickId,
    status: 'geland',
    firstLandedAt,
    mediaIds: [],
    userId: null,
    createdAt: 0,
    updatedAt: 0,
  }) as TrickProgress
const input = (over: Partial<ProgressInput> = {}): ProgressInput => ({
  sessions: [],
  tricks: [],
  goals: [],
  media: [],
  gear: [],
  trips: [],
  quizBest: 0,
  quizCorrect: 0,
  inCrew: false,
  ...over,
})
const TODAY = '2026-12-20' // seizoen 26/27

describe('album-logica', () => {
  const data = input({
    sessions: [
      '2026-01-10',
      '2026-01-11',
      '2026-01-12',
      '2026-02-01',
      '2026-02-02',
      '2026-12-10',
      '2026-12-11',
      '2026-12-12',
      '2026-12-13',
      '2026-12-14',
    ].map((d) => day(d)),
    tricks: [trick('ollie', '2026-02-02'), trick('shifty')],
    quizBest: 10,
    quizCorrect: 200,
    inCrew: true,
  })

  it('seizoenen: van juli tot juni; met iets erin plus het huidige', () => {
    expect(seasonEnd('25/26')).toBe('2026-06-30')
    expect(seasonsOf(data, TODAY)).toEqual(['25/26', '26/27'])
    expect(seasonsOf(input(), '2027-08-01')).toEqual(['27/28'])
  })

  it('een badge staat in het seizoen waarin je hem voor het eerst haalde, nooit dubbel', () => {
    const [old, now] = album(data, TODAY)
    const ids = (p: typeof old) => p.badges.map((b) => b.id)
    expect(old).toMatchObject({ season: '25/26', days: 5, hours: 20, current: false })
    expect(ids(old)).toEqual(expect.arrayContaining(['dag-1', 'dag-5', 'eerste-ollie']))
    expect(ids(now)).toContain('dag-10')
    expect(ids(now)).not.toContain('dag-5')
    expect(now.current).toBe(true)
    const all = [...ids(old), ...ids(now)]
    expect(new Set(all).size).toBe(all.length)
    // samen precies wat de badge-pagina laat zien
    expect(new Set(all)).toEqual(new Set(unlockedBadges(data).map((b) => b.id)))
  })

  it('trick-stickers op het seizoen van je eerste landing; zonder datum in het huidige', () => {
    const [old, now] = album(data, TODAY)
    expect(old.tricks.map((t) => t.id)).toEqual(['ollie'])
    expect(now.tricks.map((t) => t.id)).toEqual(['shifty'])
  })

  it('terug in de tijd: tricks, doelen en spullen van later tellen niet mee', () => {
    const past = inputUntil(
      input({
        tricks: [trick('ollie', '2026-12-01')],
        goals: [
          { id: 'g', kind: 'goal', title: 'x', done: true, doneAt: Date.parse('2026-12-01'), userId: null, createdAt: 0, updatedAt: 0 },
        ],
        gear: [{ id: 'b', kind: 'gear', createdAt: Date.parse('2026-12-01') } as never],
        quizBest: 10,
      }),
      '25/26',
      false,
    )
    expect(past.tricks[0].status).toBe('bezig')
    expect(past.goals[0].done).toBe(false)
    expect(past.gear).toHaveLength(0)
    expect(past.quizBest).toBe(0)
  })

  it('teller: alles wat er te halen is', () => {
    const pages = album(data, TODAY)
    const t = albumTotals(pages)
    expect(t.total).toBeGreaterThan(BADGES.length)
    expect(t.have).toBe(pages.reduce((n, p) => n + p.badges.length + p.tricks.length, 0))
  })
})

describe('stickerboek-pagina', () => {
  beforeEach(async () => {
    await db.records.clear()
    await db.kv.clear()
  })
  afterEach(() => cleanup())

  it('per seizoen bladeren; vorig seizoen met je eerste ollie', async () => {
    const user = userEvent.setup()
    await create('session', { ...EMPTY_DRAFT, date: '2025-01-12', hours: 5 })
    await create('trick', { trickId: 'ollie', status: 'geland', firstLandedAt: '2025-01-12', mediaIds: [] })
    render(
      <MemoryRouter>
        <StickerBook />
      </MemoryRouter>,
    )
    const seasons = await screen.findByRole('group', { name: 'Seizoen' })
    const now = within(seasons).getAllByRole('button')[0]
    expect(now.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/Deze pagina is nog leeg/)).toBeTruthy()
    await user.click(within(seasons).getByRole('button', { name: '24/25' }))
    const page = screen.getByRole('group', { name: 'Seizoen 24/25' })
    expect(within(page).getByText('1 dag · 5 uur', { exact: false })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^Lift-off/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ollie' }).getAttribute('href')).toBe('/tricks/ollie')
    expect(screen.getByText(/van \d+ stickers verzameld/)).toBeTruthy()
  })

  it('een pagina delen als story; een lege pagina heeft geen knop', async () => {
    const user = userEvent.setup()
    share.renderAlbumCard.mockReset().mockResolvedValue(new Blob(['png']))
    share.shareImage.mockReset().mockResolvedValue(undefined)
    await create('session', { ...EMPTY_DRAFT, date: '2025-01-12', hours: 5 })
    await create('trick', { trickId: 'ollie', status: 'geland', firstLandedAt: '2025-01-12', mediaIds: [] })
    render(
      <MemoryRouter>
        <StickerBook />
      </MemoryRouter>,
    )
    const seasons = await screen.findByRole('group', { name: 'Seizoen' })
    expect(screen.queryByRole('button', { name: 'Deel als story' })).toBeNull()
    await user.click(within(seasons).getByRole('button', { name: '24/25' }))
    await user.click(screen.getByRole('button', { name: 'Deel als story' }))
    await waitFor(() => expect(share.shareImage).toHaveBeenCalled())
    const [page, totals] = share.renderAlbumCard.mock.calls[0]
    expect(page.season).toBe('24/25')
    expect(page.tricks.map((t: { id: string }) => t.id)).toEqual(['ollie'])
    expect(totals.total).toBeGreaterThan(totals.have)
    expect(share.shareImage.mock.calls[0][1]).toBe('stickerboek-24-25.png')
    // en het seizoensboek van die pagina
    expect(screen.getByRole('link', { name: /Seizoensboek 24\/25/ }).getAttribute('href')).toBe('/seizoensboek?seizoen=24%2F25')
  })

  it('delen mislukt: een melding', async () => {
    const user = userEvent.setup()
    toastStore.set([])
    share.renderAlbumCard.mockReset().mockRejectedValue(new Error('Geen canvas'))
    await create('trick', { trickId: 'ollie', status: 'geland', mediaIds: [] })
    render(
      <MemoryRouter>
        <StickerBook />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Deel als story' }))
    await waitFor(() => expect(toastStore.get().at(-1)?.title).toBe('Delen lukte niet'))
  })
})

describe('albumkaart: wat erop past', () => {
  it('max 6 badges en 8 tricks, de rest als "meer"', () => {
    const n = (k: number) => Array.from({ length: k }, (_, i) => ({ id: String(i) }))
    expect(albumCardLayout({ badges: n(9), tricks: n(10) })).toMatchObject({ more: 5 })
    const l = albumCardLayout({ badges: n(2), tricks: n(3) })
    expect([l.badges.length, l.tricks.length, l.more]).toEqual([2, 3, 0])
  })

  it('labels: nieuwe regel als het niet past, stoppen onderaan (de rest telt bij meer)', () => {
    const box = { x: 70, y: 100, right: 1010, bottom: 300, row: 96, gap: 18 }
    const p = placePills([400, 400, 400, 300, 900, 300], box)
    expect(p.map((x) => [x.x, x.y])).toEqual([
      [70, 100],
      [488, 100],
      [70, 196],
      [488, 196],
      [70, 292],
    ])
    // een te breed label krijgt toch een eigen regel in plaats van eindeloos door te schuiven
    expect(placePills([1200], box)).toHaveLength(1)
  })
})
