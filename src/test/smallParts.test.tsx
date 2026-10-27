import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const crew = vi.hoisted(() => ({ myCrews: vi.fn(), crewFeed: vi.fn(), crewMembers: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: { keyKind: 'publishable' } }))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), ...crew }))

import { Toasts } from '../components/Toasts'
import { SyncBadge } from '../components/SyncBadge'
import Crew from '../pages/Crew'
import Settings from '../pages/Settings'
import { undoToast, toastStore } from '../lib/toast'
import { syncStore } from '../lib/sync'
import { authStore } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db, kvSet, type BlobRow } from '../lib/db'
import { create, listKind, remove, restore } from '../lib/repo'
import { plural } from '../lib/format'
import type { User } from '@supabase/supabase-js'

const inRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)
const online = (on: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  setCurrentUserId('me')
  authStore.set({ user: { id: 'me', email: 'me@x' } as User, ready: true })
  toastStore.set([])
  online(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('meervoud', () => {
  it('1 dag, 0 dagen, 3 tricks', () => {
    expect(plural(1, 'dag', 'dagen')).toBe('1 dag')
    expect(plural(0, 'dag', 'dagen')).toBe('0 dagen')
    expect(plural(3, 'trick', 'tricks')).toBe('3 tricks')
  })
})

describe('verwijderen met terugzetten', () => {
  it('restore() haalt een zacht verwijderd record terug en markeert het voor sync', async () => {
    const g = await create('goal', { title: 'Ollie leren', done: false })
    await remove(g)
    expect(await listKind('goal')).toHaveLength(0)
    await restore(g)
    expect(await listKind('goal')).toHaveLength(1)
    expect((await db.records.get(g.id))?.dirty).toBe(1)
  })

  it('toast met "Terugzetten" voert de undo uit en verdwijnt', async () => {
    const user = userEvent.setup()
    const undo = vi.fn()
    render(<Toasts />)
    act(() => undoToast('Doel verwijderd', undo))
    await user.click(await screen.findByRole('button', { name: 'Terugzetten' }))
    expect(undo).toHaveBeenCalledOnce()
    expect(toastStore.get()).toEqual([])
  })
})

describe('sync-badge', () => {
  it('uitgelogd: "Inloggen"', () => {
    authStore.set({ user: null, ready: true })
    inRouter(<SyncBadge />)
    expect(screen.getByRole('link', { name: /Inloggen/ }).getAttribute('href')).toBe('/instellingen')
  })

  it('wachtende wijzigingen, offline en fout', () => {
    act(() => syncStore.set({ status: 'idle', pending: 2 }))
    const { rerender } = inRouter(<SyncBadge />)
    expect(screen.getByText('2 wacht')).toBeTruthy()
    act(() => syncStore.set({ status: 'offline', pending: 0 }))
    rerender(
      <MemoryRouter>
        <SyncBadge />
      </MemoryRouter>,
    )
    expect(screen.getByText('offline')).toBeTruthy()
    act(() => syncStore.set({ status: 'error', pending: 1, error: 'x' }))
    expect(screen.getByText('fout')).toBeTruthy()
    act(() => syncStore.set({ status: 'idle', pending: 0 }))
    expect(screen.getByText('gesynct')).toBeTruthy()
  })
})

describe('opslaggebruik in instellingen', () => {
  it("telt foto's en video's en hun grootte", async () => {
    await create('media', { type: 'image', mime: 'image/jpeg', size: 3 * 1024 * 1024, crewId: null })
    await create('media', { type: 'video', mime: 'video/mp4', size: 10 * 1024 * 1024, crewId: null })
    // ouder item zonder grootte: meten via de lokale blob
    const old = await create('media', { type: 'image', mime: 'image/jpeg', crewId: null })
    vi.spyOn(db.blobs, 'get').mockImplementation((async (id: string) =>
      id === old.id ? ({ id, blob: { size: 2 * 1024 * 1024 } } as unknown as BlobRow) : undefined) as never)
    inRouter(<Settings />)
    expect(await screen.findByText('Je media: 15 MB')).toBeTruthy()
    expect(screen.getByText(/2 foto's · 1 video/)).toBeTruthy()
  })
})

describe('crew offline', () => {
  it('toont je bekende crews in plaats van "nog geen crew" en geen foutmelding', async () => {
    online(false)
    crew.myCrews.mockRejectedValue(new TypeError('Failed to fetch'))
    crew.crewFeed.mockRejectedValue(new TypeError('Failed to fetch'))
    crew.crewMembers.mockRejectedValue(new TypeError('Failed to fetch'))
    await kvSet('crews', [{ id: 'c1', name: 'Shredheads', invite_code: 'ABC123', created_by: 'me' }])
    inRouter(<Crew />)
    expect((await screen.findAllByText('Shredheads')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Nog geen crew')).toBeNull()
    expect(toastStore.get().some((t) => t.title === 'Crew laden mislukt')).toBe(false)
  })
})
