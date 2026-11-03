// Offline-check: wat er nog moet syncen (per soort, en bestanden), of de app offline klaarstaat, vast bewaren,
// en de pagina die laat zien wat zonder bereik werkt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {}, MEDIA_BUCKET: 'media' }))
const syncMock = vi.hoisted(() => ({ syncNow: vi.fn() }))
vi.mock('../lib/sync', async (orig) => ({ ...(await orig<typeof import('../lib/sync')>()), syncNow: syncMock.syncNow }))

import Offline from '../pages/Offline'
import { waitingOf } from '../lib/offline'
import { NEEDS_INTERNET, WORKS_OFFLINE } from '../content/offline'
import { authStore } from '../lib/auth'
import { db } from '../lib/db'
import type { User } from '@supabase/supabase-js'
import type { AnyRecord } from '../lib/types'

const rec = (kind: string, id: string, over: Record<string, unknown> = {}) =>
  ({ id, kind, createdAt: 0, updatedAt: 0, ...over }) as unknown as AnyRecord

describe('wat er nog wacht', () => {
  it('per soort geteld, met enkel- en meervoud; bestanden zonder plek in de cloud apart', () => {
    const records = [
      rec('session', 'd1', { dirty: 1 }),
      rec('session', 'd2', { dirty: 1 }),
      rec('session', 'd3', { dirty: 0 }),
      rec('trick', 't1', { dirty: 1 }),
      rec('media', 'm1', { dirty: 0 }),
      rec('media', 'm2', { path: 'me/m2.jpg' }),
      rec('media', 'm3', { deleted: true }),
      rec('media', 'm4', {}),
    ]
    const w = waitingOf(records, new Set(['m1', 'm2', 'm3']))
    expect(w.items).toEqual([
      { kind: 'session', n: 2, label: '2 dagen' },
      { kind: 'trick', n: 1, label: '1 trick' },
    ])
    expect(w.total).toBe(3)
    // m1 staat hier en heeft nog geen pad; m2 is al geüpload, m3 weg, m4 heeft geen bestand hier
    expect(w.files).toBe(1)
  })

  it('alles gesynct: niks', () => {
    expect(waitingOf([rec('session', 'd1', { dirty: 0 })], new Set())).toEqual({ items: [], files: 0, total: 0 })
  })

  it('lijsten: elk punt met uitleg, en de belangrijkste zijn erbij', () => {
    for (const x of [...WORKS_OFFLINE, ...NEEDS_INTERNET]) expect(x.detail.length).toBeGreaterThan(10)
    expect(WORKS_OFFLINE.map((x) => x.title)).toEqual(expect.arrayContaining(['Je dag loggen', 'Noodkaart', 'Run-teller']))
    expect(NEEDS_INTERNET.map((x) => x.title)).toContain('Coach Daddy')
  })
})

describe('offline-pagina', () => {
  const persist = vi.fn(async () => true)
  let onLine = true
  beforeEach(async () => {
    await db.records.clear()
    await db.blobs.clear()
    onLine = true
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => onLine })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {} } })
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => false, persist } })
    authStore.set({ user: { id: 'me' } as User, ready: true })
    syncMock.syncNow.mockReset()
    persist.mockClear()
  })
  afterEach(() => cleanup())
  const page = () =>
    render(
      <MemoryRouter>
        <Offline />
      </MemoryRouter>,
    )

  it('klaar voor de berg, wat wacht, nu syncen, en wat zonder bereik werkt', async () => {
    const user = userEvent.setup()
    await db.records.bulkPut([rec('session', 'd1', { dirty: 1 }), rec('session', 'd2', { dirty: 1 }), rec('media', 'm1', {})] as never[])
    await db.blobs.put({ id: 'm1', blob: new Blob(['x']) })
    page()
    const now = screen.getByRole('group', { name: 'Nu' })
    expect(within(now).getByText('Klaar voor de berg')).toBeTruthy()
    expect(within(now).getByText('Je hebt bereik')).toBeTruthy()
    expect(await screen.findByText('2 dagen')).toBeTruthy()
    expect(screen.getByText('1 bestand')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Nu syncen' }))
    expect(syncMock.syncNow).toHaveBeenCalled()
    expect(screen.getByText('Je dag loggen')).toBeTruthy()
    expect(screen.getByText('Coach Daddy')).toBeTruthy()
  })

  it('geen bereik: de poster zegt het, en syncen gaat vanzelf later', async () => {
    await db.records.put(rec('trick', 't1', { dirty: 1 }) as never)
    page()
    expect(await screen.findByText('1 trick')).toBeTruthy()
    onLine = false
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(within(screen.getByRole('group', { name: 'Nu' })).getByText('Geen bereik')).toBeTruthy()
    expect(screen.getByText(/gaat vanzelf zodra je bereik hebt/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nu syncen' })).toBeNull()
  })

  it('niet offline klaar: uitleg; alles gesynct: een vinkje', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: null } })
    page()
    expect(screen.getByText('Nog niet klaar')).toBeTruthy()
    expect(screen.getByText(/Open de app een keer met bereik/)).toBeTruthy()
    expect(await screen.findByText('Alles is gesynct')).toBeTruthy()
  })

  it('vast bewaren vragen als dat nog niet zo is', async () => {
    const user = userEvent.setup()
    page()
    await user.click(await screen.findByRole('button', { name: 'Bewaar mijn data vast' }))
    expect(persist).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bewaar mijn data vast' })).toBeNull())
  })

  it('niet ingelogd: geen sync-lijst maar uitleg', async () => {
    authStore.set({ user: null, ready: true })
    page()
    expect(screen.getByText(/Log in om je data te bewaren/)).toBeTruthy()
  })
})
