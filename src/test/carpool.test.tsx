// Wie rijdt met wie: auto's, plekken en de "Ik rijd"-sheet.
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

import { CarPool } from '../components/CarPool'
import { carError, listCars, takeSeat } from '../lib/carpool'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { toastStore } from '../lib/toast'

const fake = () => sb.ref!
const car = (over = {}) => ({
  id: 'car1',
  crew_id: 'c1',
  trip_id: 't1',
  driver: 'daan',
  label: 'Golf van Daan',
  seats: 2,
  departs: 'vr 18:00',
  note: 'Boards op het dak',
  created_at: '1',
  ...over,
})

// nep-database: auto's en plekken die de test kan aanpassen
let cars: ReturnType<typeof car>[]
let riders: { car_id: string; user_id: string; trip_id: string }[]
function serve() {
  fake().respond((c) => {
    if (c.table === 'crew_trip_cars' && c.op === 'select') return { data: cars }
    if (c.table === 'crew_trip_riders' && c.op === 'select') return { data: riders }
    if (c.table === 'crew_trip_riders' && c.op === 'insert') {
      const p = c.payload as { car_id: string; trip_id: string }
      riders.push({ ...p, user_id: 'me' })
      return { data: null }
    }
    if (c.table === 'crew_trip_riders' && c.op === 'delete') {
      const who = c.filters.find((f) => f[1] === 'user_id')?.[2]
      riders = riders.filter((r) => r.user_id !== who)
      return { data: null }
    }
    if (c.table === 'crew_trip_cars' && c.op === 'insert') {
      cars.push(car({ id: 'car2', driver: 'me', ...(c.payload as object) }))
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
  cars = [car()]
  riders = [{ car_id: 'car1', user_id: 'sem', trip_id: 't1' }]
  crew.crewMembers.mockResolvedValue(
    [
      ['me', 'Ingmar'],
      ['daan', 'Daan'],
      ['sem', 'Sem'],
      ['lot', 'Lot'],
    ].map(([user_id, display_name]) => ({ user_id, display_name, role: 'member', stats: {} })),
  )
  serve()
})
afterEach(() => cleanup())

describe('carpool-logica', () => {
  it('auto’s met wie erin zit', async () => {
    expect(await listCars('t1')).toEqual([{ ...car(), riders: ['sem'] }])
  })

  it('overstappen: eerst uit de oude auto, dan in de nieuwe; dezelfde auto doet niks', async () => {
    await takeSeat('t1', 'car2', 'car1')
    const ops = fake()
      .calls.filter((c) => c.table === 'crew_trip_riders')
      .map((c) => c.op)
    expect(ops).toEqual(['delete', 'insert'])
    fake().calls.length = 0
    await takeSeat('t1', 'car1', 'car1')
    expect(fake().calls).toHaveLength(0)
  })

  it('fouten in gewone taal', () => {
    expect(carError({ code: '23505' })).toBe('Je hebt op deze trip al een plek of een auto.')
    expect(carError({ code: '23514', message: 'Deze auto zit vol' })).toBe('Deze auto zit vol')
  })
})

describe('wie rijdt met wie', () => {
  const show = () => render(<CarPool tripId="t1" crewId="c1" />)

  it('auto met bestuurder, vertrek, bagage, wie erin zit, vrije plek en wie nog geen plek heeft', async () => {
    show()
    const auto = await screen.findByRole('group', { name: 'Auto: Golf van Daan' })
    expect(within(auto).getByText(/Daan rijdt · 1 plek vrij/)).toBeTruthy()
    expect(within(auto).getByText('vr 18:00')).toBeTruthy()
    expect(within(auto).getByText('Boards op het dak')).toBeTruthy()
    expect(within(auto).getByText('Sem')).toBeTruthy()
    expect(screen.getByText('Nog zonder plek: Jij, Lot')).toBeTruthy()
  })

  it('instappen op een vrije plek en weer uitstappen', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Instappen bij Golf van Daan' }))
    await waitFor(() => expect(riders.map((r) => r.user_id)).toEqual(['sem', 'me']))
    expect(await screen.findByText(/Daan rijdt · vol/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Uitstappen' }))
    await waitFor(() => expect(riders.map((r) => r.user_id)).toEqual(['sem']))
  })

  it('"Ik rijd": auto aanbieden met plekken en vertrek', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: /Ik rijd/ }))
    const sheet = screen.getByRole('dialog', { name: 'Ik rijd' })
    expect((within(sheet).getByLabelText('Naam van de auto') as HTMLInputElement).value).toBe('Auto van Ingmar')
    await user.click(within(sheet).getByRole('button', { name: 'Meer' }))
    await user.type(within(sheet).getByLabelText(/Vertrek/), 'za 7:00')
    await user.click(within(sheet).getByRole('button', { name: 'Bied aan' }))
    await waitFor(() =>
      expect(fake().calls.find((c) => c.table === 'crew_trip_cars' && c.op === 'insert')?.payload).toEqual({
        crew_id: 'c1',
        trip_id: 't1',
        label: 'Auto van Ingmar',
        seats: 4,
        departs: 'za 7:00',
        note: null,
      }),
    )
    expect(await screen.findByRole('group', { name: 'Auto: Auto van Ingmar' })).toBeTruthy()
    // wie zelf rijdt kan nergens anders instappen
    expect((screen.getByRole('button', { name: 'Instappen bij Golf van Daan' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('auto vol of fout van de server: melding', async () => {
    const user = userEvent.setup()
    fake().respond((c) =>
      c.table === 'crew_trip_riders' && c.op === 'insert'
        ? { error: { code: '23514', message: 'Deze auto zit vol' } }
        : c.table === 'crew_trip_cars'
          ? { data: cars }
          : { data: riders },
    )
    show()
    await user.click(await screen.findByRole('button', { name: 'Instappen bij Golf van Daan' }))
    await waitFor(() => expect(toastStore.get().map((t) => t.body)).toContain('Deze auto zit vol'))
  })
})
