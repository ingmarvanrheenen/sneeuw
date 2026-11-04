// Potje, meer: CHF met een vaste koers per trip, niet gelijk verdelen (delen per persoon) en een bonnetje.
// De server is nagedaan (fakeSupabase); de database-regels zelf staan in supabase/tests/crew_trip_expenses_more.sh.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { fakeSupabase } from './fakeSupabase'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true, backendInfo: {} }
})
const crew = vi.hoisted(() => ({ crewMembers: vi.fn() }))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), crewMembers: crew.crewMembers }))
const media = vi.hoisted(() => ({ addMediaFiles: vi.fn() }))
vi.mock('../lib/media', async (orig) => ({ ...(await orig<typeof import('../lib/media')>()), addMediaFiles: media.addMediaFiles }))

import { TripPot } from '../components/TripPot'
import { addExpense, balances, fmtChf, parseRate, shares, toEuro, totals, tripRate, type Expense } from '../lib/pot'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import type { MediaMeta } from '../lib/types'

const fake = () => sb.ref!
let rows: Expense[] = []
let n = 0
const exp = (over: Partial<Expense>): Expense => ({
  id: `e${++n}`,
  trip_id: 't1',
  crew_id: 'c1',
  kind: 'expense',
  title: 'X',
  amount_cents: 1000,
  paid_by: 'me',
  split_between: ['me', 'daan'],
  spent_on: null,
  created_by: 'me',
  created_at: `2027-01-1${n}T10:00:00Z`,
  ...over,
})

beforeEach(async () => {
  await db.kv.clear()
  await db.records.clear()
  setCurrentUserId('me')
  fake().calls.length = 0
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  rows = []
  crew.crewMembers.mockResolvedValue(
    [
      ['me', 'Ingmar'],
      ['daan', 'Daan'],
    ].map(([user_id, display_name]) => ({ user_id, display_name, role: 'member', stats: {} })),
  )
  fake().respond((c) => {
    if (c.table === 'records') return { data: null }
    if (c.table !== 'crew_trip_expenses') return { data: null }
    if (c.op === 'select') return { data: rows }
    if (c.op === 'insert') rows = [exp({ ...(c.payload as Partial<Expense>) }), ...rows]
    return { data: null }
  })
})
afterEach(() => cleanup())

describe('rekenen in delen en in CHF', () => {
  it('delen per persoon, tot op de cent; gelijk als er geen delen zijn', () => {
    expect([...shares(30000, ['a', 'b'], [2, 1])]).toEqual([
      ['a', 20000],
      ['b', 10000],
    ])
    // 100 cent in 1:1:1 → 34, 33, 33 (de rest naar de eerste op id, net als altijd)
    expect([...shares(100, ['c', 'a', 'b'], [1, 1, 1]).entries()].sort()).toEqual([
      ['a', 34],
      ['b', 33],
      ['c', 33],
    ])
    // 100 in 1:2 → 33,33 en 66,67 → 33 en 67
    expect(shares(100, ['a', 'b'], [1, 2]).get('b')).toBe(67)
    // delen die niet kloppen met het aantal mensen: gelijk
    expect(shares(100, ['a', 'b'], [5])).toEqual(shares(100, ['a', 'b']))
  })

  it('de stand en jouw deel tellen met de delen', () => {
    const list = [exp({ amount_cents: 30000, paid_by: 'me', split_between: ['me', 'daan'], weights: [1, 2] })]
    expect(balances(list).get('daan')).toBe(-20000)
    expect(totals(list, 'me').mine).toBe(10000)
  })

  it('koers: van de eerste CHF-uitgave; omrekenen, invullen en laten zien', () => {
    expect(tripRate([exp({ currency: 'EUR' })])).toBeNull()
    expect(
      tripRate([
        exp({ currency: 'CHF', rate: 1.1, created_at: '2027-01-12T10:00:00Z' }),
        exp({ currency: 'CHF', rate: 1.06, created_at: '2027-01-11T10:00:00Z' }),
      ]),
    ).toBe(1.06)
    expect(toEuro(10000, 1.06)).toBe(10600)
    expect(parseRate('1,06')).toBe(1.06)
    expect(parseRate('0')).toBeNull()
    expect(parseRate('veel')).toBeNull()
    expect(fmtChf(1250)).toBe('CHF 12,50')
  })

  it('opslaan: CHF met koers en euro-bedrag; delen alleen als ze verschillen', async () => {
    await addExpense('c1', 't1', {
      title: 'Fondue',
      amount_cents: 0,
      paid_by: 'me',
      split_between: ['me', 'daan'],
      currency: 'CHF',
      orig_cents: 10000,
      rate: 1.06,
      weights: [1, 1],
    })
    expect(fake().calls.at(-1)!.payload).toMatchObject({
      amount_cents: 10600,
      currency: 'CHF',
      orig_cents: 10000,
      rate: 1.06,
      weights: null,
    })
    await addExpense('c1', 't1', { title: 'Huisje', amount_cents: 30000, paid_by: 'me', split_between: ['me', 'daan'], weights: [2, 1] })
    expect(fake().calls.at(-1)!.payload).toMatchObject({ currency: 'EUR', orig_cents: null, rate: null, weights: [2, 1], receipt: null })
    await expect(
      addExpense('c1', 't1', { title: 'x', amount_cents: 100, paid_by: 'me', split_between: ['me'], currency: 'CHF', orig_cents: 100 }),
    ).rejects.toThrow(/koers/)
  })
})

