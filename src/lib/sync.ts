// Offline-first sync. Lokaal (IndexedDB) is altijd de waarheid voor de UI;
// deze module pusht wijzigingen naar Supabase en haalt die van je andere apparaten op.
// Conflicten: laatste wijziging wint (op basis van updatedAt van de client).
import { db, kvGet, kvSet } from './db'
import { supabase, MEDIA_BUCKET } from './supabase'
import { getCurrentUserId } from './auth-state'
import { createStore } from './store'
import { setOnLocalChange } from './repo'
import type { AnyRecord, MediaMeta, Profile } from './types'
import { errMsg } from './errors'
import { toast } from './toast'

export interface SyncState {
  status: 'local' | 'idle' | 'syncing' | 'offline' | 'error'
  pending: number
  lastSync?: number
  error?: string
}

export const syncStore = createStore<SyncState>({ status: supabase ? 'idle' : 'local', pending: 0 })

interface RemoteRow {
  id: string
  user_id: string
  kind: string
  data: AnyRecord
  crew_id: string | null
  deleted: boolean
  client_updated_at: number
  updated_at: string
}

let running = false
let again = false
let timer: ReturnType<typeof setTimeout> | null = null

async function countPending() {
  return db.records.where('dirty').equals(1).count()
}

export async function refreshPending() {
  const pending = await countPending()
  syncStore.set((s) => ({ ...s, pending }))
}

function extFor(mime: string) {
  if (mime.includes('quicktime')) return 'mov'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webm')) return 'webm'
  return 'jpg'
}

/** Lege bestanden zijn niet te redden: opruimen in plaats van de hele sync te blokkeren. */
class EmptyMedia extends Error {}

async function uploadMedia(m: MediaMeta, userId: string): Promise<MediaMeta> {
  if (!supabase || m.path) return m
  const row = await db.blobs.get(m.id)
  if (!row) return m
  // Echt uitlezen: Safari kan een opgeslagen bestand een grootte geven terwijl er geen bytes meer achter zitten.
  let bytes: ArrayBuffer
  try {
    bytes = await row.blob.arrayBuffer()
  } catch {
    throw new EmptyMedia(m.id)
  }
  if (!bytes.byteLength) throw new EmptyMedia(m.id)
  const path = `${userId}/${m.id}.${extFor(m.mime)}`
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, new Blob([bytes], { type: m.mime }), { contentType: m.mime, upsert: true })
  if (error && /no content provided/i.test(error.message)) throw new EmptyMedia(m.id)
  if (error) throw error
  const next = { ...m, path, uploaded: true }
  await db.records.put(next)
  return next
}

function toRow(r: AnyRecord, userId: string) {
  const { dirty: _dirty, ...data } = r
  void _dirty
  return {
    id: r.id,
    user_id: userId,
    kind: r.kind,
    data,
    crew_id: r.crewId ?? null,
    deleted: !!r.deleted,
    client_updated_at: r.updatedAt,
  }
}

let emptyMediaRemoved = 0

async function push(userId: string) {
  if (!supabase) return
  let mediaError: unknown = null
  const dirty = (await db.records.where('dirty').equals(1).toArray()).filter((r) => r.userId === userId)
  for (let i = 0; i < dirty.length; i += 50) {
    const batch: AnyRecord[] = []
    for (let r of dirty.slice(i, i + 50)) {
      if (r.kind === 'media' && !r.deleted) {
        try {
          r = await uploadMedia(r, userId)
        } catch (e) {
          if (e instanceof EmptyMedia) {
            // leeg bestand: weghalen (zacht), zodat de rest gewoon synct
            await db.blobs.delete(r.id)
            r = { ...r, deleted: true, updatedAt: Date.now() }
            await db.records.put(r)
            emptyMediaRemoved++
          } else {
            // deze upload later opnieuw; de andere records gaan wel door
            mediaError ??= e
            continue
          }
        }
      }
      batch.push(r)
    }
    const { error } = await supabase.from('records').upsert(batch.map((r) => toRow(r, userId)))
    if (error) throw error
    // Alleen schoon markeren als er intussen niks lokaal veranderd is.
    await db.transaction('rw', db.records, async () => {
      for (const r of batch) {
        const cur = await db.records.get(r.id)
        if (cur && cur.updatedAt === r.updatedAt) await db.records.update(r.id, { dirty: 0 })
      }
    })
  }
  if (mediaError) throw mediaError
}

