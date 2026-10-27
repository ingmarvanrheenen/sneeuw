import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const m = vi.hoisted(() => ({
  myCrews: vi.fn(),
  cachedCrews: vi.fn(),
  crewMembers: vi.fn(),
  crewTrips: vi.fn(),
  cachedCrewTrips: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))
vi.mock('../lib/crew', async (orig) => ({
  ...(await orig<typeof import('../lib/crew')>()),
  myCrews: m.myCrews,
  cachedCrews: m.cachedCrews,
  crewMembers: m.crewMembers,
}))
vi.mock('../lib/crewTrips', async (orig) => ({
  ...(await orig<typeof import('../lib/crewTrips')>()),
  crewTrips: m.crewTrips,
  cachedCrewTrips: m.cachedCrewTrips,
}))
// crew-doelen en recap hebben eigen tests; hier alleen of ze getoond worden
vi.mock('../components/CrewGoals', () => ({ CrewGoals: (p: { tripId: string }) => <div data-testid="crewgoals">{p.tripId}</div> }))
vi.mock('../components/TripRecap', () => ({ TripRecap: (p: { tripId: string }) => <div data-testid="recap">{p.tripId}</div> }))
// de groepslijst heeft eigen tests; hier alleen kijken of en hoe hij getoond wordt
vi.mock('../components/GroupList', () => ({
  GroupList: (p: { tripId: string; crewId: string; ready?: boolean }) => (
    <div data-testid="grouplist">{`${p.tripId}|${p.crewId}|${p.ready === false ? 'wacht' : 'klaar'}`}</div>
  ),
}))

import TripDetail from '../pages/TripDetail'
import CrewTripDetail from '../pages/CrewTripDetail'
import Trips from '../pages/Trips'
import { authStore } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db, kvSet } from '../lib/db'
import { create } from '../lib/repo'
import type { User } from '@supabase/supabase-js'

