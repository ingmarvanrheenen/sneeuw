import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({
  listGoals: vi.fn(),
  cachedGoals: vi.fn(),
  addGoal: vi.fn(),
  removeGoal: vi.fn(),
  setGoalDone: vi.fn(),
  tripDays: vi.fn(),
  crewMembers: vi.fn(),
  listVotes: vi.fn(),
  cachedVotes: vi.fn(),
  castVote: vi.fn(),
  removeVote: vi.fn(),
}))
vi.mock('../lib/crewTrips', async (orig) => ({ ...(await orig<typeof import('../lib/crewTrips')>()), ...api }))
const push = vi.hoisted(() => ({ notifyCrew: vi.fn() }))
vi.mock('../lib/push', () => push)
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), crewMembers: api.crewMembers }))

import { CrewGoals } from '../components/CrewGoals'
import { TripRecap } from '../components/TripRecap'
import { setCurrentUserId } from '../lib/auth-state'
import { toastStore } from '../lib/toast'
import { db } from '../lib/db'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { Session } from '../lib/types'

const ME = 'me'
const goal = (over: Record<string, unknown>) => ({ crew_id: 'c1', trip_id: 't1', created_by: 'daan', created_at: 'x', done: [], ...over })
const online = (on: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })

beforeEach(async () => {
  await db.kv.clear()
  setCurrentUserId(ME)
  online(true)
  toastStore.set([])
  api.cachedGoals.mockResolvedValue([])
  api.crewMembers.mockResolvedValue([
    { user_id: ME, display_name: 'Ingmar', role: 'owner', stats: {} },
    { user_id: 'daan', display_name: 'Daan', role: 'member', stats: {} },
    { user_id: 'sem', display_name: 'Sem', role: 'member', stats: {} },
  ])
  api.listGoals.mockResolvedValue([
    goal({ id: 'g1', title: 'Iedereen een rode piste', done: ['daan', 'sem'] }),
    goal({ id: 'g2', title: 'Samen de eerste lift', created_by: ME }),
  ])
  api.setGoalDone.mockResolvedValue(undefined)
  api.listVotes.mockResolvedValue([])
  api.cachedVotes.mockResolvedValue([])
  api.castVote.mockResolvedValue(undefined)
  api.removeVote.mockResolvedValue(undefined)
  api.removeGoal.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const row = (title: string) => screen.getByText(title).closest('div.flex') as HTMLElement
/** wacht tot de lijst van de server binnen is (niet de cache of een suggestie-chip) */
const loaded = () => screen.findByText('0/3 gehaald')
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('crew-doelen', () => {
  it('laat per doel zien hoeveel van de crew het gehaald hebben en wie', async () => {
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    expect(await screen.findByText('2/3 gehaald · Daan, Sem')).toBeTruthy()
    expect(screen.getByText('0/3 gehaald')).toBeTruthy()
  })

  it('afvinken voor jezelf; als laatste van de crew wordt het gevierd', async () => {
    const user = userEvent.setup()
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    await user.click(within(row('Iedereen een rode piste')).getByRole('checkbox'))
    expect(api.setGoalDone).toHaveBeenCalledWith('g1', true)
    expect(screen.getByText('3/3 gehaald · Daan, Sem')).toBeTruthy()
    await waitFor(() => expect(toastStore.get().some((t) => t.title === 'Crew-doel gehaald')).toBe(true))
  })

  it('afvinken geeft de crew een seintje, uitvinken niet', async () => {
    const user = userEvent.setup()
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    await user.click(within(row('Samen de eerste lift')).getByRole('checkbox'))
    await waitFor(() => expect(push.notifyCrew).toHaveBeenCalledWith('goal', 'g2'))
    push.notifyCrew.mockClear()
    await user.click(within(row('Samen de eerste lift')).getByRole('checkbox'))
    await waitFor(() => expect(api.setGoalDone).toHaveBeenCalledWith('g2', false))
    expect(push.notifyCrew).not.toHaveBeenCalled()
  })

  it('niet de laatste: geen feestje', async () => {
    const user = userEvent.setup()
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    await user.click(within(row('Samen de eerste lift')).getByRole('checkbox'))
    await waitFor(() => expect(api.setGoalDone).toHaveBeenCalledWith('g2', true))
    expect(toastStore.get().some((t) => t.title === 'Crew-doel gehaald')).toBe(false)
  })

  it('verwijderen alleen bij je eigen doel of als trip-eigenaar', async () => {
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    expect(screen.getByRole('button', { name: 'Samen de eerste lift verwijderen' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Iedereen een rode piste verwijderen' })).toBeNull()
  })

  it('doel toevoegen met een suggestie', async () => {
    const user = userEvent.setup()
    api.addGoal.mockResolvedValue(goal({ id: 'g3', title: 'Iedereen een carve', created_by: ME }))
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    // al bestaande doelen worden niet nog eens voorgesteld
    expect(screen.queryByRole('button', { name: /^Iedereen een rode piste$/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Iedereen een carve/ }))
    expect(api.addGoal).toHaveBeenCalledWith('c1', 't1', 'Iedereen een carve')
    expect(await screen.findByText('Iedereen een carve')).toBeTruthy()
  })

  it('mislukt opslaan: melding en opnieuw laden', async () => {
    const user = userEvent.setup()
    api.setGoalDone.mockRejectedValue({ message: 'nope' })
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    await user.click(within(row('Samen de eerste lift')).getByRole('checkbox'))
    await waitFor(() => expect(toastStore.get().some((t) => t.title === 'Niet opgeslagen')).toBe(true))
    await waitFor(() => expect(api.listGoals).toHaveBeenCalledTimes(2))
  })

  it('lege cache: geen suggesties tonen voor doelen die de server al heeft', async () => {
    const list = deferred<unknown[]>()
    api.listGoals.mockReturnValue(list.promise)
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    await waitFor(() => expect(api.cachedGoals).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('button', { name: /^Iedereen een rode piste$/ })).toBeNull()
    list.resolve([goal({ id: 'g1', title: 'Iedereen een rode piste' })])
    expect(await screen.findByText('0/3 gehaald')).toBeTruthy()
  })

  it('een trage refresh overschrijft je net gezette vinkje niet', async () => {
    const user = userEvent.setup()
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    // de volgende refresh (terug in de app) komt pas binnen na je klik, met de oude stand
    const slow = deferred<unknown[]>()
    api.listGoals.mockReturnValue(slow.promise)
    document.dispatchEvent(new Event('visibilitychange'))
    await user.click(within(row('Samen de eerste lift')).getByRole('checkbox'))
    slow.resolve([
      goal({ id: 'g1', title: 'Iedereen een rode piste', done: ['daan', 'sem'] }),
      goal({ id: 'g2', title: 'Samen de eerste lift', created_by: ME }),
    ])
    await new Promise((r) => setTimeout(r, 10))
    expect(within(row('Samen de eerste lift')).getByRole('checkbox').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('1/3 gehaald')).toBeTruthy()
  })

  it('ververst elke halve minuut zolang je kijkt: je ziet het vinkje van je maat', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] })
    try {
      render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
      await loaded()
      api.listGoals.mockResolvedValue([
        goal({ id: 'g1', title: 'Iedereen een rode piste', done: ['daan', 'sem'] }),
        goal({ id: 'g2', title: 'Samen de eerste lift', created_by: ME, done: ['sem'] }),
      ])
      vi.advanceTimersByTime(30_000)
      expect(await screen.findByText('1/3 gehaald · Sem')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('offline: laatst bekende doelen, niks bewerken', async () => {
    online(false)
    api.cachedGoals.mockResolvedValue([goal({ id: 'g1', title: 'Iedereen een rode piste' })])
    render(<CrewGoals tripId="t1" crewId="c1" ownerId="daan" />)
    expect(await screen.findByText('Iedereen een rode piste')).toBeTruthy()
    expect(api.listGoals).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText(/iedereen een rode piste/i)).toBeNull()
  })
})

const shared = (user_id: string, date: string, over: Partial<Session>) => ({
  user_id,
  data: { ...EMPTY_DRAFT, id: user_id + date, kind: 'session', createdAt: 0, updatedAt: 0, date, ...over } as Session,
})

describe('trip-recap', () => {
  const recap = () =>
    render(
      <MemoryRouter>
        <TripRecap tripId="t1" crewId="c1" trip={{ startDate: '2027-01-16', endDate: '2027-01-23' }} />
      </MemoryRouter>,
    )
  const award = (title: string) => screen.getByText(title).closest('div.flex') as HTMLElement

  it('totalen, awards en per persoon (met "Jij")', async () => {
    api.tripDays.mockResolvedValue([
      shared(ME, '2027-01-16', { hours: 6, falls: 1, landed: ['ollie'] }),
      shared('daan', '2027-01-16', { hours: 4, falls: 7, landed: [] }),
    ])
    recap()
    expect(await screen.findByRole('heading', { name: 'Awards' })).toBeTruthy()
    expect(within(award('Langst op de plank')).getByText('Jij')).toBeTruthy()
    expect(within(award('Langst op de plank')).getByText('6 u')).toBeTruthy()
    expect(within(award('Valkampioen')).getByText('Daan')).toBeTruthy()
    expect(within(award('Valkampioen')).getByText('7x')).toBeTruthy()
    expect(within(award('Trickmachine')).getByText('Jij')).toBeTruthy()
    expect(screen.getByText('1 dag · 1 trick geland')).toBeTruthy()
    expect(screen.getByText(/Geland deze trip: Ollie/)).toBeTruthy()
  })

  it('uren met een komma, zoals in de rest van de app', async () => {
    api.tripDays.mockResolvedValue([shared(ME, '2027-01-16', { hours: 5.5 }), shared('daan', '2027-01-16', { hours: 4 })])
    recap()
    expect(await screen.findByText('5,5 u · 0 val')).toBeTruthy()
    expect(screen.getByText('9,5')).toBeTruthy()
  })

  it('een persoon opent zijn skipas (jij: je eigen)', async () => {
    api.tripDays.mockResolvedValue([shared(ME, '2027-01-16', { hours: 6 }), shared('daan', '2027-01-16', { hours: 4 })])
    recap()
    expect((await screen.findByRole('link', { name: /^Daan/ })).getAttribute('href')).toBe('/rider/daan')
    expect(screen.getByRole('link', { name: /^Jij/ }).getAttribute('href')).toBe('/rider/ik')
  })

  describe('stemronde', () => {
    beforeEach(() => {
      api.tripDays.mockResolvedValue([shared(ME, '2027-01-16', { hours: 6 }), shared('daan', '2027-01-16', { hours: 4 })])
    })

    it('stand pas zichtbaar na je eigen stem; jezelf staat er niet tussen', async () => {
      const user = userEvent.setup()
      api.listVotes.mockResolvedValue([{ category: 'val', voter: 'sem', candidate: 'daan' }])
      recap()
      const row = await screen.findByRole('button', { name: /Val van de trip/ })
      expect(within(row).getByText('Nog niet gestemd')).toBeTruthy()
      await user.click(row)
      const sheet = screen.getByRole('dialog', { name: 'Val van de trip' })
      expect(within(sheet).queryByRole('button', { name: /Ingmar/ })).toBeNull()
      expect(within(sheet).getByText('De stand zie je zodra je zelf gestemd hebt.')).toBeTruthy()
      // stemmen op Daan
      api.listVotes.mockResolvedValue([
        { category: 'val', voter: 'sem', candidate: 'daan' },
        { category: 'val', voter: ME, candidate: 'daan' },
      ])
      await user.click(within(sheet).getByRole('button', { name: /Daan/ }))
      expect(api.castVote).toHaveBeenCalledWith('c1', 't1', 'val', 'daan', false)
      expect(await within(sheet).findByText('Je stemde op Daan.')).toBeTruthy()
      expect(within(within(sheet).getByRole('button', { name: /Daan/ })).getByText('2')).toBeTruthy()
      await user.click(within(sheet).getByRole('button', { name: 'Klaar' }))
      expect(within(screen.getByRole('button', { name: /Val van de trip/ })).getByText('Daan staat bovenaan')).toBeTruthy()
    })

    it('omzetten en intrekken', async () => {
      const user = userEvent.setup()
      api.listVotes.mockResolvedValue([{ category: 'held', voter: ME, candidate: 'daan' }])
      recap()
      await user.click(await screen.findByRole('button', { name: /Held van de trip/ }))
      const sheet = screen.getByRole('dialog', { name: 'Held van de trip' })
      api.listVotes.mockResolvedValue([{ category: 'held', voter: ME, candidate: 'sem' }])
      await user.click(within(sheet).getByRole('button', { name: /Sem/ }))
      expect(api.castVote).toHaveBeenCalledWith('c1', 't1', 'held', 'sem', true)
      await waitFor(() => expect(within(sheet).getByText('Je stemde op Sem.')).toBeTruthy())
      await user.click(within(sheet).getByRole('button', { name: /Sem/ }))
      expect(api.removeVote).toHaveBeenCalledWith('t1', 'held')
    })
  })

  it('nog geen gedeelde dagen: uitleg hoe je hem vult', async () => {
    api.tripDays.mockResolvedValue([])
    render(
      <MemoryRouter>
        <TripRecap tripId="t1" crewId="c1" trip={{ startDate: '2027-01-16' }} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Nog geen gedeelde dagen/)).toBeTruthy()
  })

  it('offline: de laatst berekende recap', async () => {
    api.tripDays.mockResolvedValue([shared(ME, '2027-01-16', { hours: 3 })])
    const { unmount } = render(
      <MemoryRouter>
        <TripRecap tripId="t1" crewId="c1" trip={{ startDate: '2027-01-16' }} />
      </MemoryRouter>,
    )
    await screen.findByText('Jij')
    unmount()
    online(false)
    render(
      <MemoryRouter>
        <TripRecap tripId="t1" crewId="c1" trip={{ startDate: '2027-01-16' }} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Jij')).toBeTruthy()
    expect(api.tripDays).toHaveBeenCalledTimes(1)
  })
})
