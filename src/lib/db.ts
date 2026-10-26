import Dexie, { type EntityTable } from 'dexie'
import type { AnyRecord } from './types'

export interface BlobRow {
  id: string
  blob: Blob
}

export interface KvRow {
  key: string
  value: unknown
}

class SneeuwDB extends Dexie {
  records!: EntityTable<AnyRecord, 'id'>
  blobs!: EntityTable<BlobRow, 'id'>
  kv!: EntityTable<KvRow, 'key'>

  constructor() {
    super('sneeuw-daddy')
    this.version(1).stores({
      records: 'id, kind, dirty, updatedAt, [kind+updatedAt], trickId, sessionId',
      blobs: 'id',
      kv: 'key',
    })
  }
}

export const db = new SneeuwDB()

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key)
  return row ? (row.value as T) : fallback
}

export async function kvSet(key: string, value: unknown) {
  await db.kv.put({ key, value })
}

/** iOS gooit websitedata na een tijdje weg; vraag om blijvende opslag. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* niet ondersteund */
  }
}
