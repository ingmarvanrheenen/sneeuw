// Offline-check: wat er nog moet syncen (per soort), en of de app offline klaarstaat op dit toestel.
import { db } from './db'
import type { AnyRecord, MediaMeta } from './types'

const LABELS: Record<string, [string, string]> = {
  session: ['dag', 'dagen'],
  trick: ['trick', 'tricks'],
  goal: ['doel', 'doelen'],
  trip: ['trip', 'trips'],
  gear: ['stuk gear', 'stuks gear'],
  media: ['foto of clip', "foto's en clips"],
}

export interface Waiting {
  kind: string
  label: string
  n: number
}

/** Wat er nog naar de server moet: gewijzigde records per soort, en bestanden die nog niet geüpload zijn. */
export function waitingOf(records: AnyRecord[], blobIds: Set<string>): { items: Waiting[]; files: number; total: number } {
  const counts = new Map<string, number>()
  for (const r of records) if (r.dirty) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
  const items = [...counts.entries()]
    .map(([kind, n]) => ({ kind, n, label: `${n} ${(LABELS[kind] ?? [kind, kind])[n === 1 ? 0 : 1]}` }))
    .sort((a, b) => b.n - a.n)
  // een bestand wacht als het op dit toestel staat maar nog geen plek in de cloud heeft
  const files = records.filter((r): r is MediaMeta => r.kind === 'media' && !r.deleted && !r.path && blobIds.has(r.id)).length
  return { items, files, total: items.reduce((a, x) => a + x.n, 0) }
}

export async function loadWaiting() {
  const [records, blobKeys] = await Promise.all([db.records.toArray(), db.blobs.toCollection().primaryKeys()])
  return waitingOf(records as AnyRecord[], new Set(blobKeys as string[]))
}

/** Staat de app offline klaar? Een service worker bedient de pagina (dan laadt hij ook zonder bereik). */
export const appCached = () => typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller

/** Blijft je data bewaard als je telefoon ruimte zoekt? */
export async function storagePersisted(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null
  } catch {
    return null
  }
}

export async function askPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
