// Runs in de trip-recap: de teller (met GPS) gaat mee in je dag, de recap telt runs, topsnelheid en
// hoogtemeters per rider, met een crew-ranglijst en twee awards. Netwerk van de crew is gemockt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({
  tripDays: vi.fn(),
  tripMedia: vi.fn(),
  crewMembers: vi.fn(),
  listVotes: vi.fn(),
  cachedVotes: vi.fn(),
}))
vi.mock('../lib/crewTrips', async (orig) => ({ ...(await orig<typeof import('../lib/crewTrips')>()), ...api }))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), crewMembers: api.crewMembers }))

import { TripRecap } from '../components/TripRecap'
import { computeRecap, ranking } from '../lib/crewTrips'
import { crewAwards } from '../lib/awards'
import { dayTotals, resetRunDay, runsForDay, setRunGps, startRun, stopRun } from '../lib/runs'
import { emptyGps } from '../lib/runGps'
import { EMPTY_DRAFT, smartDraft } from '../lib/sessions'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import type { Session } from '../lib/types'

const ME = 'me'
const shared = (user_id: string, date: string, over: Partial<Session> = {}) => ({
  user_id,
  data: { ...EMPTY_DRAFT, id: user_id + date, kind: 'session', createdAt: 0, updatedAt: 0, date, hours: 5, ...over } as Session,
})
const names = { [ME]: 'Ingmar', daan: 'Daan', sem: 'Sem' }

beforeEach(async () => {
  await db.kv.clear()
  await db.records.clear()
  setCurrentUserId(ME)
})
afterEach(() => cleanup())

describe('de teller in je dag', () => {
  const D = '2027-01-16'
  const t0 = new Date('2027-01-16T09:00:00').getTime()
  const g = (top: number, drop: number) => ({ ...emptyGps(), top, drop, dist: 1000, fixes: 30 })

  it('runs, en met GPS de hoogste topsnelheid en de hoogtemeters bij elkaar', async () => {
    await startRun(t0, D)
    await setRunGps(t0, g(48.4, 300), D)
    await stopRun(t0 + 6 * 60_000, D)
    await startRun(t0 + 20 * 60_000, D)
    await setRunGps(t0 + 20 * 60_000, g(61.6, 410), D)
    await stopRun(t0 + 26 * 60_000, D)
    await startRun(t0 + 40 * 60_000, D)
    const day = await stopRun(t0 + 45 * 60_000, D)
    expect(dayTotals(day)).toEqual({ runs: 3, topSpeed: 62, vert: 710 })
    expect(await runsForDay(D)).toMatchObject({ runs: 3, topSpeed: 62, vert: 710 })
    const draft = await smartDraft(D)
    expect(draft).toMatchObject({ runs: 3, topSpeed: 62, vert: 710 })
  })

  it('zonder GPS alleen runs', async () => {
    await resetRunDay(D)
    await startRun(t0, D)
    const day = await stopRun(t0 + 5 * 60_000, D)
    expect(dayTotals(day)).toEqual({ runs: 1 })
    const draft = await smartDraft(D)
    expect(draft.topSpeed).toBeUndefined()
    expect(draft.vert).toBeUndefined()
  })
})

describe('recap en ranglijst', () => {
  const days = [
    shared(ME, '2027-01-16', { runs: 12, topSpeed: 55, vert: 2100 }),
    shared(ME, '2027-01-17', { runs: 9, topSpeed: 61, vert: 1800 }),
    shared('daan', '2027-01-16', { runs: 21, topSpeed: 48, vert: 3500 }),
    shared('sem', '2027-01-16', { runs: 0 }),
  ]

  it('per rider: runs en hoogtemeters opgeteld, de hoogste topsnelheid', () => {
    const r = computeRecap(days, names)
    expect(r.runs).toBe(42)
    const me = r.people.find((p) => p.userId === ME)!
    expect(me).toMatchObject({ runs: 21, topSpeed: 61, vert: 3900 })
    expect(r.people.find((p) => p.userId === 'sem')).toMatchObject({ runs: 0, topSpeed: 0, vert: 0 })
  })

  it('ranglijst: hoogste eerst, wie niets telde staat er niet in, gelijk = zelfde plaats', () => {
    const r = computeRecap(days, names)
    const runs = ranking(r.people, 'runs')
    expect(runs.map((x) => [x.place, x.person.name, x.value])).toEqual([
      [1, 'Daan', 21],
      [1, 'Ingmar', 21],
    ])
    expect(ranking(r.people, 'topSpeed').map((x) => [x.place, x.person.userId])).toEqual([
      [1, ME],
      [2, 'daan'],
    ])
    expect(ranking(r.people, 'vert').map((x) => x.value)).toEqual([3900, 3500])
  })

  it('awards: Runmachine en Snelste van de crew, alleen tussen wie telde', () => {
    const a = crewAwards([
      shared(ME, '2027-01-16', { runs: 14, topSpeed: 61 }),
      shared('daan', '2027-01-16', { runs: 21, topSpeed: 48 }),
      shared('sem', '2027-01-16'),
    ])
    expect(a.find((x) => x.id === 'runs')).toMatchObject({ userIds: ['daan'], value: '21 runs' })
    expect(a.find((x) => x.id === 'snelst')).toMatchObject({ userIds: [ME], value: '61 km/u' })
    // maar één met GPS: geen wedstrijd, dus geen award
    const solo = crewAwards([shared(ME, '2027-01-16', { runs: 10, topSpeed: 61 }), shared('daan', '2027-01-16')])
    expect(solo.find((x) => x.id === 'snelst')).toBeUndefined()
    expect(solo.find((x) => x.id === 'runs')).toBeUndefined()
  })
})

