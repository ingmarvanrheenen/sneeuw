// Trip-film op de trippagina: van de gedeelde clips van de crew een korte montage maken en delen,
// met muziek (tik een stijl om hem te horen) en het geluid van de clips.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Chip, Heading, List, Progress, Row, Sheet, Toggle, cx } from './ui'
import { MediaThumb, MediaViewer } from './Media'
import { useLiveQuery } from 'dexie-react-hooks'
import { kvGet, kvSet } from '../lib/db'
import { Icon, Spinner } from '../design/icons'
import { crewMembers } from '../lib/crew'
import { tripDays, tripMedia } from '../lib/crewTrips'
import {
  canMakeFilm,
  filmable,
  filmName,
  looksEmpty,
  MAX_CLIPS,
  pickClips,
  planFilm,
  previewMusic,
  renderFilm,
  saveFilm,
  savedFilms,
  type FilmTrip,
} from '../lib/tripFilm'
import { TRACK_BY_ID, TRACKS, type TrackId } from '../lib/filmMusic'
import { drawFrame, FILM_STYLES, isFilmStyle, type FilmStyle } from '../lib/tripFilm'
import { loadBracket, layout } from '../lib/tournament'
import { fontsReady } from '../lib/shareCard'
import { shareFile } from '../lib/shareCard'
import { errMsg } from '../lib/errors'
import { sfx } from '../lib/sounds'
import type { MediaMeta } from '../lib/types'

type Stage =
  | { kind: 'idle' }
  | { kind: 'busy'; phase: 'laden' | 'opnemen'; done: number }
  | { kind: 'klaar'; blob: Blob; url: string; saved?: boolean }
  | { kind: 'fout'; msg: string }

