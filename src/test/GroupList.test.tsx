import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({
  listItems: vi.fn(),
  cachedItems: vi.fn(),
  addItem: vi.fn(),
  setClaim: vi.fn(),
  setDone: vi.fn(),
  removeItem: vi.fn(),
  crewMembers: vi.fn(),
}))
vi.mock('../lib/crewTrips', async (orig) => ({ ...(await orig<typeof import('../lib/crewTrips')>()), ...api }))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), crewMembers: api.crewMembers }))

import { GroupList } from '../components/GroupList'
import { setCurrentUserId } from '../lib/auth-state'
import { toastStore } from '../lib/toast'

const ME = 'me'
const item = (over: Record<string, unknown>) => ({
  crew_id: 'c1',
  trip_id: 't1',
  claimed_by: null,
  done: false,
  created_by: 'daan',
  created_at: '2026-10-27T10:00:00Z',
  ...over,
})

function setOnline(on: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })
}

beforeEach(() => {
  setCurrentUserId(ME)
  setOnline(true)
  toastStore.set([])
  api.cachedItems.mockResolvedValue([])
  api.crewMembers.mockResolvedValue([
    { user_id: 'daan', display_name: 'Daan', role: 'member', stats: {} },
    { user_id: ME, display_name: 'Ingmar', role: 'owner', stats: {} },
  ])
  api.listItems.mockResolvedValue([
    item({ id: 'a', label: 'Speaker', claimed_by: 'daan' }),
    item({ id: 'b', label: 'EHBO-doos' }),
    item({ id: 'c', label: 'Wax', created_by: ME }),
  ])
  for (const f of [api.setClaim, api.setDone, api.removeItem]) f.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const row = (label: string) => screen.getByText(label).closest('div.flex') as HTMLElement
/** wacht tot de lijst van de server binnen is (niet de cache of een suggestie-chip) */
const loaded = () => screen.findByText('Daan neemt hem mee')

describe('groepslijst', () => {
  it('laat zien wie wat meeneemt en wat nog van niemand is', async () => {
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    expect(await screen.findByText('Daan neemt hem mee')).toBeTruthy()
    expect(screen.getAllByText('Nog niemand')).toHaveLength(2)
    expect(screen.getByText('2 nog niemand')).toBeTruthy()
  })

  it('"Ik" claimt meteen voor jezelf en slaat dat op', async () => {
    const user = userEvent.setup()
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    await user.click(within(row('EHBO-doos')).getByRole('button', { name: 'Ik' }))
    expect(within(row('EHBO-doos')).getByText('Jij neemt hem mee')).toBeTruthy()
    expect(api.setClaim).toHaveBeenCalledWith('b', true)
  })

  it('afvinken werkt voor iedereen in de crew', async () => {
    const user = userEvent.setup()
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    await user.click(within(row('Speaker')).getByRole('checkbox'))
    expect(api.setDone).toHaveBeenCalledWith('a', true)
    expect(within(row('Speaker')).getByRole('checkbox').getAttribute('aria-checked')).toBe('true')
  })

  it('verwijderen kan alleen bij je eigen items (of als jij de trip hebt)', async () => {
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    expect(screen.queryByRole('button', { name: 'Speaker verwijderen' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Wax verwijderen' })).toBeTruthy()
  })

  it('als trip-eigenaar mag je alles verwijderen', async () => {
    render(<GroupList tripId="t1" crewId="c1" ownerId={ME} />)
    await loaded()
    expect(screen.getAllByRole('button', { name: /verwijderen$/ })).toHaveLength(3)
  })

  it('toevoegen via het veld en via een suggestie', async () => {
    const user = userEvent.setup()
    api.addItem.mockImplementation(async (_c: string, _t: string, label: string) => item({ id: label, label, created_by: ME }))
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    // een suggestie die al op de lijst staat, wordt niet nog eens aangeboden
    expect(screen.queryByRole('button', { name: /^Speaker$/ })).toBeNull()
    await user.type(screen.getByPlaceholderText(/Bijv\. speaker/), 'Kaartspel{Enter}')
    expect(api.addItem).toHaveBeenCalledWith('c1', 't1', 'Kaartspel', false)
    expect(await screen.findByText('Kaartspel')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Powerbank/ }))
    expect(api.addItem).toHaveBeenCalledWith('c1', 't1', 'Powerbank', false)
  })

  it('een trage refresh overschrijft je net gezette claim niet', async () => {
    const user = userEvent.setup()
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    let resolve!: (v: unknown[]) => void
    api.listItems.mockReturnValue(new Promise((r) => (resolve = r)))
    document.dispatchEvent(new Event('visibilitychange'))
    await user.click(within(row('EHBO-doos')).getByRole('button', { name: 'Ik' }))
    resolve([
      item({ id: 'a', label: 'Speaker', claimed_by: 'daan' }),
      item({ id: 'b', label: 'EHBO-doos' }),
      item({ id: 'c', label: 'Wax', created_by: ME }),
    ])
    await new Promise((r) => setTimeout(r, 10))
    expect(within(row('EHBO-doos')).getByText('Jij neemt hem mee')).toBeTruthy()
  })

  it('lege cache: geen suggesties tonen voor items die de server al heeft', async () => {
    let resolve!: (v: unknown[]) => void
    api.listItems.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    await waitFor(() => expect(api.cachedItems).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('button', { name: /^Speaker$/ })).toBeNull()
    resolve([item({ id: 'a', label: 'Speaker', claimed_by: 'daan' })])
    expect(await loaded()).toBeTruthy()
  })

  it('mislukt opslaan: melding en terug naar wat de server zegt', async () => {
    const user = userEvent.setup()
    api.setClaim.mockRejectedValue({ message: 'Je kunt alleen zelf iets claimen', code: '42501' })
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    await loaded()
    await user.click(within(row('EHBO-doos')).getByRole('button', { name: 'Ik' }))
    await waitFor(() => expect(toastStore.get().some((t) => t.title === 'Niet opgeslagen')).toBe(true))
    await waitFor(() => expect(api.listItems).toHaveBeenCalledTimes(2))
  })

  it('offline: laatst bekende lijst, niks bewerken', async () => {
    setOnline(false)
    api.cachedItems.mockResolvedValue([item({ id: 'a', label: 'Speaker', claimed_by: 'daan' })])
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    expect(await screen.findByText('Speaker')).toBeTruthy()
    expect(screen.getByText(/Offline: je ziet de laatst bekende lijst/)).toBeTruthy()
    expect(api.listItems).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText(/Bijv\. speaker/)).toBeNull()
    expect((within(row('Speaker')).getByRole('checkbox') as HTMLButtonElement).disabled).toBe(true)
  })

  it('laat zien dat hij bijwerkt terwijl de laatst bekende lijst al in beeld staat', async () => {
    let resolve!: (v: unknown) => void
    api.cachedItems.mockResolvedValue([item({ id: 'a', label: 'Speaker' })])
    api.listItems.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<GroupList tripId="t1" crewId="c1" ownerId="daan" />)
    expect(await screen.findByText('Speaker')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Bijwerken' })).toBeTruthy()
    resolve([item({ id: 'a', label: 'Speaker', claimed_by: 'daan' })])
    expect(await screen.findByText('Daan neemt hem mee')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Bijwerken' })).toBeNull()
  })

  it('trip nog niet gesynct: uitleg in plaats van een lege lijst die niet werkt', async () => {
    render(<GroupList tripId="t1" crewId="c1" ownerId={ME} ready={false} />)
    expect(await screen.findByText(/Even syncen/)).toBeTruthy()
    expect(api.listItems).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText(/Bijv\. speaker/)).toBeNull()
  })
})
