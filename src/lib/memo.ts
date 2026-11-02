// Spraakmemo's bij je dag: kort inspreken na een run of in de lift. Een memo is een media-record met
// type 'audio', dus upload, sync en delen met je crew gaan zoals bij foto's en video's (geen migratie).
// Een memo zonder dag (ingesproken voordat je de dag logde) komt vanzelf bij de dag van die datum.
import { db } from './db'
import { create, update } from './repo'
import { todayISO, uid } from './ids'
import type { MediaMeta } from './types'

/** max lengte van één memo, in seconden */
export const MEMO_MAX_S = 60

export const isMemo = (m: Pick<MediaMeta, 'type'>) => m.type === 'audio'
/** Foto's en video's: alles behalve memo's (voor grids, thumbnails, toernooi en coach). */
export const isVisual = (m: Pick<MediaMeta, 'type'>) => m.type !== 'audio'

/** "0:07", "1:00" */
export function fmtDuration(s: number | undefined): string {
  const t = Math.max(0, Math.round(s ?? 0))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** Welk formaat de browser kan opnemen. Safari op de iPhone: audio/mp4; Chrome en Firefox: webm/opus. */
export function pickAudioMime(supports: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'])
    try {
      if (supports(t)) return t
    } catch {
      // oudere Safari gooit hier soms
    }
  return ''
}

export const canRecord = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

/** Foutmelding van de microfoon in gewone taal. */
export function micError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Geen toegang tot je microfoon. Zet hem aan bij Instellingen > Safari > Microfoon (of tik op aA in de adresbalk).'
  if (name === 'NotFoundError') return 'Geen microfoon gevonden.'
  return 'Opnemen lukte niet. Probeer het nog een keer.'
}

export interface Recording {
  /** stoppen en het resultaat ophalen */
  stop: () => Promise<{ blob: Blob; mime: string; duration: number }>
  /** weggooien zonder opslaan */
  cancel: () => void
}

/** Opname starten. Gooit als je geen toegang tot de microfoon geeft. */
export async function startRecording(now: () => number = Date.now): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mime = pickAudioMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const started = now()
  const release = () => stream.getTracks().forEach((t) => t.stop())
  rec.start(1000)
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release()
          const type = rec.mimeType || mime || 'audio/mp4'
          resolve({ blob: new Blob(chunks, { type }), mime: type.split(';')[0], duration: Math.min(MEMO_MAX_S, (now() - started) / 1000) })
        }
        if (rec.state === 'inactive') rec.onstop(new Event('stop'))
        else rec.stop()
      }),
    cancel: () => {
      rec.onstop = null
      if (rec.state !== 'inactive') rec.stop()
      release()
    },
  }
}

/** Memo opslaan: bij een dag (sessionId) of los, dan komt hij bij de dag als je die logt. */
export async function saveMemo(
  rec: { blob: Blob; mime: string; duration: number },
  link: { sessionId?: string; crewId?: string | null },
): Promise<MediaMeta | null> {
  // te kort om iets te zeggen (per ongeluk getikt) of leeg: niet bewaren
  if (rec.duration < 0.8 || !rec.blob.size) return null
  const id = uid()
  // echte bytes erin, zoals bij foto's (Safari kan een verwijzing anders leeg laten)
  await db.blobs.put({ id, blob: new Blob([await rec.blob.arrayBuffer()], { type: rec.mime }) })
  return create('media', {
    id,
    type: 'audio',
    mime: rec.mime,
    size: rec.blob.size,
    duration: Math.round(rec.duration * 10) / 10,
    ...(link.sessionId ? { sessionId: link.sessionId } : {}),
    crewId: link.crewId ?? null,
  })
}

/** Memo's die nog niet bij een dag horen, van een bepaalde datum (lokale tijd). */
export async function looseMemos(date = todayISO()): Promise<MediaMeta[]> {
  const all = (await db.records.where('kind').equals('media').toArray()) as MediaMeta[]
  return all.filter((m) => !m.deleted && isMemo(m) && !m.sessionId && todayISO(new Date(m.createdAt)) === date)
}

/** Losse memo's van die datum bij de (nieuwe) dag hangen. */
export async function adoptMemos(sessionId: string, date: string, crewId: string | null): Promise<number> {
  const loose = await looseMemos(date)
  for (const m of loose) await update(m, { sessionId, crewId })
  return loose.length
}
