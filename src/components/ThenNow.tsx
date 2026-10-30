// Toen en nu: je eerste en je laatste clip van een trick naast elkaar, en samen af te spelen.
// Voor en na: Coach Daddy vergelijkt het beeld waar je in beide clips staat (kost één coach-bericht, uitslag bewaard).
import { useEffect, useRef, useState } from 'react'
import { useMediaUrl } from './Media'
import { Icon, Spinner } from '../design/icons'
import { TRICK_BY_ID } from '../content/tricks'
import { gapText, type ThenNow } from '../lib/thenNow'
import type { MediaMeta } from '../lib/types'
import { CoachError, compareClips, toCoachImage, type Comparison } from '../lib/coach'
import { kvGet, kvSet } from '../lib/db'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import { errMsg } from '../lib/errors'

const shortDate = (ms: number) => new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
const date = (ms: number) => new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

/** Plaatje zonder eigen knop (de hele kaart is al de knop). */
function Thumb({ m }: { m: MediaMeta }) {
  const url = useMediaUrl(m.thumb ? undefined : m)
  const src = m.thumb ?? (m.type === 'image' ? url : null)
  return (
    <div className="relative aspect-[4/5] w-full bg-surface-2">
      {src && <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />}
      {m.type === 'video' && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-8 place-items-center rounded-full bg-black/55 text-white">
            <Icon name="play" size={14} />
          </span>
        </span>
      )}
    </div>
  )
}

/** Twee thumbnails naast elkaar; tik om te vergelijken. */
export function ThenNowCard({ tn, showName }: { tn: ThenNow; showName?: boolean }) {
  const [open, setOpen] = useState(false)
  const name = TRICK_BY_ID.get(tn.trickId)?.name ?? tn.trickId
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Toen en nu: ${name}, ${gapText(tn.days)}`}
        className="card block w-full overflow-hidden p-0 text-left active:opacity-80"
      >
        <div className="grid grid-cols-2 gap-px bg-[var(--line)]">
          {(['then', 'now'] as const).map((k) => (
            <div key={k} className="relative">
              <Thumb m={tn[k]} />
              <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[13px] font-semibold text-white">
                {k === 'then' ? 'Toen' : 'Nu'}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="min-w-0">
            {showName && <span className="block truncate text-[15px] font-semibold">{name}</span>}
            <span className="block text-[13px] text-muted">
              Toen {shortDate(tn.then.createdAt)}, nu {gapText(tn.days)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[15px] text-accent-text">
            Vergelijk <Icon name="chevron" size={14} stroke={2.2} />
          </span>
        </div>
      </button>
      {open && <CompareViewer tn={tn} name={name} onClose={() => setOpen(false)} />}
    </>
  )
}

type MediaEl = HTMLVideoElement | HTMLImageElement

function Pane({ m, label, mediaRef }: { m: MediaMeta; label: string; mediaRef: (v: MediaEl | null) => void }) {
  const url = useMediaUrl(m)
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center">
      {!url ? (
        <span className="text-[13px] text-white/60">laden… (offline? media uit de cloud heeft internet nodig)</span>
      ) : m.type === 'video' ? (
        // crossOrigin: anders mag het frame niet naar een canvas (voor de coach)
        <video
          ref={mediaRef}
          src={url}
          crossOrigin="anonymous"
          muted
          playsInline
          loop
          controls
          aria-label={label}
          className="max-h-full max-w-full"
        />
      ) : (
        <img ref={mediaRef} src={url} crossOrigin="anonymous" alt={label} className="max-h-full max-w-full object-contain" />
      )}
      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[13px] font-semibold text-white">{label}</span>
    </div>
  )
}

/** Volledig scherm: toen boven, nu onder. "Samen afspelen" start allebei vanaf het begin. */
export function CompareViewer({ tn, name, onClose }: { tn: ThenNow; name: string; onClose: () => void }) {
  const media = useRef<(MediaEl | null)[]>([null, null])
  const anyVideo = tn.then.type === 'video' || tn.now.type === 'video'
  const { user } = authStore.use()
  const key = `coach:compare:${tn.then.id}:${tn.now.id}`
  const [result, setResult] = useState<Comparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void kvGet<Comparison | null>(key, null).then(setResult)
  }, [key])

  function playBoth() {
    for (const v of media.current) {
      if (!(v instanceof HTMLVideoElement)) continue
      v.currentTime = 0
      void v.play().catch(() => {})
    }
  }

  /** Het beeld waar je nu staat: het huidige videoframe, of de foto. */
  function frame(el: MediaEl | null) {
    if (el instanceof HTMLVideoElement && el.videoWidth) return toCoachImage(el, el.videoWidth, el.videoHeight)
    if (el instanceof HTMLImageElement && el.naturalWidth) return toCoachImage(el, el.naturalWidth, el.naturalHeight)
    throw new CoachError('De clips zijn nog niet geladen. Wacht even en probeer het opnieuw.')
  }

  async function compare() {
    setBusy(true)
    setError('')
    try {
      for (const v of media.current) if (v instanceof HTMLVideoElement) v.pause()
      const c = await compareClips(tn.trickId, frame(media.current[0]), frame(media.current[1]), tn.days)
      await kvSet(key, c)
      setResult(c)
    } catch (e) {
      setError(e instanceof CoachError ? e.message : errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div role="dialog" aria-label={`Toen en nu: ${name}`} className="fixed inset-0 z-[70] flex flex-col bg-black">
      <div className="pt-safe flex items-center justify-between gap-3 px-4 pb-2">
        <div className="min-w-0 text-white">
          <div className="truncate text-[17px] font-semibold">{name}</div>
          <div className="text-[13px] text-white/60">{gapText(tn.days)}</div>
        </div>
        <button
          aria-label="Sluiten"
          onClick={onClose}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <Pane m={tn.then} label={`Toen · ${date(tn.then.createdAt)}`} mediaRef={(v) => (media.current[0] = v)} />
      <div className="h-px bg-white/20" />
      <Pane m={tn.now} label={`Nu · ${date(tn.now.createdAt)}`} mediaRef={(v) => (media.current[1] = v)} />
      {result && (
        <section aria-label="Coach: voor en na" className="max-h-[38dvh] overflow-y-auto bg-[var(--surface)] px-4 py-3 text-text">
          {(
            [
              ['Beter geworden', result.beter],
              ['Nog werk', result.nogWerk],
              ['Drill', result.drill],
            ] as const
          ).map(([label, txt]) => (
            <div key={label} className="py-1.5">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">{label}</div>
              <p className="mt-0.5 text-[15px] leading-snug">{txt}</p>
            </div>
          ))}
        </section>
      )}
      <div className="pb-safe px-4 pt-3">
        {anyVideo && (
          <button
            onClick={playBoth}
            className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-accent text-[17px] font-semibold text-accent-ink"
          >
            <Icon name="play" size={18} /> Samen afspelen
          </button>
        )}
        {hasBackend && user && !result && (
          <>
            <p className="mb-2 text-[13px] text-white/60">Zet beide clips op hetzelfde moment, dan vergelijkt de coach die twee beelden.</p>
            <button
              onClick={() => void compare()}
              disabled={busy}
              className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-[6px] border border-white/30 text-[17px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Spinner size={18} /> : <Icon name="chat" size={18} />} {busy ? 'Coach kijkt…' : 'Laat de coach vergelijken'}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="mb-3 text-[13px] text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
