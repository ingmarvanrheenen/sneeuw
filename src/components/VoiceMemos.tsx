// Spraakmemo's bij je dag: inspreken (max 1 minuut), terugluisteren, weggooien.
import { useEffect, useRef, useState } from 'react'
import { Button, Heading, List, cx } from './ui'
import { Icon } from '../design/icons'
import { canRecord, fmtDuration, MEMO_MAX_S, micError, saveMemo, startRecording, type Recording } from '../lib/memo'
import { mediaUrl } from '../lib/sync'
import { remove } from '../lib/repo'
import { seeded } from '../lib/random'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'
import type { MediaMeta } from '../lib/types'

/** Opnameknop. Tijdens opnemen: een oranje blok met de tijd, Klaar en Weg. */
export function MemoRecorder({
  link,
  label = 'Spreek een memo in',
  onSaved,
  className,
}: {
  link: { sessionId?: string; crewId?: string | null }
  label?: string
  onSaved?: (m: MediaMeta) => void
  className?: string
}) {
  const [rec, setRec] = useState<Recording | null>(null)
  const [starting, setStarting] = useState(false)
  const [secs, setSecs] = useState(0)
  const started = useRef(0)
  const live = useRef<Recording | null>(null)
  const done = useRef<() => void>(() => {})

  async function start() {
    setStarting(true)
    try {
      const r = await startRecording()
      started.current = Date.now()
      setSecs(0)
      live.current = r
      setRec(r)
      sfx.tap()
    } catch (e) {
      toast({ title: 'Microfoon', body: micError(e), tone: 'error', icon: 'alert' })
    } finally {
      setStarting(false)
    }
  }

  async function finish() {
    if (!rec) return
    const r = rec
    live.current = null
    setRec(null)
    try {
      const out = await r.stop()
      const m = await saveMemo(out, link)
      if (!m) return toast({ title: 'Te kort', body: 'Hou hem iets langer vast, dan bewaren we hem.', icon: 'mic' })
      sfx.success()
      onSaved?.(m)
    } catch (e) {
      toast({ title: 'Opslaan lukte niet', body: micError(e), tone: 'error', icon: 'alert' })
    }
  }
  done.current = () => void finish()

  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => {
      const s = (Date.now() - started.current) / 1000
      setSecs(s)
      if (s >= MEMO_MAX_S) done.current()
    }, 250)
    return () => clearInterval(t)
  }, [rec])

  // weg van de pagina tijdens opnemen: microfoon weer uit
  useEffect(() => () => live.current?.cancel(), [])

  if (!canRecord()) return null

  if (rec)
    return (
      <div role="group" aria-label="Opnemen" className={cx('flex items-center gap-3 rounded-[6px] bg-hot p-3 text-hot-ink', className)}>
        <span aria-hidden className="size-3 shrink-0 rounded-full bg-hot-ink motion-safe:animate-pulse" />
        <span className="display num flex-1 text-[26px]" aria-live="polite">
          {fmtDuration(secs)}
          <span className="text-[15px] opacity-70"> / {fmtDuration(MEMO_MAX_S)}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            rec.cancel()
            live.current = null
            setRec(null)
          }}
          className="px-2 py-2 text-[15px] font-semibold"
        >
          Weg
        </button>
        <button
          type="button"
          onClick={() => void finish()}
          className="flex h-11 items-center gap-1.5 rounded-[6px] bg-hot-ink px-4 text-[15px] font-semibold text-hot"
        >
          <Icon name="stop" size={14} /> Klaar
        </button>
      </div>
    )

  return (
    <Button
      variant="ghost"
      className={cx('w-full', className)}
      icon={<Icon name="mic" size={18} />}
      disabled={starting}
      onClick={() => void start()}
    >
      {label}
    </Button>
  )
}

/** Vaste golfvorm per memo (versiering, geen echte meting): balkjes die vollopen tijdens het afspelen. */
function Wave({ id, progress }: { id: string; progress: number }) {
  const rng = seeded(id)
  const bars = Array.from({ length: 28 }, () => 0.25 + rng() * 0.75)
  return (
    <span aria-hidden className="flex h-6 flex-1 items-center gap-[2px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className={cx('w-[3px] rounded-full', i / bars.length < progress ? 'bg-text' : 'bg-[var(--line)]')}
          style={{ height: `${h * 100}%` }}
        />
      ))}
    </span>
  )
}

let current: HTMLAudioElement | null = null

/** Memo's als lijst: tik om te luisteren (één tegelijk). */
export function MemoList({ items, editable, who }: { items: MediaMeta[]; editable?: boolean; who?: string }) {
  const [playing, setPlaying] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(
    () => () => {
      audio.current?.pause()
    },
    [],
  )

  async function toggle(m: MediaMeta) {
    if (playing === m.id) {
      audio.current?.pause()
      setPlaying(null)
      return
    }
    const url = await mediaUrl(m)
    if (!url)
      return toast({ title: 'Kan hem nu niet laden', body: 'Offline? Memo’s uit de cloud hebben internet nodig.', icon: 'cloudOff' })
    current?.pause()
    const a = new Audio(url)
    current = audio.current = a
    a.ontimeupdate = () => setProgress(a.duration && isFinite(a.duration) ? a.currentTime / a.duration : a.currentTime / (m.duration || 1))
    a.onended = a.onpause = () => {
      setPlaying((p) => (p === m.id ? null : p))
      setProgress(0)
    }
    setProgress(0)
    setPlaying(m.id)
    await Promise.resolve(a.play()).catch(() => setPlaying(null))
  }

  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt)
  return (
    <List>
      {sorted.map((m, i) => {
        const on = playing === m.id
        const time = new Date(m.createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        return (
          <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
            <button
              type="button"
              aria-label={`${on ? 'Pauzeer' : 'Luister'} memo ${i + 1}`}
              aria-pressed={on}
              onClick={() => void toggle(m)}
              className={cx(
                'grid size-11 shrink-0 place-items-center rounded-full',
                on ? 'bg-hot text-hot-ink' : 'bg-accent text-accent-ink',
              )}
            >
              <Icon name={on ? 'pause' : 'play'} size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <Wave id={m.id} progress={on ? progress : 0} />
              <div className="mt-0.5 text-[13px] text-muted">
                <span className="num">{fmtDuration(m.duration)}</span> · {who ? `${who}, ` : ''}
                {time}
              </div>
            </div>
            {editable && (
              <button
                type="button"
                aria-label={`Gooi memo ${i + 1} weg`}
                onClick={() => {
                  if (on) audio.current?.pause()
                  void remove(m)
                }}
                className="-mr-1 grid size-9 shrink-0 place-items-center text-muted"
              >
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>
        )
      })}
    </List>
  )
}

/** De sectie op je dag: kop, je memo's en de opnameknop. */
export function VoiceMemos({
  items,
  link,
  editable = true,
  className,
}: {
  items: MediaMeta[]
  link: { sessionId: string; crewId?: string | null }
  editable?: boolean
  className?: string
}) {
  if (!items.length && (!editable || !canRecord())) return null
  return (
    <section className={cx('mt-8', className)}>
      <Heading>Spraakmemo’s</Heading>
      {items.length > 0 && <MemoList items={items} editable={editable} />}
      {editable && <MemoRecorder link={link} className={items.length ? 'mt-2' : undefined} />}
      {editable && !items.length && (
        <p className="mt-2 text-[13px] text-muted">Na een run of in de lift: zeg wat lukte en wat je morgen anders doet.</p>
      )}
    </section>
  )
}