describe('trip-recap op de pagina', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    api.crewMembers.mockResolvedValue([
      { user_id: ME, display_name: 'Ingmar', role: 'owner', stats: {} },
      { user_id: 'daan', display_name: 'Daan', role: 'member', stats: {} },
      { user_id: 'sem', display_name: 'Sem', role: 'member', stats: {} },
    ])
    api.tripMedia.mockResolvedValue([])
    api.listVotes.mockResolvedValue([])
    api.cachedVotes.mockResolvedValue([])
  })
  const recap = () =>
    render(
      <MemoryRouter>
        <TripRecap tripId="t1" crewId="c1" trip={{ startDate: '2027-01-16', endDate: '2027-01-23' }} />
      </MemoryRouter>,
    )

  it('ranglijst met runs, wisselen naar topsnelheid en hoogtemeters, en wie niet telde', async () => {
    const user = userEvent.setup()
    api.tripDays.mockResolvedValue([
      shared(ME, '2027-01-16', { runs: 14, topSpeed: 61, vert: 2100 }),
      shared('daan', '2027-01-16', { runs: 21 }),
      shared('sem', '2027-01-16'),
    ])
    recap()
    expect(await screen.findByText('Ranglijst')).toBeTruthy()
    expect(screen.getByText('Samen 35 runs op de teller.')).toBeTruthy()
    expect(screen.getByLabelText('1. Daan: 21 runs')).toBeTruthy()
    expect(screen.getByLabelText('2. Jij: 14 runs')).toBeTruthy()
    expect(screen.getByText('1 rider telde geen runs.')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Topsnelheid' }))
    expect(screen.getByLabelText('1. Jij: 61 km/u')).toBeTruthy()
    expect(screen.getByText('2 riders telden niet met GPS.')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Hoogtemeters' }))
    expect(screen.getByLabelText(/1\. Jij: 2.100 m/)).toBeTruthy()
    // awards en per rider
    expect(screen.getByText('Runmachine')).toBeTruthy()
    expect(within(screen.getByRole('link', { name: /Daan/ })).getByText(/1 dag · 0 tricks geland · 21 runs/)).toBeTruthy()
  })

  it('niemand telde runs: geen ranglijst', async () => {
    api.tripDays.mockResolvedValue([shared(ME, '2027-01-16'), shared('daan', '2027-01-16')])
    recap()
    expect(await screen.findByText('Per rider')).toBeTruthy()
    expect(screen.queryByText('Ranglijst')).toBeNull()
    expect(screen.queryByText(/op de teller/)).toBeNull()
  })

  it('alleen runs, geen GPS: geen keuze, gewoon de lijst', async () => {
    api.tripDays.mockResolvedValue([shared(ME, '2027-01-16', { runs: 8 }), shared('daan', '2027-01-16', { runs: 8 })])
    recap()
    expect(await screen.findByText('Ranglijst')).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Topsnelheid' })).toBeNull()
    expect(screen.getByLabelText('1. Daan: 8 runs')).toBeTruthy()
    expect(screen.getByLabelText('1. Jij: 8 runs')).toBeTruthy()
  })
})

describe('enkelvoud in de awards', () => {
  it('1 trick, niet 1 tricks', () => {
    const a = crewAwards([shared(ME, '2027-01-16', { runs: 1, landed: ['ollie'] }), shared('daan', '2027-01-16', { runs: 0 })])
    expect(a.find((x) => x.id === 'tricks')?.value).toBe('1 trick')
  })
})
