// Potje van de trip: bedragen, eerlijk verdelen, de stand, wie wie betaalt, en het onderdeel op de trippagina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeSupabase } from './fakeSupabase'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true, backendInfo: {} }
})
const crew = vi.hoisted(() => ({ crewMembers: vi.fn() }))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), crewMembers: crew.crewMembers }))
const card = vi.hoisted(() => ({ renderPotCard: vi.fn(), shareImage: vi.fn() }))
vi.mock('../lib/shareCard', async (orig) => ({ ...(await orig<typeof import('../lib/shareCard')>()), ...card }))

import { TripPot } from '../components/TripPot'
import {
  addExpense,
  balances,
  canChange,
  checkInput,
  fmtEuro,
  parseEuro,
  potLines,
  recordPayment,
  settle,
  shares,
  totals,
  type Expense,
} from '../lib/pot'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { toastStore } from '../lib/toast'

const fake = () => sb.ref!
let n = 0
const exp = (over: Partial<Expense>): Expense => ({
  id: `e${++n}`,
  trip_id: 't1',
  crew_id: 'c1',
  kind: 'expense',
  title: 'Iets',
  amount_cents: 1000,
  paid_by: 'me',
  split_between: ['me'],
  spent_on: null,
  created_by: 'me',
  created_at: new Date(Date.now() - n * 1000).toISOString(),
  ...over,
})
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)

describe('bedragen', () => {
  it('euro invullen zoals je het typt', () => {
    expect(parseEuro('12,50')).toBe(1250)
    expect(parseEuro('12.5')).toBe(1250)
    expect(parseEuro('€ 12')).toBe(1200)
    expect(parseEuro('1.234,56')).toBe(123456)
    expect(parseEuro('1,234.56')).toBe(123456)
    expect(parseEuro('0,01')).toBe(1)
    for (const bad of ['', '0', '-5', '12,345', 'abc', '1,2,3', '200000']) expect(parseEuro(bad)).toBeNull()
  })

  it('netjes laten zien', () => {
    expect(fmtEuro(1250)).toBe('€ 12,50')
    expect(fmtEuro(1200)).toBe('€ 12')
    expect(fmtEuro(5)).toBe('€ 0,05')
    expect(fmtEuro(123456)).toBe('€ 1.234,56')
    expect(fmtEuro(-300)).toBe('-€ 3')
  })
})

describe('rekenen', () => {
  it('gelijk verdelen in centen: de rest gaat cent voor cent naar de eersten, op id', () => {
    expect([...shares(1000, ['c', 'a', 'b'])]).toEqual([
      ['a', 334],
      ['b', 333],
      ['c', 333],
    ])
    expect([...shares(900, ['a', 'a', 'b'])]).toEqual([
      ['a', 450],
      ['b', 450],
    ])
    expect(shares(100, []).size).toBe(0)
  })

  it('de stand telt op tot nul; wie betaalde krijgt geld van wie meedeed', () => {
    const b = balances([
      exp({ paid_by: 'me', amount_cents: 9000, split_between: ['me', 'daan', 'noor'] }),
      exp({ paid_by: 'daan', amount_cents: 1000, split_between: ['me', 'daan'] }),
    ])
    expect(b.get('me')).toBe(6000 - 500)
    expect(b.get('daan')).toBe(1000 - 3000 - 500)
    expect(b.get('noor')).toBe(-3000)
    expect(sum(b)).toBe(0)
  })

  it('wie betaalt wie: grootste schuld naar grootste tegoed, minder betalingen dan mensen', () => {
    const b = new Map([
      ['a', 5000],
      ['b', 1000],
      ['c', -4000],
      ['d', -2000],
    ])
    expect(settle(b)).toEqual([
      { from: 'c', to: 'a', cents: 4000 },
      { from: 'd', to: 'a', cents: 1000 },
      { from: 'd', to: 'b', cents: 1000 },
    ])
    expect(settle(new Map([['a', 0]]))).toEqual([])
  })

  it('na de terugbetalingen staat iedereen quitte', () => {
    const list = [
      exp({ paid_by: 'me', amount_cents: 9001, split_between: ['me', 'daan', 'noor'] }),
      exp({ paid_by: 'noor', amount_cents: 4550, split_between: ['daan', 'noor'] }),
      exp({ paid_by: 'daan', amount_cents: 777, split_between: ['me', 'daan', 'noor'] }),
    ]
    const pays = settle(balances(list))
    const after = [...list, ...pays.map((p) => exp({ kind: 'transfer', paid_by: p.from, split_between: [p.to], amount_cents: p.cents }))]
    expect([...balances(after).values()].every((c) => c === 0)).toBe(true)
    expect(pays.length).toBeLessThanOrEqual(2)
  })

  it('totaal zonder terugbetalingen, en jouw deel', () => {
    const list = [
      exp({ amount_cents: 3000, split_between: ['me', 'daan', 'noor'] }),
      exp({ kind: 'transfer', amount_cents: 1000, paid_by: 'daan', split_between: ['me'] }),
    ]
    expect(totals(list, 'me')).toEqual({ spent: 3000, mine: 1000 })
  })

  it('regels voor de deelkaart', () => {
    const name = (id: string) => ({ a: 'Sam', b: 'Noor' })[id] ?? 'Iemand'
    expect(potLines([{ from: 'b', to: 'a', cents: 4000 }], name)).toEqual([{ text: 'Noor betaalt Sam', amount: '€ 40' }])
    expect(potLines([], name)).toEqual([])
  })

  it('aanpassen mag wie hem toevoegde, wie betaalde, of de trip-eigenaar (weghalen)', () => {
    const e = exp({ created_by: 'daan', paid_by: 'noor' })
    expect(canChange(e, 'daan')).toBe(true)
    expect(canChange(e, 'noor')).toBe(true)
    expect(canChange(e, 'me')).toBe(false)
    expect(canChange(e, 'me', 'me')).toBe(true)
  })

  it('invoer checken', () => {
    const ok = { title: 'Pizza', amount_cents: 2000, paid_by: 'me', split_between: ['me'] }
    expect(checkInput(ok)).toBeNull()
    expect(checkInput({ ...ok, title: '  ' })).toBe('Waar was het voor?')
    expect(checkInput({ ...ok, amount_cents: 0 })).toBe('Vul een bedrag in')
    expect(checkInput({ ...ok, split_between: [] })).toBe('Kies voor wie het was')
  })
})

