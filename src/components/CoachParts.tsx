// Onderdelen van de coach-pagina: tekst met een beetje opmaak, de knoppen die de coach voorstelt,
// de techniek-check (foto of videoframe kiezen) en het geheugen.
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, List, Row, Sheet, inputCls } from './ui'
import { MediaThumb } from './Media'
import { Icon } from '../design/icons'
import { db } from '../lib/db'
import { mediaUrl } from '../lib/sync'
import { getCurrentUserId } from '../lib/auth-state'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import { CoachError, toCoachImage, type CoachAction, type CoachImage, type MemoryItem } from '../lib/coach'
import type { MediaMeta } from '../lib/types'

/** Piepkleine markdown: **vet**, lijstjes, kopjes en alinea's. Genoeg voor chat. */
export function Rich({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l)))
          return (
            <ul key={i} className="my-1.5 space-y-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[7px] size-1.5 shrink-0 bg-accent-text" />
                  <span>{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ''))}</span>
                </li>
              ))}
            </ul>
          )
        if (/^#{1,3}\s/.test(b))
          return (
            <div key={i} className="mt-2 font-semibold">
              {inline(b.replace(/^#{1,3}\s/, ''))}
            </div>
          )
        return (
          <p key={i} className="my-1.5">
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}

// ── Knoppen van de coach ────────────────────────────────────────────────────

function Done({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[15px] text-muted">
      <Icon name="check" size={16} /> {children}
    </span>
  )
}

/** Eén voorstel van de coach onder zijn antwoord. */
export function ActionCard({ action, applied, onApply }: { action: CoachAction; applied: boolean; onApply: () => void }) {
  if (action.kind === 'onthoud')
    return (
      <div className="flex items-start gap-2 px-1 text-[13px] text-muted">
        <Icon name="check" size={14} className="mt-0.5 shrink-0" />
        <span>Onthouden: {action.feit}</span>
      </div>
    )
  if (action.kind === 'trick') {
    const t = TRICK_BY_ID.get(action.trickId)
    if (!t) return null
    return (
      <List>
        <Row icon="play" title={`Bekijk de ${t.name}`} detail="Animatie en stappen in de bijbel" to={`/tricks/${t.id}`} />
      </List>
    )
  }
  if (action.kind === 'doel') {
    const t = action.trickId ? TRICK_BY_ID.get(action.trickId) : undefined
    return (
      <List>
        <Row
          icon="target"
          title={<span className="block whitespace-normal">{action.titel}</span>}
          detail={t ? `Doel met ${t.name}` : 'Voorstel voor een doel'}
          chevron={false}
        >
          {applied ? (
            <Done>Gezet</Done>
          ) : (
            <Button size="sm" variant="ghost" onClick={onApply}>
              Zet als doel
            </Button>
          )}
        </Row>
      </List>
    )
  }
  return (
    <List>
      <div className="px-4 pb-1 pt-3 font-semibold">{action.titel}</div>
      {action.dagen.map((d, i) => (
        <div key={i} className="px-4 py-2.5">
          <div className="text-[15px]">
            <span className="font-semibold">{d.dag}</span> <span>{d.focus}</span>
          </div>
          {d.oefeningen.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[13px] text-muted">
              {d.oefeningen.map((o, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 bg-muted" />
                  {o}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-[13px] text-muted">Elke dag als doel</span>
        {applied ? (
          <Done>Bij je doelen</Done>
        ) : (
          <Button size="sm" variant="ghost" onClick={onApply}>
            Zet als doelen
          </Button>
        )}
      </div>
    </List>
  )
}

// ── Geheugen ───────────────────────────────────────────────────────────────

export function MemorySheet({
  open,
  onClose,
  items,
  onRemove,
}: {
  open: boolean
  onClose: () => void
  items: MemoryItem[]
  onRemove: (id: string) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Wat de coach van je weet">
      <p className="mb-3 text-[15px] text-muted">
        De coach onthoudt dingen die je vertelt en die later nog uitmaken, zoals een blessure of je board. Het staat alleen op je telefoon.
        Nieuwe dingen gelden vanaf je volgende gesprek.
      </p>
      {!items.length ? (
        <p className="pb-6 text-[15px] text-muted">Nog niks onthouden.</p>
      ) : (
        <List className="mb-6">
          {items.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1 pl-4 pr-1">
              <span className="min-w-0 flex-1 py-1.5 text-[15px]">{m.text}</span>
              <button
                aria-label={`Vergeet: ${m.text}`}
                onClick={() => onRemove(m.id)}
                className="grid size-11 shrink-0 place-items-center text-muted active:opacity-60"
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </List>
      )}
    </Sheet>
  )
}

// ── Techniek-check ────────────────────────────────────────────────────────────

type Picked = { type: 'image' | 'video'; url: string; trickId?: string; local?: boolean }

const fmtTime = (s: number) => `${s.toFixed(1).replace('.', ',')} s`

export interface TechniquePick {
  image: CoachImage
  trickId: string | null
  /** tijd in de video, als het een videoframe is */
  at?: number
}

/**
 * Kies een foto of video (uit je kluis of nieuw), zoek bij een video het moment dat telt,
 * en stuur dat beeld naar de coach.
 */
export function TechniqueSheet({
  open,
  onClose,
  onPick,
  mediaId,
  trickId: initialTrick,
}: {
  open: boolean
  onClose: () => void
  onPick: (p: TechniquePick) => void
  mediaId?: string | null
  trickId?: string | null
}) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const [trickId, setTrickId] = useState<string>(initialTrick ?? '')
  const [at, setAt] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const me = getCurrentUserId()
  const media = useLiveQuery(
    async () =>
      ((await db.records.where('kind').equals('media').toArray()) as MediaMeta[])
        .filter((m) => !m.deleted && (!m.userId || m.userId === me))
        .sort((a, b) => b.createdAt - a.createdAt),
    [me],
  )

  async function choose(m: MediaMeta) {
    setError(null)
    const url = await mediaUrl(m)
    if (!url) return setError('Deze kan ik nu niet laden. Offline? Media uit de cloud heeft internet nodig.')
    setPicked({ type: m.type, url, trickId: m.trickId })
    if (m.trickId) setTrickId(m.trickId)
  }

  // vanuit de kluis of een trick direct openen
  useEffect(() => {
    if (!open) return
    setTrickId(initialTrick ?? '')
    if (mediaId)
      void db.records.get(mediaId).then((m) => {
        if (m?.kind === 'media') void choose(m as MediaMeta)
      })
  }, [open, mediaId, initialTrick])

  function reset() {
    if (picked?.local) URL.revokeObjectURL(picked.url)
    setPicked(null)
    setAt(0)
    setDuration(0)
    setError(null)
  }

  function close() {
    reset()
    onClose()
  }

  function send() {
    try {
      const v = video.current
      const i = img.current
      const image =
        picked?.type === 'video' && v
          ? toCoachImage(v, v.videoWidth, v.videoHeight)
          : i
            ? toCoachImage(i, i.naturalWidth, i.naturalHeight)
            : null
      if (!image) return
      onPick({ image, trickId: trickId || null, ...(picked?.type === 'video' ? { at } : {}) })
      reset()
    } catch (e) {
      setError(
        e instanceof CoachError ? e.message : 'Dit beeld kan ik niet lezen. Kies hem opnieuw vanaf je telefoon met "Kies foto of video".',
      )
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Techniek-check" closeLabel="Annuleer">
      <input
        ref={file}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        aria-label="Foto of video kiezen"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          reset()
          setPicked({ type: f.type.startsWith('video') ? 'video' : 'image', url: URL.createObjectURL(f), local: true })
        }}
      />
      {!picked ? (
        <div className="pb-6">
          <p className="mb-4 text-[15px] text-muted">
            Kies een foto, of een video waarin je het moment opzoekt dat telt: net voor de pop, halverwege de bocht, de landing. De coach
            zegt wat hij ziet en wat je anders kunt doen.
          </p>
          <Button className="w-full" icon={<Icon name="camera" size={18} />} onClick={() => file.current?.click()}>
            Kies foto of video
          </Button>
          {!!media?.length && (
            <>
              <h4 className="mb-2 mt-6 text-[17px] font-semibold">Uit je kluis</h4>
              <div className="grid grid-cols-3 gap-2">
                {media.slice(0, 30).map((m) => (
                  <MediaThumb key={m.id} m={m} onClick={() => void choose(m)} className="aspect-square" />
                ))}
              </div>
            </>
          )}
          {error && <p className="mt-3 text-[15px] text-danger">{error}</p>}
        </div>
      ) : (
        <div className="pb-6">
          <div className="overflow-hidden rounded-xl bg-black">
            {picked.type === 'video' ? (
              <video
                ref={video}
                crossOrigin="anonymous"
                src={picked.url}
                muted
                playsInline
                preload="auto"
                aria-label="Gekozen video"
                className="max-h-[45dvh] w-full object-contain"
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration
                  setDuration(Number.isFinite(d) ? d : 0)
                  // iOS laat pas een beeld zien na een seek
                  e.currentTarget.currentTime = Math.min(0.05, d || 0)
                }}
              />
            ) : (
              <img ref={img} crossOrigin="anonymous" src={picked.url} alt="Gekozen foto" className="max-h-[45dvh] w-full object-contain" />
            )}
          </div>
          {picked.type === 'video' && (
            <div className="mt-3">
              <input
                type="range"
                aria-label="Moment in de video"
                min={0}
                max={duration || 0}
                step={0.04}
                value={at}
                disabled={!duration}
                onChange={(e) => {
                  const t = Number(e.target.value)
                  setAt(t)
                  if (video.current) video.current.currentTime = t
                }}
                className="w-full accent-[var(--accent)]"
              />
              <div className="flex justify-between text-[13px] text-muted">
                <span>Schuif naar het moment dat telt</span>
                <span className="num">{fmtTime(at)}</span>
              </div>
            </div>
          )}
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[15px] font-medium">Welke trick?</span>
            <select value={trickId} onChange={(e) => setTrickId(e.target.value)} className={inputCls}>
              <option value="">Weet ik niet / gewoon rijden</option>
              {TRICKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="mt-3 text-[15px] text-danger">{error}</p>}
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="whitespace-nowrap !px-4" onClick={reset}>
              Ander beeld
            </Button>
            <Button className="flex-1 whitespace-nowrap" onClick={send}>
              Laat de coach kijken
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
