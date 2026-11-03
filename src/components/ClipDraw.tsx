// Tekenen op je clip: kies het frame, teken lijnen, pijlen, hoeken (met graden) of vrij, en bewaar het als foto
// bij dezelfde dag of trick, of deel het. Speel de clip af in slow-motion, zet er een tweede clip onder (toen en
// nu, met dezelfde lijnen op allebei), of stuur het frame naar de coach. Alles op het toestel.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Icon } from '../design/icons'
import { cx } from './ui'
import { MediaThumb } from './Media'
import { mediaUrl } from '../lib/sync'
import { addMediaFiles } from '../lib/media'
import { shareFile } from '../lib/shareCard'
import {
  drawShapes,
  exportCompare,
  exportSketch,
  INKS,
  nextRate,
  rateLabel,
  thin,
  toBase,
  toImage,
  tooShort,
  TOOLS,
  type Pt,
  type Shape,
  type Tool,
} from '../lib/sketch'
import { isVisual } from '../lib/memo'
import { db } from '../lib/db'
import { getCurrentUserId } from '../lib/auth-state'
import { fmtShort } from '../lib/format'
import { todayISO } from '../lib/ids'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'
import type { MediaMeta } from '../lib/types'

const FPS = 30
type Size = { width: number; height: number }

interface PaneApi {
  el: () => HTMLVideoElement | HTMLImageElement | null
  size: Size | null
  time: () => number
}