const ME = 'me'
const crew = { id: 'c1', name: 'Shredheads', invite_code: 'ABC123', created_by: ME }
const page = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reizen" element={<Trips />} />
        <Route path="/reizen/crew/:id" element={<CrewTripDetail />} />
        <Route path="/reizen/:id" element={<TripDetail />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  setCurrentUserId(ME)
  authStore.set({ user: { id: ME } as User, ready: true })
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  m.cachedCrews.mockResolvedValue([crew])
  m.myCrews.mockResolvedValue([crew])
  m.crewTrips.mockResolvedValue([])
  m.cachedCrewTrips.mockResolvedValue([])
  m.crewMembers.mockResolvedValue([{ user_id: 'daan', display_name: 'Daan', role: 'owner', stats: {} }])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const newTrip = () =>
  create('trip', { name: 'Wintersport', resortName: 'Val Thorens', startDate: '2027-01-16', endDate: '2027-01-23', packing: [] })

describe('trip delen met je crew', () => {
  it('zonder crew: verwijzing naar de crew-pagina', async () => {
    m.cachedCrews.mockResolvedValue([])
    m.myCrews.mockResolvedValue([])
    const t = await newTrip()
    page(`/reizen/${t.id}`)
    expect(await screen.findByText('Deel deze trip met je crew')).toBeTruthy()
    expect(screen.queryByTestId('grouplist')).toBeNull()
  })

  it('aanzetten deelt de trip en toont de groepslijst (pas bruikbaar na sync)', async () => {
    const user = userEvent.setup()
    const t = await newTrip()
    page(`/reizen/${t.id}`)
    await user.click(await screen.findByRole('switch', { name: /Delen met Shredheads/ }))
    await waitFor(async () => expect((await db.records.get(t.id))?.crewId).toBe('c1'))
    expect((await screen.findByTestId('grouplist')).textContent).toBe(`${t.id}|c1|wacht`)
    expect(screen.getByText(/Je eigen paklijst/)).toBeTruthy()
  })

  it('gesyncte gedeelde trip: groepslijst klaar voor gebruik, uitzetten haalt hem weg', async () => {
    const user = userEvent.setup()
    const t = await newTrip()
    await db.records.update(t.id, { crewId: 'c1', dirty: 0 })
    page(`/reizen/${t.id}`)
    expect((await screen.findByTestId('grouplist')).textContent).toBe(`${t.id}|c1|klaar`)
    await user.click(screen.getByRole('switch', { name: /Delen met Shredheads/ }))
    await waitFor(() => expect(screen.queryByTestId('grouplist')).toBeNull())
    expect((await db.records.get(t.id))?.crewId).toBeNull()
  })
})

describe('groepslijst blijft bruikbaar', () => {
  it('ook als je iets op je eigen paklijst afvinkt (trip heeft dan lokale wijzigingen)', async () => {
    const user = userEvent.setup()
    const t = await create('trip', {
      name: 'Wintersport',
      packing: [{ id: 'p1', label: 'Helm', category: 'Op de piste', checked: false }],
    })
    await db.records.update(t.id, { crewId: 'c1', dirty: 0 })
    // zoals de sync dat na een geslaagde push vastlegt
    await kvSet(`tripCrew:${t.id}`, 'c1')
    page(`/reizen/${t.id}`)
    expect((await screen.findByTestId('grouplist')).textContent).toBe(`${t.id}|c1|klaar`)
    await user.click(screen.getByRole('checkbox', { name: /Helm/ }))
    await waitFor(async () => expect((await db.records.get(t.id))?.dirty).toBe(1))
    expect(screen.getByTestId('grouplist').textContent).toBe(`${t.id}|c1|klaar`)
  })
})

describe('crew-doelen en recap op de trippagina', () => {
  it('gedeelde trip: crew-doelen altijd, recap pas als de trip begonnen is', async () => {
    const t = await create('trip', { name: 'Toekomst', startDate: '2099-01-01', packing: [] })
    await db.records.update(t.id, { crewId: 'c1', dirty: 0 })
    page(`/reizen/${t.id}`)
    expect(await screen.findByTestId('crewgoals')).toBeTruthy()
    expect(screen.queryByTestId('recap')).toBeNull()
  })

  it('begonnen trip: recap staat erbij', async () => {
    const t = await create('trip', { name: 'Nu', startDate: '2020-01-01', endDate: '2020-01-08', packing: [] })
    await db.records.update(t.id, { crewId: 'c1', dirty: 0 })
    page(`/reizen/${t.id}`)
    expect(await screen.findByTestId('recap')).toBeTruthy()
  })

  it('niet gedeeld: geen crew-doelen of recap', async () => {
    const t = await create('trip', { name: 'Solo', startDate: '2020-01-01', packing: [] })
    page(`/reizen/${t.id}`)
    await screen.findByText(/Delen met Shredheads/)
    expect(screen.queryByTestId('crewgoals')).toBeNull()
    expect(screen.queryByTestId('recap')).toBeNull()
  })

  it('crew-trip van een maat: doelen en (als begonnen) recap', async () => {
    m.crewTrips.mockResolvedValue([
      { id: 't8', ownerId: 'daan', crewId: 'c1', trip: { name: 'Bezig', startDate: '2020-01-01', packing: [] } },
    ])
    page('/reizen/crew/t8')
    expect(await screen.findByTestId('crewgoals')).toBeTruthy()
    expect(screen.getByTestId('recap')).toBeTruthy()
  })
})

describe('trips van je crew', () => {
  const shared = {
    id: 't9',
    ownerId: 'daan',
    crewId: 'c1',
    trip: { name: 'Crew Tignes', resortName: 'Tignes', startDate: '2099-02-01', endDate: '2099-02-08', packing: [] },
  }

  it('staan onder "Van je crew" op de trips-pagina', async () => {
    m.crewTrips.mockResolvedValue([shared])
    page('/reizen')
    expect(await screen.findByText('Van je crew')).toBeTruthy()
    expect(screen.getByText('Crew Tignes')).toBeTruthy()
    // geen "nog geen trip"-leegte als je wel crew-trips hebt
    expect(screen.queryByText('Nog geen trip')).toBeNull()
  })

  it('eigen pagina met eigenaar en groepslijst', async () => {
    m.crewTrips.mockResolvedValue([shared])
    page('/reizen/crew/t9')
    // titel staat groot en in de compacte balk
    expect((await screen.findAllByText('Crew Tignes')).length).toBeGreaterThan(0)
    expect(await screen.findByText(/Tignes · van Daan/)).toBeTruthy()
    expect(screen.getByTestId('grouplist').textContent).toBe('t9|c1|klaar')
  })

  it('niet (meer) gedeeld: nette melding', async () => {
    page('/reizen/crew/weg')
    expect(await screen.findByText('Trip niet gevonden')).toBeTruthy()
  })
})
