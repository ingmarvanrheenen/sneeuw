// Huisje-briefje: velden, alleen wijzigingen opslaan, avonden van de trip, en het onderdeel op de trippagina.
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

import { HouseNote } from '../components/HouseNote'
import { changedFields, claimCooking, cleanFields, mapsUrl, saveHouse, tripEvenings, type House } from '../lib/house'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { toastStore } from '../lib/toast'

const fake = () => sb.ref!
const house = (over: Partial<House> = {}): House => ({
  trip_id: 't1',
  crew_id: 'c1',
  address: null,
  wifi_name: null,
  wifi_code: null,
  checkin: null,
  checkout: null,
  first_lift: null,
  notes: null,
  updated_by: 'daan',
  updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...over,
})

let row: House | null
let cooking: { trip_id: string; crew_id: string; day: string; cook: string; menu: string | null }[]
function serve() {
  fake().respond((c) => {
    if (c.table === 'crew_trip_house' && c.op === 'select') return { data: row }
    if (c.table === 'crew_trip_house' && c.op === 'insert')
      return ((row = house({ ...(c.payload as object), updated_by: 'me' })), { data: null })
    if (c.table === 'crew_trip_house' && c.op === 'update') return ((row = { ...row!, ...(c.payload as object) }), { data: null })
    if (c.table === 'crew_trip_cooking' && c.op === 'select') return { data: cooking }
    if (c.table === 'crew_trip_cooking' && c.op === 'insert')
      return (
        cooking.push({ ...(c.payload as { trip_id: string; crew_id: string; day: string; menu: string | null }), cook: 'me' }),
        { data: null }
      )
    if (c.table === 'crew_trip_cooking' && c.op === 'delete') {
      const day = c.filters.find((f) => f[1] === 'day')?.[2]
      cooking = cooking.filter((x) => x.day !== day)
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
  row = null
  cooking = []
  crew.crewMembers.mockResolvedValue(
    [
      ['me', 'Ingmar'],
      ['daan', 'Daan'],
    ].map(([user_id, display_name]) => ({ user_id, display_name, role: 'member', stats: {} })),
  )
  serve()
})
afterEach(() => cleanup())

describe('huisje-logica', () => {
  it('velden: getrimd en ingekort, leeg wordt null; alleen wat veranderd is gaat mee', () => {
    expect(cleanFields({ wifi_code: '  sneeuw123 ', address: '' })).toEqual({ wifi_code: 'sneeuw123', address: null })
    expect(cleanFields({ notes: 'x'.repeat(2000) }).notes).toHaveLength(1000)
    const before = house({ wifi_code: 'oud', address: 'Rue 4' })
    expect(changedFields(before, { wifi_code: 'nieuw', address: 'Rue 4', notes: '' })).toEqual({ wifi_code: 'nieuw' })
  })

  it('avonden van de trip: tot de dag van vertrek; zonder einde één avond; max 21', () => {
    expect(tripEvenings('2027-01-16', '2027-01-19')).toEqual(['2027-01-16', '2027-01-17', '2027-01-18'])
    expect(tripEvenings('2027-01-16')).toEqual(['2027-01-16'])
    expect(tripEvenings('2027-01-01', '2027-03-01')).toHaveLength(21)
    expect(tripEvenings()).toEqual([])
  })

  it('opslaan: nieuw briefje wordt aangemaakt; tegelijk door iemand anders begonnen wordt bijwerken', async () => {
    await saveHouse('c1', 't1', null, { wifi_code: 'abc' })
    expect(fake().calls.at(-1)).toMatchObject({ op: 'insert', payload: { trip_id: 't1', crew_id: 'c1', wifi_code: 'abc' } })
    fake().respond((c) => (c.op === 'insert' ? { error: { code: '23505' } } : { data: null }))
    await saveHouse('c1', 't1', null, { address: 'Rue 4' })
    expect(fake().calls.at(-1)).toMatchObject({ op: 'update', payload: { address: 'Rue 4' } })
    fake().calls.length = 0
    await saveHouse('c1', 't1', house({ address: 'Rue 4' }), { address: 'Rue 4' })
    expect(fake().calls).toHaveLength(0)
  })

  it('avond al bezet: duidelijke melding; adres naar Kaarten', async () => {
    fake().respond(() => ({ error: { code: '23505' } }))
    await expect(claimCooking('c1', 't1', '2027-01-16', 'Raclette')).rejects.toThrow('Iemand anders kookt die avond al.')
    expect(mapsUrl('Rue des Pistes 4, Tignes')).toBe('https://maps.apple.com/?q=Rue%20des%20Pistes%204%2C%20Tignes')
  })
})

describe('huisje-briefje op de trip', () => {
  const show = (owner = 'daan') =>
    render(<HouseNote tripId="t1" crewId="c1" ownerId={owner} trip={{ startDate: '2027-01-16', endDate: '2027-01-18' }} />)

  it('leeg: briefje invullen; daarna adres naar Kaarten, wifi met kopieerknop, en wie het aanpaste', async () => {
    const user = userEvent.setup()
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } })
    show()
    await user.click(await screen.findByRole('button', { name: /Vul het briefje in/ }))
    const sheet = screen.getByRole('dialog', { name: 'Huisje-briefje' })
    await user.type(within(sheet).getByLabelText('Adres'), 'Rue des Pistes 4')
    await user.type(within(sheet).getByLabelText('Wifi-code'), 'sneeuw123')
    await user.click(within(sheet).getByRole('button', { name: 'Opslaan' }))
    expect((await screen.findByRole('link', { name: /Rue des Pistes 4/ })).getAttribute('href')).toBe(mapsUrl('Rue des Pistes 4'))
    expect(screen.getByText('sneeuw123')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Kopieer' }))
    expect(write).toHaveBeenCalledWith('sneeuw123')
    expect(screen.getByText(/Laatst aangepast door Jij/)).toBeTruthy()
  })

  it('kookrooster: avonden van de trip; "Ik kook" met menu, en weer "Toch niet"', async () => {
    const user = userEvent.setup()
    row = house({ wifi_code: 'x' })
    show()
    const avond = await screen.findByRole('button', { name: /za 16 jan/ })
    expect(screen.getByRole('button', { name: /zo 17 jan/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /ma 18 jan/ })).toBeNull()
    await user.click(avond)
    const sheet = screen.getByRole('dialog', { name: 'za 16 jan' })
    await user.type(within(sheet).getByLabelText(/Wat eten we/), 'Raclette')
    await user.click(within(sheet).getByRole('button', { name: /Ik kook/ }))
    expect(await screen.findByText('Raclette')).toBeTruthy()
    expect(cooking).toMatchObject([{ day: '2027-01-16', menu: 'Raclette', cook: 'me' }])
    await user.click(screen.getByRole('button', { name: /za 16 jan/ }))
    await user.click(within(screen.getByRole('dialog', { name: 'za 16 jan' })).getByRole('button', { name: 'Toch niet' }))
    await waitFor(() => expect(cooking).toEqual([]))
  })

  it('avond van een ander: alleen de trip-eigenaar kan hem vrijmaken', async () => {
    const user = userEvent.setup()
    row = house({ wifi_code: 'x' })
    cooking = [{ trip_id: 't1', crew_id: 'c1', day: '2027-01-16', cook: 'daan', menu: 'Fondue' }]
    const { unmount } = show('daan')
    await user.click(await screen.findByRole('button', { name: /za 16 jan/ }))
    let sheet = screen.getByRole('dialog', { name: 'za 16 jan' })
    expect(within(sheet).getByText(/kookt: Fondue/)).toBeTruthy()
    expect(within(sheet).queryByRole('button', { name: 'Avond vrijmaken' })).toBeNull()
    unmount()
    show('me')
    await user.click(await screen.findByRole('button', { name: /za 16 jan/ }))
    sheet = screen.getByRole('dialog', { name: 'za 16 jan' })
    await user.click(within(sheet).getByRole('button', { name: 'Avond vrijmaken' }))
    await waitFor(() => expect(cooking).toEqual([]))
  })
})