let rows: Expense[]
function serve() {
  fake().respond((c) => {
    if (c.table !== 'crew_trip_expenses') return { data: null }
    if (c.op === 'select') return { data: rows }
    if (c.op === 'insert') {
      rows = [exp({ ...(c.payload as Partial<Expense>), created_by: 'me' }), ...rows]
      return { data: null }
    }
    if (c.op === 'update') {
      const id = c.filters.find((f) => f[1] === 'id')?.[2]
      rows = rows.map((r) => (r.id === id ? { ...r, ...(c.payload as Partial<Expense>) } : r))
      return { data: null }
    }
    if (c.op === 'delete') {
      const id = c.filters.find((f) => f[1] === 'id')?.[2]
      rows = rows.filter((r) => r.id !== id)
      return { data: null }
    }
    return { data: null }
  })
}

beforeEach(async () => {
  await db.kv.clear()
  setCurrentUserId('me')
  toastStore.set([])
  fake().calls.length = 0
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  rows = []
  crew.crewMembers.mockResolvedValue(
    [
      ['me', 'Ingmar'],
      ['daan', 'Daan'],
      ['noor', 'Noor'],
    ].map(([user_id, display_name]) => ({ user_id, display_name, role: 'member', stats: {} })),
  )
  serve()
})
afterEach(() => cleanup())

describe('potje-data', () => {
  it('toevoegen: opgeschoond, als uitgave; terugbetalen: aan één ander', async () => {
    await addExpense('c1', 't1', { title: '  Boodschappen ', amount_cents: 9000, paid_by: 'me', split_between: ['me', 'daan', 'me'] })
    expect(fake().calls.at(-1)).toMatchObject({
      op: 'insert',
      payload: { trip_id: 't1', crew_id: 'c1', kind: 'expense', title: 'Boodschappen', split_between: ['me', 'daan'] },
    })
    await expect(addExpense('c1', 't1', { title: 'x', amount_cents: 0, paid_by: 'me', split_between: ['me'] })).rejects.toThrow(
      'Vul een bedrag in',
    )
    await recordPayment('c1', 't1', { from: 'daan', to: 'me', cents: 3000 })
    expect(fake().calls.at(-1)).toMatchObject({ payload: { kind: 'transfer', paid_by: 'daan', split_between: ['me'], amount_cents: 3000 } })
  })
})

