// Coach op de trip: het plan (server-check, dagen van de trip, bewaren bij de trip), de avondterugblik met het
// plan erbij, en het onderdeel op de trippagina en Home. Netwerk is gemockt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), getAccessToken: async () => 'tok' }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))
vi.mock('../lib/ids', async (orig) => ({ ...(await orig<typeof import('../lib/ids')>()), todayISO: () => '2027-01-17' }))

import { checkTripInput, checkTripPlan, planText, tripPlanSchema, TRIP_MAX_DAYS } from '../../supabase/functions/coach/protocol'
import { askTripPlan, planDay, reviewDay, tripDates, tripText } from '../lib/coach'
import { TripCoach } from '../components/TripCoach'
import Home from '../pages/Home'
import { authStore } from '../lib/auth'
import { create, listKind } from '../lib/repo'
import { db } from '../lib/db'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { User } from '@supabase/supabase-js'
import type { Trip, TripPlan } from '../lib/types'

const day = (n: number) => ({ dag: n, titel: `Dag ${n}`, focus: 'Focus', oefeningen: ['Een', 'Twee'], trickId: 'ollie' })

describe('server: tripplan checken', () => {
  it('input: een trip van 1 tot 14 dagen', () => {
    expect(checkTripInput({ trip: 'Tignes', days: 6, wish: ' carven ' })).toEqual({ trip: 'Tignes', days: 6, wish: 'carven' })
    expect(checkTripInput({ trip: '', days: 3 })).toEqual({ error: 'Geen trip meegestuurd' })
    expect(checkTripInput({ trip: 'x', days: 0 })).toHaveProperty('error')
    expect(checkTripInput({ trip: 'x', days: TRIP_MAX_DAYS + 1 })).toHaveProperty('error')
  })

  it('schema noemt het aantal dagen en alleen tricks uit de bijbel', () => {
    const s = tripPlanSchema(['ollie'], 4) as {
      properties: { dagen: { description: string; items: { properties: { trickId: { anyOf: { enum?: string[] }[] } } } } }
    }
    expect(s.properties.dagen.description).toMatch(/Precies 4 dagen/)
    expect(s.properties.dagen.items.properties.trickId.anyOf[0].enum).toEqual(['ollie'])
  })

  it('plan: precies zoveel dagen, opgeschoond; verzonnen tricks worden null; te weinig is onbruikbaar', () => {
    const raw = { intro: 'Opbouwen', dagen: [day(1), { ...day(2), trickId: 'verzonnen' }, day(3), day(4)] }
    const p = checkTripPlan(raw, ['ollie'], 3)!
    expect(p.dagen.map((d) => d.dag)).toEqual([1, 2, 3])
    expect(p.dagen[1].trickId).toBeNull()
    expect(checkTripPlan({ intro: '', dagen: [day(1)] }, ['ollie'], 2)).toBeNull()
    expect(checkTripPlan({ dagen: [{ ...day(1), oefeningen: [] }] }, [], 1)).toBeNull()
  })

  it('plan als tekst voor de avond: vandaag en morgen', () => {
    expect(planText(day(2), day(3))).toBe(
      'Plan vandaag (dag 2): Dag 2. Focus Oefeningen: Een / Twee\nPlan morgen (dag 3): Dag 3. Focus Oefeningen: Een / Twee',
    )
    expect(planText(day(5), null)).toMatch(/^Plan vandaag/)
  })
})

