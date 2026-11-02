// Trip-toernooi op de trippagina: starten, stemmen per duel en de winnaar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({
  tripDays: vi.fn(),
  tripMedia: vi.fn(),
  crewMembers: vi.fn(),
  loadBracket: vi.fn(),
  startBracket: vi.fn(),
  voteBracket: vi.fn(),
  resetBracket: vi.fn(),
}))
vi.mock('../lib/crewTrips', async (orig) => ({
  ...(await orig<typeof import('../lib/crewTrips')>()),
  tripDays: api.tripDays,
  tripMedia: api.tripMedia,
}))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), crewMembers: api.crewMembers }))
vi.mock('../lib/tournament', async (orig) => ({
  ...(await orig<typeof import('../lib/tournament')>()),
  loadBracket: api.loadBracket,
  startBracket: api.startBracket,
  voteBracket: api.voteBracket,
  resetBracket: api.resetBracket,
}))

import { TripTournament } from '../components/TripTournament'
import { pickEntries } from '../lib/tournament'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'

const clip = (id: string, userId: string) => ({
  id,
  userId,
  kind: 'media' as const,
  type: 'video' as const,
  mime: 'video/mp4',
  thumb: 'data:image/png;base64,AAAA',
  createdAt: 1,
  updatedAt: 1,
})
const clips = [clip('m1', 'daan'), clip('m2', 'sem'), clip('m3', 'me')]
const show = () => render(<TripTournament tripId="t1" crewId="c1" ownerId="me" trip={{ startDate: '2027-01-16', endDate: '2027-01-23' }} />)

beforeEach(async () => {
  await db.kv.clear()
  setCurrentUserId('me')
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  api.tripDays.mockResolvedValue([])
  api.tripMedia.mockResolvedValue(clips)
  api.crewMembers.mockResolvedValue(
    [
      ['me', 'Ingmar'],
      ['daan', 'Daan'],
      ['sem', 'Sem'],
      ['lot', 'Lot'],
    ].map(([user_id, display_name]) => ({ user_id, display_name, role: 'member', stats: {} })),
  )
  api.loadBracket.mockResolvedValue({ bracket: null, votes: [] })
  api.startBracket.mockResolvedValue(undefined)
  api.voteBracket.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const bracket = (entries: string[]) => ({ trip_id: 't1', crew_id: 'c1', entries, created_by: 'daan', created_at: '1' })

describe('trip-toernooi', () => {
  it('nog niet gestart: start met de clips van de trip', async () => {
    const user = userEvent.setup()
    show()
    expect(await screen.findByText(/3 in de bracket/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Start het toernooi/ }))
    expect(api.startBracket).toHaveBeenCalledWith('c1', 't1', pickEntries(clips, 't1'))
  })

  it('te weinig clips: uitleg, geen knop', async () => {
    api.tripMedia.mockResolvedValue([clip('m1', 'daan')])
    show()
    expect(await screen.findByText(/Nog te weinig gedeelde clips/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Start het toernooi/ })).toBeNull()
  })

  it('stemmen in een duel; daarna je stem en de stand', async () => {
    const user = userEvent.setup()
    api.loadBracket.mockResolvedValue({ bracket: bracket(['m1', 'm2', 'm3']), votes: [] })
    show()
    const duel = await screen.findByRole('group', { name: 'Duel: Daan tegen Sem' })
    expect(screen.getByRole('heading', { name: 'Halve finale' })).toBeTruthy()
    api.loadBracket.mockResolvedValue({ bracket: bracket(['m1', 'm2', 'm3']), votes: [{ round: 0, match: 0, voter: 'me', pick: 'm2' }] })
    await user.click(within(duel).getAllByRole('button', { name: 'Deze' })[1])
    expect(api.voteBracket).toHaveBeenCalledWith('t1', 0, 0, 'm2', 'me')
    expect(
      await within(screen.getByRole('group', { name: 'Duel: Daan tegen Sem' })).findByRole('button', { name: /Jouw stem/ }),
    ).toBeTruthy()
    expect(screen.getByText('1 stem')).toBeTruthy()
    // Jij (m3) heeft een bye en staat al in de finale
    expect(screen.getByText(/vrij/)).toBeTruthy()
  })

  it('beslist tot in de finale: de winnaar als poster', async () => {
    api.loadBracket.mockResolvedValue({
      bracket: bracket(['m1', 'm2']),
      votes: [
        { round: 0, match: 0, voter: 'me', pick: 'm1' },
        { round: 0, match: 0, voter: 'sem', pick: 'm1' },
      ],
    })
    show()
    const winner = await screen.findByRole('group', { name: 'Winnaar van het toernooi' })
    expect(within(winner).getByText('Daan')).toBeTruthy()
    expect(screen.queryByRole('group', { name: /Duel/ })).toBeNull()
  })

  it('opnieuw beginnen kan de starter of de trip-eigenaar', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.loadBracket.mockResolvedValue({ bracket: bracket(['m1', 'm2']), votes: [] })
    show()
    await user.click(await screen.findByRole('button', { name: 'Opnieuw' }))
    await waitFor(() => expect(api.resetBracket).toHaveBeenCalledWith('t1'))
  })
})