export function TripFilm({ tripId, crewId, trip, ready = true }: { tripId: string; crewId: string; trip: FilmTrip; ready?: boolean }) {
  const [media, setMedia] = useState<MediaMeta[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const thumb = useRef<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [watching, setWatching] = useState<MediaMeta | null>(null)
  const films = useLiveQuery(() => savedFilms(tripId), [tripId])
  const [music, setMusic] = useState<TrackId>('park')
  const [clipAudio, setClipAudio] = useState(true)
  const [style, setStyle] = useState<FilmStyle>('park')
  const [champion, setChampion] = useState<string | null>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  /** eigen keuze van clips (ids), per trip onthouden op dit toestel; null = automatisch */
  const [pick, setPick] = useState<string[] | null>(null)
  const [choosing, setChoosing] = useState(false)
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
      // winnaar van het toernooi: die opent de film
      const b = await loadBracket(tripId).catch(() => null)
      setChampion(b?.bracket ? layout(b.bracket.entries, b.votes, Math.max(1, mem.length)).champion : null)
    } catch {
      setMedia((cur) => cur ?? [])
    }
  }, [crewId, tripId, startDate, endDate, ready])

  useEffect(() => {
    void load()
  }, [load])

  // laatst gekozen stijl
  useEffect(() => {
    void kvGet<string>('film:style', 'park').then((s) => isFilmStyle(s) && setStyle(s))
  }, [])
  function pickStyle(s: FilmStyle) {
    setStyle(s)
    void kvSet('film:style', s)
  }

  const pickKey = `filmPick:${tripId}`
  useEffect(() => {
    void kvGet<string[] | null>(pickKey, null).then(setPick)
  }, [pickKey])
  function savePick(ids: string[] | null) {
    setPick(ids)
    void kvSet(pickKey, ids)
  }

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

  // voorbeeld van de intro in de gekozen stijl
  const introTitle = trip.name || trip.resortName || 'De trip'
  useEffect(() => {
    const c = preview.current?.getContext('2d')
    if (!c) return
    let alive = true
    void fontsReady().then(
      () => alive && drawFrame(c, { kind: 'intro', dur: 1, title: introTitle, sub: trip.resortName ?? '' }, 0.9, {}, style),
    )
    return () => {
      alive = false
    }
  }, [style, introTitle, trip.resortName, media])

  if (!canMakeFilm() || media === null || media.length === 0) return null
  const plan = planFilm(media, names, trip, tripId, { bpm: TRACK_BY_ID.get(music)?.bpm, pick, opener: champion })
  const opens = plan.segments.some((s) => s.kind === 'clip' && s.opener)
  const all = filmable(media)
  const chosen = pickClips(media, tripId, pick).map((m) => m.id)
  // wat jij koos (en nog bestaat); null = automatisch. Leeg gekozen = in de film toch automatisch.
  const ownIds = pick ? all.filter((m) => pick.includes(m.id)).map((m) => m.id) : null
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
        style,
        clipAudio,
        audio: ctx,
        onProgress: (p) => setStage({ kind: 'busy', ...p }),
        onThumb: (t) => (thumb.current = t),
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

  async function save(s: Extract<Stage, { kind: 'klaar' }>) {
    setSaving(true)
    try {
      await saveFilm(s.blob, { ...trip, id: tripId }, thumb.current)
      sfx.success()
      setStage({ ...s, saved: true })
    } catch (e) {
      setStage({ kind: 'fout', msg: errMsg(e) })
    } finally {
      setSaving(false)
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
        <div className="mb-2 mt-4 text-[15px] font-medium">Stijl</div>
        <div className="flex items-center gap-3">
          <canvas ref={preview} width={720} height={1280} aria-hidden className="aspect-[9/16] w-[64px] shrink-0 rounded-[4px] bg-block" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Stijl">
              {FILM_STYLES.map((s) => (
                <Chip key={s.id} active={style === s.id} onClick={() => pickStyle(s.id)}>
                  {s.name}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-muted">{FILM_STYLES.find((s) => s.id === style)!.blurb}</p>
          </div>
        </div>
        {opens && <p className="mt-3 text-[13px] text-muted">De film opent met de clip van de trip: de winnaar van het toernooi.</p>}
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
          <Row
            icon="video"
            title="Clips"
            detail={ownIds?.length ? `Jouw keuze: ${chosen.length}` : `Automatisch: ${chosen.length} van ${all.length}`}
            onClick={() => setChoosing(true)}
          />
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
        {!!films?.length && (
          <div className="mt-4">
            <div className="mb-2 text-[13px] text-muted">In je kluis</div>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {films.map((f) => (
                <MediaThumb
                  key={f.id}
                  m={f}
                  onClick={() => setWatching(f)}
                  label={`Bekijk ${f.caption ?? 'trip-film'}`}
                  className="aspect-[9/16] w-20 shrink-0"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <ClipPicker
        open={choosing}
        onClose={() => setChoosing(false)}
        media={all}
        names={names}
        selected={ownIds ?? chosen}
        own={ownIds !== null}
        onChange={savePick}
      />

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

        {stage.kind === 'klaar' && (
          <Button
            variant={stage.saved ? 'ghost' : 'primary'}
            className="mt-5 w-full"
            icon={<Icon name={stage.saved ? 'check' : 'vault'} size={18} />}
            disabled={stage.saved || saving}
            onClick={() => void save(stage)}
          >
            {stage.saved ? 'In je kluis' : 'Bewaar in je kluis'}
          </Button>
        )}
        <div className="mb-6 mt-2 flex gap-2">
          {stage.kind === 'klaar' && (
            <Button
              variant="ghost"
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
      <MediaViewer m={watching} onClose={() => setWatching(null)} />
    </section>
  )
}

/** Zelf kiezen welke clips in de film komen: aantikken (max 8), op volgorde van de trip. */
function ClipPicker({
  open,
  onClose,
  media,
  names,
  selected,
  own,
  onChange,
}: {
  open: boolean
  onClose: () => void
  media: MediaMeta[]
  names: Record<string, string>
  selected: string[]
  own: boolean
  onChange: (ids: string[] | null) => void
}) {
  const full = selected.length >= MAX_CLIPS
  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : full ? selected : [...selected, id]
    onChange(next)
  }
  // nummers op volgorde van de trip (zo staan ze in de film)
  const order = media.filter((m) => selected.includes(m.id)).map((m) => m.id)
  return (
    <Sheet open={open} onClose={onClose} title="Clips voor de film">
      <p className="mb-3 text-[15px] text-muted">
        {own ? `${selected.length} van max ${MAX_CLIPS} gekozen.` : `De app koos er ${selected.length}; tik om zelf te kiezen.`} Ze komen op
        volgorde van de trip in de film.
      </p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Clips">
        {media.map((m) => {
          const at = order.indexOf(m.id)
          const on = at >= 0
          const who = names[m.userId ?? ''] ?? 'Iemand'
          return (
            <div key={m.id} className="relative">
              <MediaThumb
                m={m}
                onClick={() => toggle(m.id)}
                pressed={on}
                disabled={!on && full}
                label={`${m.type === 'video' ? 'Clip' : 'Foto'} van ${who}`}
                className={cx('aspect-[4/5] w-full disabled:opacity-40', on && 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--bg)]')}
              />
              {on && (
                <span
                  aria-hidden
                  className="display num pointer-events-none absolute left-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-accent text-[17px] text-accent-ink"
                >
                  {at + 1}
                </span>
              )}
              <span className="mt-1 block truncate text-[12px] text-muted">{who}</span>
            </div>
          )
        })}
      </div>
      {own && !selected.length && <p className="mt-3 text-[13px] text-muted">Niks gekozen: dan kiest de app weer.</p>}
      <div className="mb-6 mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1" icon={<Icon name="sparkle" size={18} />} disabled={!own} onClick={() => onChange(null)}>
          Automatisch
        </Button>
        <Button variant="ghost" className="flex-1" disabled={!selected.length} onClick={() => onChange([])}>
          Niks
        </Button>
      </div>
    </Sheet>
  )
}
