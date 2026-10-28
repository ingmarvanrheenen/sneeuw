import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const share = vi.hoisted(() => ({ renderWrappedCard: vi.fn(), shareImage: vi.fn() }))
vi.mock('../lib/shareCard', async (orig) => ({ ...(await orig<typeof import('../lib/shareCard')>()), ...share }))

import Wrapped from '../pages/Wrapped'
import Stats from '../pages/Stats'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { create } from '../lib/repo'
import { EMPTY_DRAFT } from '../lib/sessions'
import { seasonOf } from '../lib/wrapped'
import { todayISO } from '../lib/ids'

const log = (date: string, over = {}) =>
  create('session', { ...EMPTY_DRAFT, date, resortName: 'Tignes', hours: 5, falls: 3, mood: 4, pistes: ['rood'], ...over })

const open = (url: string) =>
  render(
    <MemoryRouter initialEntries={['/stats', url]} initialIndex={1}>
      <Routes>
        <Route path="/wrapped" element={<Wrapped />} />
        <Route path="/stats" element={<div>statspagina</div>} />
        <Route path="/log/nieuw" element={<div>loggen</div>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  setCurrentUserId('me')
  share.renderWrappedCard.mockResolvedValue(new Blob(['png']))
  share.shareImage.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('season wrapped', () => {
  it('kaarten doorlopen: rechts verder, links terug, en aan het eind opnieuw', async () => {
    const user = userEvent.setup()
    await log('2026-12-20', { falls: 9 })
    await log('2026-12-21', { hours: 7, mood: 5, highlight: 'Poederdag' })
    open('/wrapped?seizoen=26/27')
    const story = await screen.findByRole('dialog', { name: 'Season Wrapped 26/27' })
    expect(within(story).getByText('Jouw seizoen')).toBeTruthy()
    expect((within(story).getByRole('button', { name: 'Vorige' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(story).getByRole('button', { name: 'Volgende' }))
    expect(within(story).getByText('uur op de plank')).toBeTruthy()
    expect(within(story).getByText('12')).toBeTruthy()
    await user.click(within(story).getByRole('button', { name: 'Vorige' }))
    expect(within(story).getByText('Jouw seizoen')).toBeTruthy()
    // door naar het eind
    for (let k = 0; k < 12; k++) {
      const next = within(story).getByRole('button', { name: 'Volgende' }) as HTMLButtonElement
      if (next.disabled) break
      await user.click(next)
    }
    expect(within(story).getByText('tot volgend seizoen')).toBeTruthy()
    await user.click(within(story).getByRole('button', { name: /Opnieuw/ }))
    expect(within(story).getByText('Jouw seizoen')).toBeTruthy()
  })

  it('deel deze kaart: maakt een story-afbeelding van precies deze kaart', async () => {
    const user = userEvent.setup()
    await log('2026-12-20')
    open('/wrapped?seizoen=26/27')
    const story = await screen.findByRole('dialog')
    await user.click(within(story).getByRole('button', { name: 'Volgende' }))
    await user.click(within(story).getByRole('button', { name: /Deel deze kaart/ }))
    await waitFor(() => expect(share.shareImage).toHaveBeenCalled())
    const [card, season, index, total] = share.renderWrappedCard.mock.calls[0]
    expect(card).toMatchObject({ id: 'uren' })
    expect([season, index]).toEqual(['26/27', 1])
    expect(total).toBeGreaterThan(3)
    expect(share.shareImage.mock.calls[0][1]).toBe('sneeuw-daddy-wrapped-26-27-uren.png')
  })

  it('sluiten gaat terug waar je vandaan kwam', async () => {
    const user = userEvent.setup()
    await log('2026-12-20')
    open('/wrapped?seizoen=26/27')
    await user.click(await screen.findByRole('button', { name: 'Sluiten' }))
    expect(await screen.findByText('statspagina')).toBeTruthy()
  })

  it('zonder seizoen in de link: het nieuwste seizoen; zonder dagen: uitleg', async () => {
    await log('2025-12-20')
    await log('2026-12-20')
    const { unmount } = open('/wrapped')
    expect(await screen.findByRole('dialog', { name: 'Season Wrapped 26/27' })).toBeTruthy()
    unmount()
    await db.records.clear()
    open('/wrapped')
    expect(await screen.findByText('Nog geen seizoen om terug te kijken')).toBeTruthy()
  })
})

describe('ingangen', () => {
  it('stats: een regel per seizoen', async () => {
    await log('2025-12-20')
    await log('2026-12-20')
    render(
      <MemoryRouter>
        <Stats />
      </MemoryRouter>,
    )
    expect((await screen.findByRole('link', { name: /Season Wrapped 26\/27/ })).getAttribute('href')).toBe('/wrapped?seizoen=26%2F27')
    expect(screen.getByRole('link', { name: /Season Wrapped 25\/26/ })).toBeTruthy()
  })

  it('home: pas vanaf 3 dagen in het huidige seizoen', async () => {
    const { default: Home } = await import('../pages/Home')
    const now = seasonOf(todayISO())
    // drie dagen in augustus van het huidige seizoen: valt altijd in dat seizoen
    const days = ['08-01', '08-02', '08-03'].map((md) => `20${now.slice(0, 2)}-${md}`)
    await log(days[0])
    const home = () =>
      render(
        <MemoryRouter>
          <Home />
        </MemoryRouter>,
      )
    const first = home()
    await screen.findByRole('link', { name: /Trick-roulette/ })
    expect(screen.queryByRole('link', { name: /Season Wrapped/ })).toBeNull()
    first.unmount()
    for (const d of days.slice(1)) await log(d)
    home()
    expect(await screen.findByRole('link', { name: new RegExp(`Season Wrapped ${now.replace('/', '\\/')}`) })).toBeTruthy()
  })
})