describe('in het potje', () => {
  it('eerste CHF-uitgave: koers invullen, je ziet het euro-bedrag; daarna ligt de koers vast', async () => {
    const user = userEvent.setup()
    render(<TripPot tripId="t1" crewId="c1" ownerId="me" />)
    await user.click(await screen.findByRole('button', { name: 'Uitgave toevoegen' }))
    let sheet = screen.getByRole('dialog', { name: 'Nieuwe uitgave' })
    await user.type(within(sheet).getByPlaceholderText(/boodschappen/), 'Fondue')
    await user.click(within(sheet).getByRole('tab', { name: 'CHF' }))
    await user.type(within(sheet).getByLabelText('Bedrag in CHF'), '100')
    await user.type(within(sheet).getByLabelText('Koers'), '1,06')
    expect(within(sheet).getByText('= € 106')).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Opslaan' }))
    expect(await screen.findByText(/CHF 100/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Uitgave toevoegen' }))
    sheet = screen.getByRole('dialog', { name: 'Nieuwe uitgave' })
    await user.click(within(sheet).getByRole('tab', { name: 'CHF' }))
    expect(within(sheet).queryByLabelText('Koers')).toBeNull()
    expect(within(sheet).getByText(/vast voor deze trip/)).toBeTruthy()
  })

  it('in delen: per persoon het bedrag, en zo opgeslagen', async () => {
    const user = userEvent.setup()
    render(<TripPot tripId="t1" crewId="c1" ownerId="me" />)
    await user.click(await screen.findByRole('button', { name: 'Uitgave toevoegen' }))
    const sheet = screen.getByRole('dialog', { name: 'Nieuwe uitgave' })
    await user.type(within(sheet).getByPlaceholderText(/boodschappen/), 'Huisje')
    await user.type(within(sheet).getByLabelText('Bedrag in euro'), '300')
    await user.click(within(sheet).getByRole('tab', { name: 'In delen' }))
    await user.click(within(within(sheet).getByRole('group', { name: 'Delen Jij' })).getByRole('button', { name: 'Meer' }))
    expect(within(within(sheet).getByRole('group', { name: 'Delen Jij' })).getByText('€ 200')).toBeTruthy()
    expect(within(within(sheet).getByRole('group', { name: 'Delen Daan' })).getByText('€ 100')).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Opslaan' }))
    await waitFor(() => expect(fake().calls.find((c) => c.op === 'insert')?.payload).toMatchObject({ weights: [2, 1] }))
    expect(await screen.findByText(/voor in delen/)).toBeTruthy()
  })

  it('bonnetje: foto kiezen, mee opgeslagen, en in de lijst te bekijken', async () => {
    const user = userEvent.setup()
    const photo = { id: 'bon1', kind: 'media', type: 'image', mime: 'image/jpeg', crewId: 'c1', createdAt: 0, updatedAt: 0 } as MediaMeta
    media.addMediaFiles.mockReset().mockImplementation(async () => {
      await db.records.put(photo as never)
      return { added: [photo], skipped: [] }
    })
    render(
      <MemoryRouter>
        <TripPot tripId="t1" crewId="c1" ownerId="me" />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Uitgave toevoegen' }))
    const sheet = screen.getByRole('dialog', { name: 'Nieuwe uitgave' })
    await user.type(within(sheet).getByPlaceholderText(/boodschappen/), 'Boodschappen')
    await user.type(within(sheet).getByLabelText('Bedrag in euro'), '42')
    fireEvent.change(within(sheet).getByLabelText('Foto van het bonnetje'), {
      target: { files: [new File(['x'], 'bon.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Weghalen' })).toBeTruthy())
    expect(media.addMediaFiles.mock.calls[0][1]).toEqual({ crewId: 'c1' })
    await user.click(within(sheet).getByRole('button', { name: 'Opslaan' }))
    await waitFor(() => expect(fake().calls.find((c) => c.op === 'insert')?.payload).toMatchObject({ receipt: 'bon1' }))
    await user.click(await screen.findByRole('button', { name: 'Bonnetje van Boodschappen' }))
    // de viewer gaat open met je eigen foto (die je ook kunt tekenen)
    expect(await screen.findByRole('button', { name: 'Teken' })).toBeTruthy()
  })
})
