// Trip-film op de trippagina: van de gedeelde clips van de crew een korte montage maken en delen,
// met muziek (tik een stijl om hem te horen) en het geluid van de clips.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Chip, Heading, List, Progress, Sheet, Toggle } from './ui'
import { Icon, Spinner } from '../design/icons'
import { crewMembers } from '../lib/crew'
import { tripDays, tripMedia } from '../lib/crewTrips'
import { canMakeFilm, filmName, looksEmpty, MAX_CLIPS, planFilm, previewMusic, renderFilm, type FilmTrip } from '../lib/tripFilm'
import { TRACK_BY_ID, TRACKS, type TrackId } from '../lib/filmMusic'
import { shareFile } from '../lib/shareCard'
import { errMsg } from '../lib/errors'
import { sfx } from '../lib/sounds'
import type { MediaMeta } from '../lib/types'

type Stage =
  | { kind: 'idle' }
  | { kind: 'busy'; phase: 'laden' | 'opnemen'; done: number }
  | { kind: 'klaar'; blob: Blob; url: string }
  | { kind: 'fout'; msg: string }

export function TripFilm({ tripId, crewId, trip, ready = true }: { tripId: string; crewId: string; trip: FilmTrip; ready?: boolean }) {
  const [media, setMedia] = useState<MediaMeta[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [music, setMusic] = useState<TrackId>('park')
  const [clipAudio, setClipAudio] = useState(true)
  const canvas = useRef<HTMLCanvasElement>(null)
  const abort = useRef<AbortController | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const stopPreview = useRef<(() => void) | null>(null)
  const { startDate, endDate } = trip

  const load = useCallback(async () => {
    if (!navigator.onLine || !ready) return
    try {
      const [mem, days] = await Promise.all([crewMembers(crewId), tripDays(crewId, { startDate, endDate })])
      setNames(Object.fromEntries(mem.map((m) => [m.user_id, m.display_name])))
      setMedia(await tripMedia(crewId, { startDate, endDate }, days))
    } catch {
      setMedia((cur) => cur ?? [])
    }
  }, [crewId, startDate, endDate, ready])

  useEffect(() => {
    void load()
  }, [load])

  // weg van de pagina: geluid uit
  useEffect(
    () => () => {
      stopPreview.current?.()
      void audio.current?.close().catch(() => {})
    },
    [],
  )

  /** iOS laat pas geluid toe na een tik: de AudioContext maken we dus in de tik zelf. */
  function audioCtx(): AudioContext | null {
    if (audio.current) return audio.current
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    audio.current = new AC()
    return audio.current
  }

  function pickMusic(id: TrackId) {
    setMusic(id)
    stopPreview.current?.()
    stopPreview.current = null
    const ctx = id === 'geen' ? null : audioCtx()
    if (ctx) stopPreview.current = previewMusic(ctx, id)
  }

  // film-URL opruimen
  const url = stage.kind === 'klaar' ? stage.url : null
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  if (!canMakeFilm() || media === null || media.length === 0) return null
  const plan = planFilm(media, names, trip, tripId, { bpm: TRACK_BY_ID.get(music)?.bpm })
  const clips = plan.segments.length - 2

  async function make() {
    stopPreview.current?.()
    const ctx = music !== 'geen' || clipAudio ? audioCtx() : null
    void ctx?.resume().catch(() => {})
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setStage({ kind: 'busy', phase: 'laden', done: 0 })
    // even wachten tot de sheet (en het canvas) er staat
    await new Promise((r) => setTimeout(r, 50))
    try {
      const blob = await renderFilm(plan, {
        canvas: canvas.current ?? undefined,
        signal: ctrl.signal,
        music,
        clipAudio,
        audio: ctx,
        onProgress: (p) => setStage({ kind: 'busy', ...p }),
      })
      if (ctrl.signal.aborted) return
      if (looksEmpty(blob)) throw new Error('De film bleef leeg. Hou het scherm aan en blijf in de app tot hij klaar is.')
      sfx.success()
      setStage({ kind: 'klaar', blob, url: URL.createObjectURL(blob) })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setStage({ kind: 'fout', msg: errMsg(e) })
    }
  }

  function close() {
    abort.current?.abort()
    setOpen(false)
    setStage({ kind: 'idle' })
  }

  return (
    <section className="mt-8">
      <Heading>Trip-film</Heading>
      <div className="card p-4">
        <p className="text-[15px] text-muted">
          {clips === 1 ? 'De gedeelde clip' : `${Math.min(clips, MAX_CLIPS)} gedeelde clips en foto's`} van de crew als film van{' '}
          {Math.round(plan.total)} seconden, met titels en muziek erin.
        </p>
        <div className="mb-2 mt-4 text-[15px] font-medium">Muziek</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Muziek">
          <Chip active={music === 'geen'} onClick={() => pickMusic('geen')}>
            Geen
          </Chip>
          {TRACKS.map((t) => (
            <Chip key={t.id} active={music === t.id} onClick={() => pickMusic(t.id)}>
              {t.name}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">Tik een stijl om hem even te horen. De cuts vallen op de beat.</p>
        <List className="mt-3">
          <Toggle
            on={clipAudio}
            onChange={setClipAudio}
            label="Geluid van de clips"
            sub={clipAudio ? 'De muziek gaat zachter als een clip geluid heeft' : 'Alleen muziek'}
          />
        </List>
        <Button
          className="mt-3 w-full"
          icon={<Icon name="video" size={18} />}
          disabled={!navigator.onLine || !ready}
          onClick={() => {
            setOpen(true)
            void make()
          }}
        >
          Maak de film
        </Button>
      </div>

      <Sheet open={open} onClose={close} title="Trip-film" closeLabel={stage.kind === 'busy' ? 'Stop' : 'Klaar'}>
        {stage.kind === 'klaar' ? (
          <video
            src={stage.url}
            controls
            playsInline
            className="mx-auto aspect-[9/16] w-full max-w-[260px] rounded-[6px] bg-block"
            aria-label="Je trip-film"
          />
        ) : (
          <canvas
            ref={canvas}
            width={720}
            height={1280}
            className="mx-auto block aspect-[9/16] w-full max-w-[260px] rounded-[6px] bg-block"
            aria-label="Voorbeeld van de film"
          />
        )}

        {stage.kind === 'busy' && (
          <div className="mt-4" aria-live="polite">
            <div className="mb-2 flex items-center gap-2 text-[15px]">
              <Spinner size={14} />
              {stage.phase === 'laden' ? 'Clips ophalen' : 'Film maken'} · <span className="num">{Math.round(stage.done * 100)}%</span>
            </div>
            <Progress value={stage.done} />
            <p className="mt-2 text-[13px] text-muted">
              Hou het scherm aan en blijf hier tot hij klaar is; hij wordt in echte tijd gemaakt.
            </p>
          </div>
        )}

        {stage.kind === 'fout' && (
          <p role="alert" className="mt-4 text-[15px] text-danger">
            {stage.msg}
          </p>
        )}

        <div className="mb-6 mt-5 flex gap-2">
          {stage.kind === 'klaar' && (
            <Button
              className="flex-1"
              icon={<Icon name="share" size={18} />}
              onClick={() => void shareFile(stage.blob, filmName(trip, stage.blob.type), trip.name)}
            >
              Deel
            </Button>
          )}
          {(stage.kind === 'klaar' || stage.kind === 'fout') && (
            <Button variant="ghost" className="flex-1" icon={<Icon name="replay" size={18} />} onClick={() => void make()}>
              Opnieuw
            </Button>
          )}
        </div>
      </Sheet>
    </section>
  )
}
