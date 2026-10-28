import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const crew = vi.hoisted(() => ({ myCrews: vi.fn(), crewFeed: vi.fn(), crewMembers: vi.fn(), reactionsFor: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: { keyKind: 'publishable' } }))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), ...crew }))

import { Toasts } from '../components/Toasts'
import { SyncBadge } from '../components/SyncBadge'
import Crew from '../pages/Crew'
import Settings from '../pages/Settings'
import { toast, undoToast, toastStore } from '../lib/toast'
import { syncStore } from '../lib/sync'
import { authStore } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db, kvSet, type BlobRow } from '../lib/db'
import { create, listKind, remove, restore } from '../lib/repo'
import { plural } from '../lib/format'
import { MediaViewer } from '../components/Media'
import type { MediaMeta } from '../lib/types'
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

  it('feest (level-up) klapt erop als poster-sticker; een gewone melding schuift rustig in', () => {
    render(<Toasts />)
    act(() => {
      toast({ title: 'Level 5', tone: 'level' })
      toast({ title: 'Opgeslagen' })
    })
    expect(screen.getByText('Level 5').closest('[data-tone]')!.className).toContain('slap')
    expect(screen.getByText('Opgeslagen').closest('[data-tone]')!.className).toContain('pop-in')
    act(() => toastStore.set([]))
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

describe('crew naar de skipas', () => {
  it('auteur in de feed en een rij in het leaderboard openen de skipas', async () => {
    online(true)
    crew.myCrews.mockResolvedValue([{ id: 'c1', name: 'Shredheads', invite_code: 'ABC123', created_by: 'me' }])
    crew.crewFeed.mockResolvedValue([
      {
        id: 'd1',
        user_id: 'daan',
        kind: 'session',
        updated_at: '2027-01-16',
        data: { date: '2027-01-16', resortName: 'Tignes', hours: 5, falls: 2, landed: [], mood: 4, mediaIds: [] },
      },
    ])
    crew.crewMembers.mockResolvedValue([
      { user_id: 'daan', display_name: 'Daan', role: 'member', stats: { xp: 300 } },
      { user_id: 'me', display_name: 'Ingmar', role: 'owner', stats: { xp: 100 } },
    ])
    crew.reactionsFor.mockResolvedValue([])
    inRouter(<Crew />)
    expect((await screen.findByText('Tignes')) && screen.getAllByRole('link', { name: /Daan/ })[0].getAttribute('href')).toBe('/rider/daan')
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Leaderboard' }))
    const links = await screen.findAllByRole('link', { name: /Daan/ })
    expect(links.at(-1)!.getAttribute('href')).toBe('/rider/daan')
  })
})

describe('Field', () => {
  it('group: knoppen houden hun eigen naam en een tik op de hint doet niks', async () => {
    const { Field } = await import('../components/ui')
    const onClick = vi.fn()
    render(
      <Field label="Signature trick" hint="Kies er een" group>
        <button onClick={onClick}>Ollie</button>
        <button>Shifty</button>
      </Field>,
    )
    expect(screen.getByRole('group', { name: 'Signature trick' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ollie' })).toBeTruthy()
    await userEvent.setup().click(screen.getByText('Kies er een'))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('media-viewer', () => {
  const clip = (userId: string) =>
    ({ id: 'm1', kind: 'media', type: 'image', mime: 'image/jpeg', userId, createdAt: 0, updatedAt: 0 }) as MediaMeta

  it('bij je eigen clip een knop naar de techniek-check van de coach', () => {
    inRouter(<MediaViewer m={clip('me')} onClose={() => {}} />)
    expect(screen.getByRole('link', { name: /Check techniek/ }).getAttribute('href')).toBe('/coach?media=m1')
  })

  it('niet bij de clip van een ander', () => {
    inRouter(<MediaViewer m={clip('daan')} onClose={() => {}} />)
    expect(screen.queryByRole('link', { name: /Check techniek/ })).toBeNull()
  })
})
