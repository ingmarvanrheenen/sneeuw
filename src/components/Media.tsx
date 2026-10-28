import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../design/icons'
import { getCurrentUserId } from '../lib/auth-state'
import { mediaUrl } from '../lib/sync'
import { addMediaFiles } from '../lib/media'
import { remove } from '../lib/repo'
import { toast } from '../lib/toast'
import type { MediaMeta } from '../lib/types'
import { cx } from './ui'

export function useMediaUrl(m: MediaMeta | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (m) void mediaUrl(m).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [m])
  return url
}

export function MediaThumb({ m, onClick, className }: { m: MediaMeta; onClick?: () => void; className?: string }) {
  const url = useMediaUrl(m.thumb ? undefined : m)
  const src = m.thumb ?? (m.type === 'image' ? url : null)
  return (
    <button onClick={onClick} className={cx('relative overflow-hidden rounded-xl bg-surface-2', className)}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="label grid h-full place-items-center">media</div>
      )}
      {m.type === 'video' && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-8 place-items-center rounded-full bg-black/55 text-white">
            <Icon name="play" size={14} />
          </span>
        </span>
      )}
    </button>
  )
}

export function MediaViewer({ m, onClose, onDelete }: { m: MediaMeta | null; onClose: () => void; onDelete?: (m: MediaMeta) => void }) {
  const url = useMediaUrl(m ?? undefined)
  if (!m) return null
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" onClick={onClose}>
      <div className="pt-safe flex justify-between px-4 pb-2" onClick={(e) => e.stopPropagation()}>
        {onDelete ? (
          <button
            aria-label="Verwijderen"
            onClick={() => onDelete(m)}
            className="grid size-10 place-items-center rounded-full bg-white/10 text-white"
          >
            <Icon name="trash" size={18} />
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {(!m.userId || m.userId === getCurrentUserId()) && (
            <Link
              to={`/coach?media=${m.id}`}
              className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[15px] font-medium text-white"
            >
              <Icon name="chat" size={16} />
              Check techniek
            </Link>
          )}
          <button aria-label="Sluiten" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/10 text-white">
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <div className="label !text-white/60">laden… (offline? media uit de cloud heeft internet nodig)</div>
        ) : m.type === 'video' ? (
          <video src={url} controls playsInline autoPlay className="max-h-full max-w-full" />
        ) : (
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="pb-safe" />
    </div>
  )
}

export function MediaGrid({ items, editable }: { items: MediaMeta[]; editable?: boolean }) {
  const [open, setOpen] = useState<MediaMeta | null>(null)
  if (!items.length) return null
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {items.map((m) => (
          <MediaThumb key={m.id} m={m} onClick={() => setOpen(m)} className="aspect-square" />
        ))}
      </div>
      <MediaViewer
        m={open}
        onClose={() => setOpen(null)}
        onDelete={
          editable
            ? async (m) => {
                await remove(m)
                setOpen(null)
              }
            : undefined
        }
      />
    </>
  )
}

export function MediaAddButton({
  link,
  onAdded,
  label = "Foto's & video's",
}: {
  link: { sessionId?: string; trickId?: string; crewId?: string | null }
  onAdded?: (m: MediaMeta[]) => void
  label?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState<{ index: number; total: number; progress: number } | null>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = e.target.files
          if (!files?.length) return
          setBusy(true)
          try {
            const { added, skipped } = await addMediaFiles(files, link, (p) => setProg(p))
            skipped.forEach((s) => toast({ title: 'Niet toegevoegd', body: s, tone: 'error' }))
            if (added.length) onAdded?.(added)
          } finally {
            setBusy(false)
            setProg(null)
            e.target.value = ''
          }
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed hairline text-sm text-muted active:bg-surface-2"
      >
        {busy && prog && (
          <span
            className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-300"
            style={{ width: `${Math.round(((prog.index + prog.progress) / prog.total) * 100)}%` }}
          />
        )}
        <span className="relative flex items-center gap-2">
          <Icon name="camera" size={18} />
          {!busy
            ? label
            : prog && prog.progress > 0
              ? `Video verkleinen ${Math.round(prog.progress * 100)}%${prog.total > 1 ? ` (${prog.index + 1}/${prog.total})` : ''}`
              : 'Verwerken…'}
        </span>
      </button>
      {busy && prog && prog.progress > 0 && (
        <p className="mt-1.5 text-center text-[13px] text-muted">Maakt je clip kleiner voor de upload. Laat de app even open.</p>
      )}
    </>
  )
}
