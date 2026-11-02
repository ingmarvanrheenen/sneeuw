// Stickers cadeau doen: de sticker zelf, de stickers op je skipas, het geef-scherm en "Stickers van je crew".
import { useEffect, useState, type CSSProperties } from 'react'
import { Button, Field, List, Section, Sheet, cx, inputCls } from './ui'
import { MoodSticker, ReactionSticker } from '../design/Stickers'
import { Icon } from '../design/icons'
import { GIFT_LABEL, GIFT_STICKERS, PIN_MAX, WEEK_LIMIT, giveSticker, type Gift, type GiftStickerId } from '../lib/gifts'
import { ago } from '../lib/crewStatus'

/** De sticker-tekening bij een cadeau-id. */
export function GiftArt({ id, size = 48 }: { id: GiftStickerId; size?: number }) {
  return id.startsWith('mood') ? <MoodSticker value={Number(id.slice(4))} size={size} /> : <ReactionSticker kind={id} size={size} />
}

const TILTS = [-10, 8, -4]

/** Geplakte stickers op de skipas: schuin erop geklapt, een beetje over elkaar. */
export function PassStickers({
  gifts,
  size = 52,
  className,
}: {
  gifts: Pick<Gift, 'id' | 'sticker'>[]
  size?: number
  className?: string
}) {
  if (!gifts.length) return null
  return (
    <div
      className={cx('pointer-events-none flex -space-x-3', className)}
      aria-label={`Geplakt: ${gifts.map((g) => GIFT_LABEL.get(g.sticker)).join(', ')}`}
      role="img"
    >
      {gifts.slice(0, PIN_MAX).map((g, i) => (
        <span key={g.id} className="slap block" style={{ '--tilt': `${TILTS[i]}deg`, '--delay': `${200 + i * 90}ms` } as CSSProperties}>
          <GiftArt id={g.sticker} size={size} />
        </span>
      ))}
    </div>
  )
}

/** Een sticker geven: kiezen, berichtje erbij, versturen. */
export function GiveSheet({
  open,
  name,
  toUser,
  left,
  onClose,
  onSent,
}: {
  open: boolean
  name: string
  toUser: string
  left: number | null
  onClose: () => void
  onSent: () => void
}) {
  const [pick, setPick] = useState<GiftStickerId | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) {
      setPick(null)
      setNote('')
      setError('')
    }
  }, [open])

  async function send() {
    if (!pick) return
    setBusy(true)
    setError('')
    try {
      await giveSticker(toUser, pick, note)
      onSent()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Geef een sticker" closeLabel="Annuleer">
      <p className="mb-3 text-[15px] text-muted">
        {name} kan hem op de eigen skipas plakken. {left !== null && `Je kunt er deze week nog ${left} van de ${WEEK_LIMIT} weggeven.`}
      </p>
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Kies een sticker">
        {GIFT_STICKERS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={pick === s.id}
            onClick={() => setPick(s.id)}
            className={cx(
              'flex flex-col items-center gap-1 rounded-[6px] border py-2 transition',
              pick === s.id ? 'border-text bg-accent-soft' : 'hairline bg-surface',
            )}
          >
            <span
              key={pick === s.id ? 'aan' : 'uit'}
              className={pick === s.id ? 'slap block' : 'block'}
              style={{ '--tilt': '-8deg', '--delay': '0ms' } as CSSProperties}
            >
              <GiftArt id={s.id} size={40} />
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.06em]">{s.label}</span>
          </button>
        ))}
      </div>
      <Field label="Berichtje (mag leeg)">
        <input
          className={inputCls}
          value={note}
          maxLength={60}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bijv. die 180 was ziek"
        />
      </Field>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      <Button size="lg" className="mb-6 mt-5 w-full" disabled={!pick || busy || left === 0} onClick={() => void send()}>
        {left === 0 ? 'Deze week op' : 'Geef'}
      </Button>
    </Sheet>
  )
}

/** Je gekregen stickers: plakken (max 3) of weggooien. */
export function ReceivedStickers({
  gifts,
  names,
  onPin,
  onRemove,
}: {
  gifts: Gift[]
  names: Record<string, string>
  onPin: (g: Gift) => void
  onRemove: (g: Gift) => void
}) {
  if (!gifts.length) return null
  const pinned = gifts.filter((g) => g.pinned).length
  return (
    <Section title="Stickers van je crew">
      <p className="-mt-1 mb-3 text-[15px] text-muted">Plak er max {PIN_MAX} op je skipas; die ziet je crew.</p>
      <List>
        {gifts.map((g) => (
          <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
            <GiftArt id={g.sticker} size={44} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">
                {GIFT_LABEL.get(g.sticker)} van {names[g.from_user] ?? 'Iemand'}
              </div>
              <div className="truncate text-[13px] text-muted">
                {g.note ? `“${g.note}” · ` : ''}
                {ago(g.created_at)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onPin(g)}
              disabled={!g.pinned && pinned >= PIN_MAX}
              className={cx(
                'shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40',
                g.pinned ? 'border-text bg-accent-soft' : 'hairline',
              )}
            >
              {g.pinned ? 'Op je pas' : 'Plak'}
            </button>
            <button
              type="button"
              aria-label="Weggooien"
              onClick={() => onRemove(g)}
              className="-mr-2 grid size-9 shrink-0 place-items-center text-muted"
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
      </List>
    </Section>
  )
}
