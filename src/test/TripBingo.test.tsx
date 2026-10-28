import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({ listTicks: vi.fn(), cachedTicks: vi.fn(), setTick: vi.fn(), crewMembers: vi.fn() }))
vi.mock('../lib/bingo', async (orig) => ({
  ...(await orig<typeof import('../lib/bingo')>()),
  listTicks: api.listTicks,
  cachedTicks: api.cachedTicks,
  setTick: api.setTick,
}))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), crewMembers: api.crewMembers }))

import { TripBingo } from '../components/TripBingo'
import { bingoCard, type BingoTick } from '../lib/bingo'
import { setCurrentUserId } from '../lib/auth-state'
import { toastStore } from '../lib/toast'

const ME = 'me'
const tick = (user_id: string, square: string, minute = 0): BingoTick => ({
  user_id,
  square,
  created_at: new Date(Date.UTC(2027, 0, 16, 10, minute)).toISOString(),
})
const myCard = bingoCard('t1', ME)
const daanCard = bingoCard('t1', 'daan')
const toasts = () => toastStore.get().map((t) => t.title)
const show = () => render(<TripBingo tripId="t1" crewId="c1" />)
const mine = () => screen.getByRole('group', { name: 'Jouw bingokaart' })

beforeEach(() => {
  setCurrentUserId(ME)
  toastStore.set([])
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  api.cachedTicks.mockResolvedValue([])
  api.listTicks.mockResolvedValue([])
  api.setTick.mockResolvedValue(undefined)
  api.crewMembers.mockResolvedValue([
    { user_id: ME, display_name: 'Ingmar', role: 'owner', stats: {} },
    { user_id: 'daan', display_name: 'Daan', role: 'member', stats: {} },
  ])
})
afterEach(() => cleanup())

describe('trip-bingo', () => {
  it('jouw kaart: 16 vakjes; afvinken slaat op en telt mee', async () => {
    const user = userEvent.setup()
    show()
    expect(within(mine()).getAllByRole('button')).toHaveLength(16)
    const sq = within(mine()).getByRole('button', { name: myCard[5].text })
    expect(sq.getAttribute('aria-pressed')).toBe('false')
    await user.click(sq)
    expect(sq.getAttribute('aria-pressed')).toBe('true')
    expect(api.setTick).toHaveBeenCalledWith('c1', 't1', myCard[5].id, true, ME)
    expect(screen.getByText(/^1 van 16 afgevinkt/)).toBeTruthy()
    // nog een keer: uitvinken
    await user.click(sq)
    expect(api.setTick).toHaveBeenLastCalledWith('c1', 't1', myCard[5].id, false, ME)
  })

  it('het vierde vakje van een rij: bingo, en jij was de eerste', async () => {
    const user = userEvent.setup()
    api.listTicks.mockResolvedValue(myCard.slice(0, 3).map((s, i) => tick(ME, s.id, i)))
    show()
    await waitFor(() => expect(screen.getByText(/^3 van 16 afgevinkt/)).toBeTruthy())
    await user.click(within(mine()).getByRole('button', { name: myCard[3].text }))
    expect(toasts()).toContain('Bingo!')
    expect(screen.getByText(/^4 van 16 afgevinkt · bingo/)).toBeTruthy()
    expect(screen.getByText('Jij had als eerste bingo.')).toBeTruthy()
  })

  it('stand van de crew: wie als eerste bingo had, en de kaart van een maat bekijken (niet afvinken)', async () => {
    const user = userEvent.setup()
    api.listTicks.mockResolvedValue([0, 4, 8, 12].map((i, k) => tick('daan', daanCard[i].id, k)))
    show()
    expect(await screen.findByText('Daan had als eerste bingo.')).toBeTruthy()
    const row = screen.getByRole('button', { name: /Daan/ })
    expect(within(row).getByText('4/16')).toBeTruthy()
    expect(within(row).getByText('Bingo')).toBeTruthy()
    await user.click(row)
    const sheet = screen.getByRole('dialog', { name: 'Kaart van Daan' })
    const card = within(sheet).getByRole('group', { name: 'Bingokaart van Daan' })
    const sq = within(card).getByRole('button', { name: daanCard[0].text }) as HTMLButtonElement
    expect(sq.getAttribute('aria-pressed')).toBe('true')
    expect(sq.disabled).toBe(true)
  })

  it('opslaan mislukt: melding, en de stand van de server komt terug', async () => {
    const user = userEvent.setup()
    api.setTick.mockRejectedValue(new Error('offline'))
    show()
    await user.click(within(mine()).getByRole('button', { name: myCard[0].text }))
    await waitFor(() => expect(toasts()).toContain('Niet opgeslagen'))
    await waitFor(() => expect(within(mine()).getByRole('button', { name: myCard[0].text }).getAttribute('aria-pressed')).toBe('false'))
  })

  it('offline: de laatst bekende vinkjes', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    api.cachedTicks.mockResolvedValue([tick(ME, myCard[2].id)])
    show()
    await waitFor(() => expect(within(mine()).getByRole('button', { name: myCard[2].text }).getAttribute('aria-pressed')).toBe('true'))
    expect(api.listTicks).not.toHaveBeenCalled()
  })
})