export function ClipDraw({ m, onClose, onAskCoach }: { m: MediaMeta; onClose: () => void; onAskCoach?: (at: number | null) => void }) {
  const [base, setBase] = useState<Size | null>(null)
  const [tool, setTool] = useState<Tool>('hoek')
  const [ink, setInk] = useState<string>(INKS[0].hex)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Pt[]>([])
  const [busy, setBusy] = useState(false)
  const [other, setOther] = useState<MediaMeta | null>(null)
  const [otherSize, setOtherSize] = useState<Size | null>(null)
  const [picking, setPicking] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(0.5)
  const drag = useRef<Pt[] | null>(null)
  const [, rerender] = useState(0)
  const paneA = useRef<PaneApi | null>(null)
  const paneB = useRef<PaneApi | null>(null)
  const hasVideo = m.type === 'video' || other?.type === 'video'

  // toen en nu: de oudste heet toen
  const label = (x: MediaMeta) => {
    const when = fmtShort(todayISO(new Date(x.createdAt)))
    if (!other) return when
    const older = x.createdAt <= (x.id === m.id ? other.createdAt : m.createdAt)
    return `${older ? 'Toen' : 'Nu'} · ${when}`
  }

  function down(p: Pt) {
    if (!base) return
    if (tool === 'hoek') {
      const next = [...draft, p]
      if (next.length === 3) {
        setShapes((s) => [...s, { kind: 'hoek', a: next[0], b: next[1], c: next[2], color: ink }])
        setDraft([])
        sfx.tap()
      } else setDraft(next)
      return
    }
    drag.current = [p]
  }
  function move(p: Pt) {
    if (!drag.current) return
    drag.current.push(p)
    rerender((n) => n + 1)
  }
  function up() {
    const d = drag.current
    drag.current = null
    if (!d || !base) return
    const min = Math.min(base.width, base.height)
    if (tool === 'vrij') {
      const pts = thin(d, min * 0.004)
      if (pts.length > 1) setShapes((s) => [...s, { kind: 'vrij', pts, color: ink }])
    } else if (!tooShort(d[0], d.at(-1)!, min))
      setShapes((s) => [...s, { kind: tool as 'lijn' | 'pijl', a: d[0], b: d.at(-1)!, color: ink }])
    rerender((n) => n + 1)
  }

  // de lijn die je nu sleept
  const live: Shape[] =
    drag.current && (tool === 'lijn' || tool === 'pijl') && drag.current.length > 1
      ? [{ kind: tool, a: drag.current[0], b: drag.current.at(-1)!, color: ink }]
      : drag.current && tool === 'vrij'
        ? [{ kind: 'vrij', pts: drag.current, color: ink }]
        : []

  async function result(): Promise<Blob> {
    const a = paneA.current
    const el = a?.el()
    if (!el || !base) throw new Error('Nog niet geladen')
    const b = paneB.current
    const elB = b?.el()
    if (other && b?.size && elB)
      return exportCompare({ src: el, size: base, label: label(m) }, { src: elB, size: b.size, label: label(other) }, shapes)
    return exportSketch(el, base, shapes)
  }

  async function save() {
    setBusy(true)
    setPlaying(false)
    try {
      const blob = await result()
      const file = new File([blob], `tekening-${m.id.slice(0, 6)}.jpg`, { type: 'image/jpeg' })
      const { added } = await addMediaFiles([file], { sessionId: m.sessionId, trickId: m.trickId, crewId: m.crewId ?? null })
      if (!added.length) throw new Error('Opslaan lukte niet')
      sfx.success()
      toast({
        title: 'Bewaard',
        body: m.trickId || m.sessionId ? 'Staat als foto bij je clip.' : 'Staat als foto in je kluis.',
        icon: 'check',
        tone: 'success',
      })
      onClose()
    } catch (e) {
      toast({ title: 'Opslaan lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    setBusy(true)
    setPlaying(false)
    try {
      await shareFile(await result(), 'tekening.jpg')
    } catch (e) {
      toast({ title: 'Delen lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  const hint = TOOLS.find((t) => t.id === tool)!.hint
  const angleStep = tool === 'hoek' && draft.length ? ` (${draft.length} van 3)` : ''
  const round = 'grid size-10 place-items-center rounded-full bg-white/10 disabled:opacity-30'
  const paneProps = { base, shapes, live, draft, onDown: down, onMove: move, onUp: up, playing, rate }

  return (
    <div role="dialog" aria-label="Tekenen op je clip" className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <div className="pt-safe flex items-center justify-between gap-2 px-4 pb-2">
        <button type="button" onClick={onClose} className="h-10 px-1 text-[17px] font-semibold">
          Annuleer
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label={other ? 'Eén beeld' : 'Vergelijk met een andere clip'}
            aria-pressed={!!other}
            onClick={() => {
              setPlaying(false)
              if (other) {
                setOther(null)
                setOtherSize(null)
              } else setPicking(true)
            }}
            className={other ? round.replace('bg-white/10', 'bg-white text-black') : round}
          >
            <Icon name="mirror" size={18} />
          </button>
          <button
            type="button"
            aria-label="Ongedaan maken"
            disabled={!shapes.length && !draft.length}
            onClick={() => (draft.length ? setDraft([]) : setShapes((s) => s.slice(0, -1)))}
            className={round}
          >
            <Icon name="replay" size={18} />
          </button>
          <button type="button" aria-label="Deel" disabled={busy || !base} onClick={() => void share()} className={round}>
            <Icon name="share" size={18} />
          </button>
          <button
            type="button"
            disabled={busy || !base || (!shapes.length && !(other && otherSize))}
            onClick={() => void save()}
            className="h-10 rounded-full bg-accent px-4 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
          >
            Bewaar
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-1">
        <Pane m={m} api={paneA} onSize={setBase} label={other ? label(m) : null} canvasLabel="Tekenvlak" {...paneProps} />
        {other && (
          <Pane
            key={other.id}
            m={other}
            api={paneB}
            onSize={setOtherSize}
            label={label(other)}
            canvasLabel="Tekenvlak, tweede beeld"
            {...paneProps}
          />
        )}
        {picking && <Picker current={m} onPick={(x) => (setOther(x), setPicking(false))} onClose={() => setPicking(false)} />}
      </div>

      <div className="pb-safe space-y-3 px-4 pt-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1.5" role="group" aria-label="Gereedschap">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tool === t.id}
                onClick={() => {
                  setTool(t.id)
                  setDraft([])
                }}
                className={cx('h-10 flex-1 rounded-full text-[15px] font-semibold', tool === t.id ? 'bg-white text-black' : 'bg-white/10')}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Kleur">
            {INKS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                aria-pressed={ink === c.hex}
                onClick={() => setInk(c.hex)}
                className={cx('size-8 rounded-full border-2', ink === c.hex ? 'border-white' : 'border-transparent')}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
        {(hasVideo || onAskCoach) && (
          <div className="flex items-center gap-2">
            {hasVideo && (
              <>
                <button
                  type="button"
                  aria-label={playing ? 'Pauze' : 'Speel af'}
                  onClick={() => setPlaying((p) => !p)}
                  className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-[15px] font-semibold"
                >
                  <Icon name={playing ? 'pause' : 'play'} size={16} />
                  {playing ? 'Pauze' : 'Speel af'}
                </button>
                <button
                  type="button"
                  aria-label={`Snelheid ${rateLabel(rate)}`}
                  onClick={() => setRate(nextRate(rate))}
                  className="num h-10 min-w-14 rounded-full bg-white/10 px-3 text-[15px] font-semibold"
                >
                  {rateLabel(rate)}
                </button>
              </>
            )}
            {onAskCoach && (
              <button
                type="button"
                onClick={() => {
                  setPlaying(false)
                  onAskCoach(m.type === 'video' ? (paneA.current?.time() ?? 0) : null)
                }}
                className="ml-auto flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-[15px] font-semibold"
              >
                <Icon name="chat" size={16} />
                Vraag de coach
              </button>
            )}
          </div>
        )}
        <p className="pb-2 text-[13px] text-white/60" aria-live="polite">
          {hint}
          {angleStep}
        </p>
      </div>
    </div>
  )
}

/** Eén beeld met tekenvlak: laadt de clip, past hem in zijn vak, tekent de tekening (in de maten van het basisbeeld). */
function Pane({
  m,
  api,
  base,
  onSize,
  shapes,
  live,
  draft,
  onDown,
  onMove,
  onUp,
  playing,
  rate,
  label,
  canvasLabel,
}: {
  m: MediaMeta
  api: RefObject<PaneApi | null>
  /** maten van het eerste beeld; voor het eerste paneel zijn eigen maten */
  base: Size | null
  onSize: (s: Size) => void
  shapes: Shape[]
  live: Shape[]
  draft: Pt[]
  onDown: (p: Pt) => void
  onMove: (p: Pt) => void
  onUp: () => void
  playing: boolean
  rate: number
  label: string | null
  canvasLabel: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [size, setSize] = useState<Size | null>(null)
  const [box, setBox] = useState<Size | null>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const image = useRef<HTMLImageElement>(null)

  api.current = { el: () => (m.type === 'video' ? video.current : image.current), size, time: () => video.current?.currentTime ?? time }

  // het bestand lokaal ophalen: dan mag het canvas het frame ook exporteren
  useEffect(() => {
    let url: string | null = null
    let alive = true
    void (async () => {
      try {
        const remote = await mediaUrl(m)
        if (!remote) throw new Error('Deze kan ik nu niet laden. Offline? Media uit de cloud heeft internet nodig.')
        const blob = await (await fetch(remote)).blob()
        url = URL.createObjectURL(blob)
        if (alive) setSrc(url)
      } catch (e) {
        if (alive) setError(errMsg(e))
      }
    })()
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [m])

  const sized = (s: Size) => {
    setSize(s)
    onSize(s)
  }

  // het beeld zo groot mogelijk in het vak, met de juiste verhouding
  useLayoutEffect(() => {
    if (!stage.current || !size) return
    const fit = () => {
      const r = stage.current!.getBoundingClientRect()
      const s = Math.min(r.width / size.width, r.height / size.height)
      setBox({ width: size.width * s, height: size.height * s })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(stage.current)
    return () => ro.disconnect()
  }, [size])

  // afspelen: slow-motion of gewoon, in een lus
  useEffect(() => {
    const v = video.current
    if (!v || m.type !== 'video') return
    v.playbackRate = rate
    if (playing) void v.play()?.catch(() => {})
    else v.pause()
  }, [playing, rate, m.type, src])

  // tekening opnieuw tekenen, geschaald naar dit beeld
  useEffect(() => {
    const cv = canvas.current
    const b = base ?? size
    if (!cv || !size || !b) return
    cv.width = size.width
    cv.height = size.height
    const c = cv.getContext('2d')
    if (!c) return
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, size.width, size.height)
    c.setTransform(size.width / b.width, 0, 0, size.height / b.height, 0, 0)
    drawShapes(c, [...shapes, ...live], b, draft)
  })

  const point = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    const p = toImage({ x: e.clientX - r.left, y: e.clientY - r.top }, r, size!)
    return base ? toBase(p, size!, base) : p
  }

  const seek = (t: number) => {
    const v = video.current
    if (!v) return
    const next = Math.max(0, Math.min(duration || v.duration || 0, t))
    v.currentTime = next
    setTime(next)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden">
        {error && <p className="absolute inset-0 grid place-items-center px-6 text-center text-[15px] text-white/70">{error}</p>}
        {!src && !error && <p className="absolute inset-0 grid place-items-center text-[15px] text-white/60">Laden…</p>}
        {src && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={box ? { width: box.width, height: box.height } : { width: '100%', height: '100%' }}
          >
            {m.type === 'video' ? (
              <video
                ref={video}
                src={src}
                muted
                loop
                playsInline
                preload="auto"
                className="h-full w-full"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  sized({ width: v.videoWidth, height: v.videoHeight })
                  setDuration(v.duration || 0)
                  v.currentTime = Math.min(0.1, v.duration || 0)
                }}
                onSeeked={(e) => setTime(e.currentTarget.currentTime)}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              />
            ) : (
              <img
                ref={image}
                src={src}
                alt=""
                className="h-full w-full"
                onLoad={(e) => sized({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              />
            )}
            <canvas
              ref={canvas}
              aria-label={canvasLabel}
              className="absolute inset-0 h-full w-full touch-none"
              onPointerDown={(e) => {
                if (!size) return
                e.currentTarget.setPointerCapture?.(e.pointerId)
                onDown(point(e))
              }}
              onPointerMove={(e) => size && onMove(point(e))}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            {label && (
              <span className="pointer-events-none absolute left-2 top-2 rounded-[4px] bg-black/60 px-2 py-1 text-[13px] font-semibold">
                {label}
              </span>
            )}
          </div>
        )}
      </div>
      {m.type === 'video' && duration > 0 && (
        <div className="flex items-center gap-2 px-4 pt-1">
          <button type="button" aria-label="Frame terug" onClick={() => seek(time - 1 / FPS)} className="grid size-9 place-items-center">
            <Icon name="back" size={18} />
          </button>
          <input
            type="range"
            aria-label={label ? `Kies het frame (${label})` : 'Kies het frame'}
            min={0}
            max={duration}
            step={1 / FPS}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            className="h-9 min-w-0 flex-1 accent-[var(--accent)]"
          />
          <button type="button" aria-label="Frame vooruit" onClick={() => seek(time + 1 / FPS)} className="grid size-9 place-items-center">
            <Icon name="chevron" size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Kies een tweede clip of foto om eronder te zetten: eerst die van dezelfde trick. */
function Picker({ current, onPick, onClose }: { current: MediaMeta; onPick: (m: MediaMeta) => void; onClose: () => void }) {
  const me = getCurrentUserId()
  const list = useLiveQuery(
    async () =>
      ((await db.records.where('kind').equals('media').toArray()) as MediaMeta[])
        .filter((x) => !x.deleted && isVisual(x) && !x.tripFilm && x.id !== current.id && (!x.userId || x.userId === me))
        .sort(
          (a, b) =>
            Number(b.trickId === current.trickId && !!current.trickId) - Number(a.trickId === current.trickId && !!current.trickId) ||
            b.createdAt - a.createdAt,
        )
        .slice(0, 30),
    [current.id, me],
  )
  return (
    <div role="group" aria-label="Kies een clip om te vergelijken" className="absolute inset-0 z-10 flex flex-col bg-black/95 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[17px] font-semibold">Vergelijk met</span>
        <button type="button" onClick={onClose} className="h-10 px-1 text-[15px] font-semibold text-white/70">
          Sluit
        </button>
      </div>
      {list && !list.length && <p className="text-[15px] text-white/60">Nog geen andere clips of foto's in je kluis.</p>}
      <div className="grid grid-cols-3 gap-1.5 overflow-y-auto">
        {(list ?? []).map((x) => (
          <MediaThumb
            key={x.id}
            m={x}
            label={`${x.type === 'video' ? 'Clip' : 'Foto'} van ${fmtShort(todayISO(new Date(x.createdAt)))}`}
            onClick={() => onPick(x)}
            className="aspect-square w-full"
          />
        ))}
      </div>
    </div>
  )
}
