// Toen en nu: je eerste en je laatste clip van een trick naast elkaar, en samen af te spelen.
import { useRef, useState } from 'react'
import { useMediaUrl } from './Media'
import { Icon } from '../design/icons'
import { TRICK_BY_ID } from '../content/tricks'
import { gapText, type ThenNow } from '../lib/thenNow'
import type { MediaMeta } from '../lib/types'

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

function Pane({ m, label, mediaRef }: { m: MediaMeta; label: string; mediaRef: (v: HTMLVideoElement | null) => void }) {
  const url = useMediaUrl(m)
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center">
      {!url ? (
        <span className="text-[13px] text-white/60">laden… (offline? media uit de cloud heeft internet nodig)</span>
      ) : m.type === 'video' ? (
        <video ref={mediaRef} src={url} muted playsInline loop controls aria-label={label} className="max-h-full max-w-full" />
      ) : (
        <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
      )}
      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[13px] font-semibold text-white">{label}</span>
    </div>
  )
}

/** Volledig scherm: toen boven, nu onder. "Samen afspelen" start allebei vanaf het begin. */
export function CompareViewer({ tn, name, onClose }: { tn: ThenNow; name: string; onClose: () => void }) {
  const videos = useRef<(HTMLVideoElement | null)[]>([null, null])
  const anyVideo = tn.then.type === 'video' || tn.now.type === 'video'
  function playBoth() {
    for (const v of videos.current) {
      if (!v) continue
      v.currentTime = 0
      void v.play().catch(() => {})
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
      <Pane m={tn.then} label={`Toen · ${date(tn.then.createdAt)}`} mediaRef={(v) => (videos.current[0] = v)} />
      <div className="h-px bg-white/20" />
      <Pane m={tn.now} label={`Nu · ${date(tn.now.createdAt)}`} mediaRef={(v) => (videos.current[1] = v)} />
      <div className="pb-safe px-4 pt-3">
        {anyVideo && (
          <button
            onClick={playBoth}
            className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[17px] font-semibold text-accent-ink"
          >
            <Icon name="play" size={18} /> Samen afspelen
          </button>
        )}
      </div>
    </div>
  )
}