async function pull(userId: string) {
  if (!supabase) return
  let cursor = await kvGet<string>(`pullCursor:${userId}`, '1970-01-01T00:00:00Z')
  for (;;) {
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .eq('user_id', userId)
      .gt('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .limit(500)
    if (error) throw error
    const rows = (data ?? []) as RemoteRow[]
    if (!rows.length) break
    await db.transaction('rw', db.records, async () => {
      for (const row of rows) {
        const local = await db.records.get(row.id)
        if (!local || !local.dirty || row.client_updated_at > local.updatedAt) {
          await db.records.put({ ...row.data, deleted: row.deleted, dirty: 0 } as AnyRecord)
        }
      }
    })
    cursor = rows[rows.length - 1].updated_at
    await kvSet(`pullCursor:${userId}`, cursor)
    if (rows.length < 500) break
  }
}

/** Stats voor je crew (leaderboard) gaan mee met je profiel. */
let statsProvider: (() => Promise<Record<string, unknown>>) | null = null
export function setStatsProvider(fn: () => Promise<Record<string, unknown>>) {
  statsProvider = fn
}

async function pushProfile(userId: string) {
  if (!supabase) return
  const profile = await kvGet<Profile | null>('profile', null)
  const dirty = await kvGet('profileDirty', true)
  const stats = statsProvider ? await statsProvider() : {}
  const statsKey = JSON.stringify(stats)
  if (!dirty && statsKey === (await kvGet('lastStats', ''))) return
  const { error } = await supabase.from('profiles').upsert({
    user_id: userId,
    display_name: profile?.displayName || 'Rider',
    data: profile ?? {},
    stats,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  await kvSet('profileDirty', false)
  await kvSet('lastStats', statsKey)
}

async function pullProfile(userId: string) {
  if (!supabase) return
  const local = await kvGet<Profile | null>('profile', null)
  if (local?.displayName) return
  const { data } = await supabase.from('profiles').select('data, display_name').eq('user_id', userId).maybeSingle()
  if (data?.data) await kvSet('profile', { ...data.data, displayName: data.display_name })
}

export async function syncNow(): Promise<void> {
  const userId = getCurrentUserId()
  if (!supabase || !userId) {
    await refreshPending()
    return
  }
  if (!navigator.onLine) {
    syncStore.set((s) => ({ ...s, status: 'offline' }))
    await refreshPending()
    return
  }
  if (running) {
    again = true
    return
  }
  running = true
  syncStore.set((s) => ({ ...s, status: 'syncing' }))
  try {
    await push(userId)
    await pull(userId)
    await pullProfile(userId)
    await pushProfile(userId)
    syncStore.set({ status: 'idle', pending: await countPending(), lastSync: Date.now() })
    if (emptyMediaRemoved) {
      toast({
        title: emptyMediaRemoved === 1 ? 'Eén clip was leeg' : `${emptyMediaRemoved} clips waren leeg`,
        body: 'Die is weggehaald zodat de rest kon syncen. Voeg hem opnieuw toe.',
        icon: 'alert',
      })
      emptyMediaRemoved = 0
    }
  } catch (e) {
    const msg = errMsg(e)
    syncStore.set({ status: 'error', pending: await countPending(), error: msg, lastSync: syncStore.get().lastSync })
  } finally {
    running = false
    if (again) {
      again = false
      scheduleSync(500)
    }
  }
}

export function scheduleSync(delay = 1500) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

export function startSync() {
  setOnLocalChange(() => {
    void refreshPending()
    scheduleSync()
  })
  window.addEventListener('online', () => scheduleSync(200))
  window.addEventListener('offline', () => syncStore.set((s) => ({ ...s, status: 'offline' })))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(300)
  })
  setInterval(() => void syncNow(), 5 * 60 * 1000)
  scheduleSync(300)
}

// ── Media ophalen ──────────────────────────────────────────────────────────

const urlCache = new Map<string, string>()

/** Geeft een bruikbare URL voor een media-item: lokaal blob of signed URL uit de cloud. */
export async function mediaUrl(m: MediaMeta): Promise<string | null> {
  const cached = urlCache.get(m.id)
  if (cached) return cached
  const row = await db.blobs.get(m.id)
  if (row) {
    const url = URL.createObjectURL(row.blob)
    urlCache.set(m.id, url)
    return url
  }
  if (!supabase || !m.path) return null
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(m.path, 60 * 60 * 6)
  if (!data?.signedUrl) return null
  urlCache.set(m.id, data.signedUrl)
  // Foto's van jezelf lokaal cachen zodat ze offline werken.
  if (m.type === 'image' && m.userId === getCurrentUserId()) {
    fetch(data.signedUrl)
      .then((r) => r.blob())
      .then((blob) => db.blobs.put({ id: m.id, blob }))
      .catch(() => {})
  }
  return data.signedUrl
}