describe('potje op de trippagina', () => {
  it('uitgave toevoegen: bedrag per persoon, en de stand met wie wie betaalt', async () => {
    const user = userEvent.setup()
    render(<TripPot tripId="t1" crewId="c1" ownerId="me" />)
    expect(await screen.findByText(/Nog niks in het potje/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Uitgave toevoegen' }))
    const sheet = screen.getByRole('dialog', { name: 'Nieuwe uitgave' })
    await user.type(within(sheet).getByPlaceholderText(/boodschappen/), 'Boodschappen')
    await user.type(within(sheet).getByLabelText('Bedrag in euro'), '90')
    expect(within(sheet).getByText('€ 30 per persoon')).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Opslaan' }))

    const stand = await screen.findByRole('group', { name: 'Stand van het potje' })
    expect(within(stand).getByText('€ 90')).toBeTruthy()
    expect(within(stand).getByText('Jouw deel: € 30')).toBeTruthy()
    expect(within(stand).getByText('Jij krijgt € 60')).toBeTruthy()
    expect(screen.getByText('Jij betaalde · voor iedereen', { exact: false })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /betaalde Jij € 30/ })).toHaveLength(2)
  })

  it('Betaald: legt de terugbetaling vast en de stand schuift', async () => {
    const user = userEvent.setup()
    rows = [exp({ title: 'Skipassen', paid_by: 'daan', created_by: 'daan', amount_cents: 6000, split_between: ['me', 'daan'] })]
    render(<TripPot tripId="t1" crewId="c1" ownerId="daan" />)
    expect(await screen.findByText('Jij moet € 30')).toBeTruthy()
    // je kunt een uitgave van een ander niet aanpassen
    expect(screen.queryByRole('button', { name: /Skipassen/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Jij betaalde Daan € 30' }))
    expect(await screen.findByText('Jij staat quitte')).toBeTruthy()
    expect(screen.getByText('Iedereen staat quitte.')).toBeTruthy()
    expect(screen.getByText('Jij → Daan')).toBeTruthy()
    expect(toastStore.get().at(-1)?.title).toBe('Vastgelegd')
  })

  it('de stand delen: een kaart met de tripnaam, het totaal en wie wie betaalt, met namen in plaats van Jij', async () => {
    const user = userEvent.setup()
    card.renderPotCard.mockReset().mockResolvedValue(new Blob(['png']))
    card.shareImage.mockReset().mockResolvedValue(undefined)
    rows = [exp({ title: 'Skipassen', paid_by: 'daan', created_by: 'daan', amount_cents: 6000, split_between: ['me', 'daan'] })]
    render(<TripPot tripId="t1" crewId="c1" ownerId="daan" tripName="Tignes 2027" />)
    await user.click(await screen.findByRole('button', { name: 'Deel de stand' }))
    await waitFor(() => expect(card.shareImage).toHaveBeenCalled())
    const [trip, spent, lines] = card.renderPotCard.mock.calls[0]
    expect(trip).toBe('Tignes 2027')
    expect(spent).toBe('€ 60')
    expect(lines).toEqual([{ text: expect.stringMatching(/betaalt Daan$/), amount: '€ 30' }])
    expect(lines[0].text).not.toMatch(/^Jij/)
  })

  it('leeg potje: niks te delen', async () => {
    render(<TripPot tripId="t1" crewId="c1" ownerId="me" />)
    await screen.findByText(/Nog niks in het potje/)
    expect(screen.queryByRole('button', { name: 'Deel de stand' })).toBeNull()
  })

  it('eigen uitgave aanpassen en weghalen; voor niemand mag niet', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    rows = [exp({ title: 'Pizza', amount_cents: 2400, split_between: ['me', 'daan', 'noor'] })]
    render(<TripPot tripId="t1" crewId="c1" />)
    await user.click(await screen.findByRole('button', { name: /Pizza/ }))
    const sheet = screen.getByRole('dialog', { name: 'Uitgave' })
    expect((within(sheet).getByLabelText('Bedrag in euro') as HTMLInputElement).value).toBe('24')
    const voor = within(sheet).getByRole('group', { name: 'Voor wie' })
    await user.click(within(voor).getByRole('button', { name: 'Iedereen' }))
    await user.click(within(sheet).getByRole('button', { name: 'Opslaan' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Kies voor wie het was')
    await user.click(within(voor).getByRole('button', { name: 'Daan' }))
    expect(within(sheet).getByText('€ 24 per persoon')).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Opslaan' }))
    await waitFor(() => expect(rows[0].split_between).toEqual(['daan']))
    expect(await screen.findByText('Jij krijgt € 24')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Pizza/ }))
    await user.click(within(screen.getByRole('dialog', { name: 'Uitgave' })).getByRole('button', { name: 'Weghalen' }))
    expect(await screen.findByText(/Nog niks in het potje/)).toBeTruthy()
  })

  it('raar bedrag: uitleg in plaats van opslaan', async () => {
    const user = userEvent.setup()
    render(<TripPot tripId="t1" crewId="c1" />)
    await user.click(await screen.findByRole('button', { name: 'Uitgave toevoegen' }))
    const sheet = screen.getByRole('dialog', { name: 'Nieuwe uitgave' })
    await user.type(within(sheet).getByPlaceholderText(/boodschappen/), 'Bier')
    await user.type(within(sheet).getByLabelText('Bedrag in euro'), '12,345')
    await user.click(within(sheet).getByRole('button', { name: 'Opslaan' }))
    expect(within(sheet).getByRole('alert').textContent).toMatch(/Dat bedrag snap ik niet/)
    expect(fake().calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('offline: de laatst bekende stand, zonder knoppen', async () => {
    rows = [exp({ title: 'Huisje', amount_cents: 30000, paid_by: 'noor', created_by: 'noor', split_between: ['me', 'daan', 'noor'] })]
    const r = render(<TripPot tripId="t1" crewId="c1" />)
    expect(await screen.findByText('Jij moet € 100')).toBeTruthy()
    r.unmount()
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    render(<TripPot tripId="t1" crewId="c1" />)
    expect(await screen.findByText('Jij moet € 100')).toBeTruthy()
    expect(screen.getByText('Noor betaalde · voor iedereen', { exact: false })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Uitgave toevoegen' })).toBeNull()
    expect((screen.getByRole('button', { name: /Jij betaalde Noor/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
