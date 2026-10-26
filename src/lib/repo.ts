import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { uid } from './ids'
import { getCurrentUserId } from './auth-state'
import type { AnyRecord, RecordKind, Session, TrickProgress, Goal, Trip, Gear, MediaMeta } from './types'

type KindMap = {
  session: Session
  trick: TrickProgress
  goal: Goal
  trip: Trip
  gear: Gear
  media: MediaMeta
}

type NewRecord<K extends RecordKind> = Omit<KindMap[K], 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'kind'> & {
  id?: string
}

let onChange: (() => void) | null = null
/** Sync-engine registreert zich hier zodat wijzigingen snel gepusht worden. */
export function setOnLocalChange(fn: () => void) {
  onChange = fn
}

export async function create<K extends RecordKind>(kind: K, data: NewRecord<K>): Promise<KindMap[K]> {
  const now = Date.now()
  const rec = {
    ...data,
    id: data.id ?? uid(),
    kind,
    userId: getCurrentUserId(),
    createdAt: now,
    updatedAt: now,
    dirty: 1,
  } as unknown as KindMap[K]
  await db.records.put(rec)
  onChange?.()
  return rec
}

export async function update<T extends AnyRecord>(rec: T, patch: Partial<T>): Promise<T> {
  const next = { ...rec, ...patch, updatedAt: Date.now(), dirty: 1 as const }
  await db.records.put(next)
  onChange?.()
  return next
}

export async function remove(rec: AnyRecord) {
  await update(rec, { deleted: true } as Partial<AnyRecord>)
  if (rec.kind === 'media') await db.blobs.delete(rec.id)
}

export async function listKind<K extends RecordKind>(kind: K): Promise<KindMap[K][]> {
  const rows = await db.records.where('kind').equals(kind).toArray()
  return rows.filter((r) => !r.deleted) as KindMap[K][]
}

export function useKind<K extends RecordKind>(kind: K): KindMap[K][] | undefined {
  return useLiveQuery(() => listKind(kind), [kind])
}

export function useRecord<K extends RecordKind>(kind: K, id: string | undefined): KindMap[K] | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null
    const r = await db.records.get(id)
    return r && r.kind === kind && !r.deleted ? (r as KindMap[K]) : null
  }, [kind, id])
}

export function sessionsSorted(list: Session[]) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

export async function getTrickProgress(trickId: string): Promise<TrickProgress | undefined> {
  const rows = await db.records.where('trickId').equals(trickId).toArray()
  return rows.find((r) => r.kind === 'trick' && !r.deleted) as TrickProgress | undefined
}

/** Zet trick-status; maakt het record aan als het nog niet bestaat. */
export async function setTrickStatus(
  trickId: string,
  status: TrickProgress['status'],
  extra: Partial<TrickProgress> = {},
): Promise<TrickProgress> {
  const existing = await getTrickProgress(trickId)
  const landedNow = (status === 'geland' || status === 'beheerst') && !existing?.firstLandedAt
  const firstLandedAt = landedNow ? new Date().toISOString().slice(0, 10) : existing?.firstLandedAt
  if (existing) return update(existing, { status, firstLandedAt, ...extra })
  return create('trick', { trickId, status, firstLandedAt, mediaIds: [], ...extra })
}