describe('app: plan maken en gebruiken', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(async () => {
    await db.records.clear()
    await db.kv.clear()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    authStore.set({ user: { id: 'me' } as User, ready: true })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
  const reply = (body: unknown) => fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body })
  const sent = (i = 0) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string)
  const newTrip = (over: Partial<Trip> = {}) =>
    create('trip', {
      name: 'Tignes 2027',
      resortId: 'tignes',
      resortName: 'Tignes',
      startDate: '2027-01-16',
      endDate: '2027-01-18',
      packing: [],
      ...over,
    }) as Promise<Trip>

  it('dagen van de trip: van begin tot eind, max 14; zonder eind één dag', () => {
    expect(tripDates({ startDate: '2027-01-30', endDate: '2027-02-02' })).toEqual(['2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02'])
    expect(tripDates({ startDate: '2027-01-01', endDate: '2027-03-01' })).toHaveLength(14)
    expect(tripDates({ startDate: '2027-01-01' })).toEqual(['2027-01-01'])
    expect(tripDates({})).toEqual([])
  })

  it('plan vragen: trip, dagen en wens gaan mee; het plan komt met datums bij de trip', async () => {
    const t = await newTrip()
    expect(tripText(t)).toMatch(/Tignes/)
    reply({ intro: 'Opbouwen naar je eerste carve', dagen: [day(1), day(2), day(3)] })
    const plan = await askTripPlan(t, 'carven')
    const body = sent()
    expect(body).toMatchObject({ mode: 'tripplan', days: 3, wish: 'carven' })
    expect(body.trip).toMatch(/Van 2027-01-16 tot 2027-01-18/)
    expect(plan.days.map((d) => d.date)).toEqual(['2027-01-16', '2027-01-17', '2027-01-18'])
    const [saved] = await listKind('trip')
    expect(saved.coachPlan?.intro).toBe('Opbouwen naar je eerste carve')
    expect(saved.coachPlan?.wish).toBe('carven')
    expect(planDay(saved, '2027-01-17')?.titel).toBe('Dag 2')
  })

  it('kapot antwoord: duidelijke fout en niks bewaard', async () => {
    const t = await newTrip()
    reply({ intro: '', dagen: [day(1)] })
    await expect(askTripPlan(t)).rejects.toThrow('Coach gaf geen bruikbaar plan terug')
    expect((await listKind('trip'))[0].coachPlan).toBeUndefined()
  })

  it('avondterugblik op een tripdag: het plan van vandaag en morgen gaat mee, met "morgen" terug', async () => {
    const plan: TripPlan = {
      intro: '',
      days: ['2027-01-16', '2027-01-17', '2027-01-18'].map((date, i) => ({
        date,
        titel: `Dag ${i + 1}`,
        focus: 'F',
        oefeningen: ['O'],
        trickId: null,
      })),
      createdAt: 1,
    }
    const t = await newTrip({ coachPlan: plan })
    const s = await create('session', { ...EMPTY_DRAFT, date: '2027-01-17', tripId: t.id, resortName: 'Tignes' })
    reply({ goed: 'g', focus: 'f', oefening: 'o', trickId: null, veiligheid: null, morgen: 'Morgen rustiger' })
    const r = await reviewDay(s)
    expect(sent().plan).toMatch(/Plan vandaag \(dag 2\): Dag 2[\s\S]*Plan morgen \(dag 3\): Dag 3/)
    expect(r.morgen).toBe('Morgen rustiger')
    // zonder plan: geen plan mee en geen morgen
    const other = await create('session', { ...EMPTY_DRAFT, date: '2027-03-01' })
    reply({ goed: 'g', focus: 'f', oefening: 'o', trickId: null, veiligheid: null, morgen: 'x' })
    const r2 = await reviewDay(other)
    expect(sent(1).plan).toBeUndefined()
    expect(r2.morgen).toBeNull()
  })

  it('op de trippagina: knop, dan het plan met vandaag open; op Home de dag van vandaag', async () => {
    const user = userEvent.setup()
    const t = await newTrip()
    const page = () =>
      render(
        <MemoryRouter>
          <Routes>
            <Route path="*" element={<TripCoach trip={t} editable />} />
          </Routes>
        </MemoryRouter>,
      )
    const r = page()
    await user.type(screen.getByLabelText(/Wat wil je deze trip leren/), 'carven')
    reply({
      intro: 'Opbouwen',
      dagen: [day(1), { ...day(2), titel: 'Op je edge', oefeningen: ['Heelside traverse', 'Toeside traverse'] }, day(3)],
    })
    await user.click(screen.getByRole('button', { name: 'Maak een plan' }))
    await waitFor(async () => expect((await listKind('trip'))[0].coachPlan).toBeTruthy())
    r.unmount()

    const [saved] = await listKind('trip')
    await create('session', { ...EMPTY_DRAFT, date: '2027-01-16', tripId: saved.id })
    render(
      <MemoryRouter>
        <TripCoach trip={saved} editable />
      </MemoryRouter>,
    )
    const today = screen.getByRole('button', { name: /Vandaag.*Op je edge/ })
    expect(today.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Heelside traverse')).toBeTruthy()
    expect(await screen.findByText(/gelogd/)).toBeTruthy()
    expect(screen.getByText(/Log je dag, dan krijg je vanavond de terugblik/)).toBeTruthy()
    cleanup()

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    const row = await screen.findByRole('link', { name: /Coach: Op je edge/ })
    expect(row.getAttribute('href')).toBe(`/reizen/${saved.id}`)
  })

  it('crew-trip van een ander: alleen lezen, zonder plan niks', () => {
    const t = { id: 't', name: 'x', packing: [], startDate: '2027-01-16', kind: 'trip' } as unknown as Trip
    const { container } = render(
      <MemoryRouter>
        <TripCoach trip={t} editable={false} />
      </MemoryRouter>,
    )
    expect(container.textContent).toBe('')
    cleanup()
    render(
      <MemoryRouter>
        <TripCoach
          trip={{
            ...t,
            coachPlan: {
              intro: 'Lijn',
              days: [{ date: '2027-01-16', titel: 'Wennen', focus: 'F', oefeningen: ['O'], trickId: null }],
              createdAt: 1,
            },
          }}
          editable={false}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Wennen')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /plan/i })).toBeNull()
  })
})
