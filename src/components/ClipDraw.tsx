// Tekenen op je clip: kies het frame, teken lijnen, pijlen, hoeken (met graden) of vrij, en bewaar het als foto
// bij dezelfde dag of trick, of deel het. Alles op het toestel.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from '../design/icons'
import { cx } from './ui'
import { mediaUrl } from '../lib/sync'
import { addMediaFiles } from '../lib/media'
import { shareFile } from '../lib/shareCard'
import { drawShapes, exportSketch, INKS, thin, toImage, tooShort, TOOLS, type Pt, type Shape, type Tool } from '../lib/sketch'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'
import type { MediaMeta } from '../lib/types'

const FPS = 30

export function ClipDraw({ m, onClose }: { m: MediaMeta; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [tool, setTool] = useState<Tool>('hoek')
  const [ink, setInk] = useState<string>(INKS[0].hex)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Pt[]>([])
  const [busy, setBusy] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const drag = useRef<Pt[] | null>(null)

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

  // het beeld zo groot mogelijk in het vlak, met de juiste verhouding
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

  // tekening opnieuw tekenen
  useEffect(() => {
    const cv = canvas.current
    if (!cv || !size) return
    cv.width = size.width
    cv.height = size.height
    const c = cv.getContext('2d')
    if (!c) return
    c.clearRect(0, 0, size.width, size.height)
    const live =
      drag.current && (tool === 'lijn' || tool === 'pijl') && drag.current.length > 1
        ? [{ kind: tool, a: drag.current[0], b: drag.current.at(-1)!, color: ink } as Shape]
        : []
    const free = drag.current && tool === 'vrij' ? [{ kind: 'vrij', pts: drag.current, color: ink } as Shape] : []
    drawShapes(c, [...shapes, ...live, ...free], size, draft)
  })

  const point = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return toImage({ x: e.clientX - r.left, y: e.clientY - r.top }, r, size!)
  }
  const [, rerender] = useState(0)

  function down(e: ReactPointerEvent) {
    if (!size) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = point(e)
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
  function move(e: ReactPointerEvent) {
    if (!drag.current) return
    drag.current.push(point(e))
    rerender((n) => n + 1)
  }
  function up() {
    const d = drag.current
    drag.current = null
    if (!d || !size) return
    const min = Math.min(size.width, size.height)
    if (tool === 'vrij') {
      const pts = thin(d, min * 0.004)
      if (pts.length > 1) setShapes((s) => [...s, { kind: 'vrij', pts, color: ink }])
    } else if (!tooShort(d[0], d.at(-1)!, min))
      setShapes((s) => [...s, { kind: tool as 'lijn' | 'pijl', a: d[0], b: d.at(-1)!, color: ink }])
    rerender((n) => n + 1)
  }

  const seek = (t: number) => {
    const v = video.current
    if (!v) return
    const next = Math.max(0, Math.min(duration || v.duration || 0, t))
    v.currentTime = next
    setTime(next)
  }

  async function result(): Promise<Blob> {
    const el = m.type === 'video' ? video.current : image.current
    if (!el || !size) throw new Error('Nog niet geladen')
    return exportSketch(el, size, shapes)
  }

  async function save() {
    setBusy(true)
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

  return (
    <div role="dialog" aria-label="Tekenen op je clip" className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <div className="pt-safe flex items-center justify-between gap-2 px-4 pb-2">
        <button type="button" onClick={onClose} className="h-10 px-1 text-[17px] font-semibold">
          Annuleer
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Ongedaan maken"
            disabled={!shapes.length && !draft.length}
            onClick={() => (draft.length ? setDraft([]) : setShapes((s) => s.slice(0, -1)))}
            className="grid size-10 place-items-center rounded-full bg-white/10 disabled:opacity-30"
          >
            <Icon name="replay" size={18} />
          </button>
          <button
            type="button"
            aria-label="Deel"
            disabled={busy || !size}
            onClick={() => void share()}
            className="grid size-10 place-items-center rounded-full bg-white/10 disabled:opacity-30"
          >
            <Icon name="share" size={18} />
          </button>
          <button
            type="button"
            disabled={busy || !size || !shapes.length}
            onClick={() => void save()}
            className="h-10 rounded-full bg-accent px-4 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
          >
            Bewaar
          </button>
        </div>
      </div>

      <div ref={stage} className="relative flex-1 overflow-hidden">
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
                playsInline
                preload="auto"
                className="h-full w-full"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  setSize({ width: v.videoWidth, height: v.videoHeight })
                  setDuration(v.duration || 0)
                  v.currentTime = Math.min(0.1, v.duration || 0)
                }}
                onSeeked={(e) => setTime(e.currentTarget.currentTime)}
              />
            ) : (
              <img
                ref={image}
                src={src}
                alt=""
                className="h-full w-full"
                onLoad={(e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              />
            )}
            <canvas
              ref={canvas}
              aria-label="Tekenvlak"
              className="absolute inset-0 h-full w-full touch-none"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            />
          </div>
        )}
      </div>

      <div className="pb-safe space-y-3 px-4 pt-3">
        {m.type === 'video' && duration > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Frame terug"
              onClick={() => seek(time - 1 / FPS)}
              className="grid size-10 place-items-center rounded-full bg-white/10"
            >
              <Icon name="back" size={18} />
            </button>
            <input
              type="range"
              aria-label="Kies het frame"
              min={0}
              max={duration}
              step={1 / FPS}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-10 min-w-0 flex-1 accent-[var(--accent)]"
            />
            <button
              type="button"
              aria-label="Frame vooruit"
              onClick={() => seek(time + 1 / FPS)}
              className="grid size-10 place-items-center rounded-full bg-white/10"
            >
              <Icon name="chevron" size={18} />
            </button>
          </div>
        )}
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
        <p className="pb-2 text-[13px] text-white/60" aria-live="polite">
          {hint}
          {angleStep}
        </p>
      </div>
    </div>
  )
}
