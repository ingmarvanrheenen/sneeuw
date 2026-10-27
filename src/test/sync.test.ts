import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<(typeof import('./fakeSupabase'))['fakeSupabase']> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true, MEDIA_BUCKET: 'media' }
})

import { db, type BlobRow } from '../lib/db'
import { setCurrentUserId } from '../lib/auth-state'
import { create } from '../lib/repo'
import { syncNow, syncStore } from '../lib/sync'
import { toastStore } from '../lib/toast'
import type { MediaMeta, Session } from '../lib/types'
import { EMPTY_DRAFT } from '../lib/sessions'

const fake = () => sb.ref!
const ME = 'user-me'

// fake-indexeddb bewaart geen echte Blobs; in deze tests houden we ze in het geheugen
const blobs = new Map<string, Blob>()
beforeEach(async () => {
  fake().reset()
  setCurrentUserId(ME)
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  await db.records.clear()
  await db.kv.clear()
  blobs.clear()
  vi.spyOn(db.blobs, 'get').mockImplementation((async (id: string) => (blobs.has(id) ? { id, blob: blobs.get(id)! } : undefined)) as never)
  vi.spyOn(db.blobs, 'put').mockImplementation((async (row: BlobRow) => (blobs.set(row.id, row.blob), row.id)) as never)
  vi.spyOn(db.blobs, 'delete').mockImplementation((async (id: string) => void blobs.delete(id)) as never)
  toastStore.set([])
})
afterEach(() => vi.restoreAllMocks())

async function dayWithMedia(blob: Blob) {
  const s = (await create('session', { ...EMPTY_DRAFT, resortName: 'Tignes' })) as Session
  const m = (await create('media', { type: 'video', mime: 'video/quicktime', sessionId: s.id, crewId: null })) as MediaMeta
  blobs.set(m.id, blob)
  return { s, m }
}

const upserted = () =>
  fake()
    .calls.filter((c) => c.table === 'records' && c.op === 'upsert')
    .flatMap((c) => c.payload as { id: string; deleted: boolean; data: { path?: string } }[])

describe('sync en media', () => {
  it('uploadt een gewone clip en zet het pad in het record', async () => {
    const { s, m } = await dayWithMedia(new Blob(['echte bytes'], { type: 'video/quicktime' }))
    await syncNow()
    const upload = fake().calls.find((c) => c.op === 'upload')!
    expect((upload.payload as { path: string }).path).toBe(`${ME}/${m.id}.mov`)
    expect(
      upserted()
        .map((r) => r.id)
        .sort(),
    ).toEqual([s.id, m.id].sort())
    expect(upserted().find((r) => r.id === m.id)?.data.path).toBe(`${ME}/${m.id}.mov`)
    expect(syncStore.get().status).toBe('idle')
    expect(syncStore.get().pending).toBe(0)
  })

  it('leeg bestand: clip wordt opgeruimd en de rest synct gewoon (iOS-bug)', async () => {
    const { s, m } = await dayWithMedia(new Blob([], { type: 'video/quicktime' }))
    await syncNow()
    expect(fake().calls.some((c) => c.op === 'upload')).toBe(false)
    expect(upserted().find((r) => r.id === s.id)?.deleted).toBe(false)
    expect(upserted().find((r) => r.id === m.id)?.deleted).toBe(true)
    expect(syncStore.get().status).toBe('idle')
    expect(toastStore.get().some((t) => t.title === 'Eén clip was leeg')).toBe(true)
  })

  it('bestand met grootte maar zonder bytes (Safari): ook opgeruimd', async () => {
    const ghost = new Blob(['1234567890123'], { type: 'video/quicktime' })
    Object.defineProperty(ghost, 'arrayBuffer', { value: async () => new ArrayBuffer(0) })
    const { m } = await dayWithMedia(ghost)
    await syncNow()
    expect(upserted().find((r) => r.id === m.id)?.deleted).toBe(true)
    expect(syncStore.get().status).toBe('idle')
  })

  it("Storage zegt 'No content provided': ook als leeg behandeld", async () => {
    const { m } = await dayWithMedia(new Blob(['x'], { type: 'video/quicktime' }))
    fake().respond((c) => (c.op === 'upload' ? { error: { message: 'No content provided', name: 'InvalidRequest' } } : { data: [] }))
    await syncNow()
    expect(upserted().find((r) => r.id === m.id)?.deleted).toBe(true)
    expect(syncStore.get().status).toBe('idle')
  })

  it('onthoudt per trip met welke crew hij op de server staat', async () => {
    const t = await create('trip', { name: 'Wintersport', packing: [], crewId: 'c1' })
    await syncNow()
    expect((await db.kv.get(`tripCrew:${t.id}`))?.value).toBe('c1')
  })

  it('andere uploadfout: dag synct wel, clip wacht en de fout is zichtbaar', async () => {
    const { s, m } = await dayWithMedia(new Blob(['x'], { type: 'video/quicktime' }))
    fake().respond((c) => (c.op === 'upload' ? { error: { message: 'Netwerk weg' } } : { data: [] }))
    await syncNow()
    expect(upserted().map((r) => r.id)).toEqual([s.id])
    expect((await db.records.get(m.id))?.dirty).toBe(1)
    expect((await db.records.get(s.id))?.dirty).toBe(0)
    expect(syncStore.get().status).toBe('error')
    expect(syncStore.get().pending).toBe(1)
  })
})
