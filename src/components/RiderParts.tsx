// Bouwstenen van het rider-profiel: avatar, skipas en stickerboek.
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { List, Progress, Row, Sheet, cx } from './ui'
import { PISTES } from '../content/logOptions'
import {
  barcode,
  boardStickers,
  nextSticker,
  passNumber,
  seasonFor,
  stickerBook,
  stickerSlot,
  trickPiste,
  type StickerTrack,
} from '../lib/rider'
import type { Trick } from '../content/tricks'
import { fmtDate } from '../lib/format'
import { RESORT_BY_ID } from '../content/resorts'
import type { Profile } from '../lib/types'
import { boardStyle, checkDesign, isDarkBoard } from '../lib/boardDesign'

export function RiderAvatar({ photo, name, size = 36, square }: { photo?: string; name: string; size?: number; square?: boolean }) {
  const shape = square ? 'rounded-[22%]' : 'rounded-full'
  if (photo)
    return (
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        className={cx('shrink-0 object-cover', shape)}
        style={{ width: size, height: size }}
      />
    )
  return (
    <span
      aria-hidden
      className={cx('grid shrink-0 place-items-center bg-accent font-bold text-accent-ink', shape)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name.trim() || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

const STANCE: Record<string, string> = { regular: 'Regular', goofy: 'Goofy' }

export function resortName(id?: string) {
  return id ? (RESORT_BY_ID.get(id)?.name ?? id) : undefined
}

/** Je profiel als skipas: foto, naam, level, stance, thuisresort en geldig t/m einde seizoen. */
export function SkiPass({
  userId,
  name,
  profile,
  level,
  levelName,
  progress,
  now = new Date(),
}: {
  userId: string | null
  name: string
  profile: Partial<Profile>
  level: number
  levelName: string
  /** 0..1 naar het volgende level; undefined = onbekend (crewgenoot) */
  progress?: number
  now?: Date
}) {
  const season = seasonFor(now)
  const stance = profile.stance && STANCE[profile.stance]
  const angles = stance && profile.angleFront !== undefined ? ` · ${profile.angleFront}° / ${profile.angleBack}°` : ''
  const bars = barcode(userId ?? name)
  let x = 0
  return (
    <div className="card relative overflow-hidden" aria-label={`Skipas van ${name}`} role="group">
      <div className="flex gap-4 p-4">
        <RiderAvatar photo={profile.photo} name={name} size={84} square />
        <div className="min-w-0 flex-1">
          <div className="display truncate text-[32px]">{name}</div>
          {profile.nickname && <div className="mt-1 truncate text-[15px] text-muted">“{profile.nickname}”</div>}
          <div className="mt-2 text-[15px]">
            Level <span className="num">{level}</span> · {levelName}
          </div>
          {progress !== undefined && <Progress value={progress} className="mt-2" />}
        </div>
      </div>
      {profile.motto && <p className="px-4 pb-3 text-[15px]">{profile.motto}</p>}

      {/* perforatie met de twee uitsparingen, zoals een echte pas */}
      <div className="relative border-t border-dashed hairline">
        <span className="absolute -left-2.5 -top-2.5 size-5 rounded-full bg-bg" />
        <span className="absolute -right-2.5 -top-2.5 size-5 rounded-full bg-bg" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
        <PassField label="Stance" value={stance ? stance + angles : 'Nog niet gekozen'} />
        <PassField label="Thuisresort" value={resortName(profile.homeResort) ?? 'Nog niet gekozen'} />
        <PassField label="Seizoen" value={season.label} />
        <PassField label="Geldig t/m" value={fmtDate(season.until)} />
      </dl>
      <div className="flex items-end justify-between gap-4 px-4 pb-4">
        <svg aria-hidden width={bars.reduce((a, w) => a + w * 2, 0)} height="28" className="text-text">
          {bars.map((w, i) => {
            const r = <rect key={i} x={x} y="0" width={w} height="28" fill="currentColor" />
            x += w * 2
            return r
          })}
        </svg>
        <span className="num text-[13px] text-muted">{passNumber(userId)}</span>
      </div>
    </div>
  )
}

function PassField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="truncate text-[15px]">{value}</dd>
    </div>
  )
}

const pisteColor = (id: string) => PISTES.find((p) => p.id === id)?.color

function Sticker({ trick, rotate = 0, className, style }: { trick: Trick; rotate?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cx(
        'inline-block max-w-[92px] truncate rounded-full border-2 border-white px-2.5 py-1 text-[12px] font-bold text-white shadow-md',
        className,
      )}
      style={{ background: pisteColor(trickPiste(trick.level)), rotate: `${rotate}deg`, ...style }}
    >
      {trick.name}
    </span>
  )
}

/** Je board met je gelande tricks als stickers erop, de moeilijkste eerst. */
export function StickerBoard({ landed, design: raw }: { landed: string[]; design?: unknown }) {
  const { shown, more } = boardStickers(landed)
  const names = shown.map((t) => t.name).join(', ')
  // ontwerp komt uit een profiel (ook dat van een ander): alleen geldige palet-ids
  const design = checkDesign(raw)
  const dark = design ? isDarkBoard(design) : false
  return (
    <div
      role="img"
      aria-label={shown.length ? `Je board met stickers: ${names}${more ? ` en nog ${more}` : ''}` : 'Leeg board, nog geen stickers'}
      data-pattern={design?.pattern ?? 'standaard'}
      className={cx('relative h-[176px] overflow-hidden rounded-full border-2 hairline', !design && 'bg-surface')}
      style={
        design
          ? boardStyle(design)
          : { backgroundImage: 'repeating-linear-gradient(115deg, transparent 0 22px, var(--surface-2) 22px 30px)' }
      }
    >
      {/* inserts van de bindingen */}
      {[30, 70].map((x) => (
        <span
          key={x}
          aria-hidden
          className="absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 grid-cols-2 gap-x-3 gap-y-2.5"
          style={{ left: `${x}%` }}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={cx('size-1.5 rounded-full', !design ? 'bg-line' : dark ? 'bg-white/55' : 'bg-black/25')} />
          ))}
        </span>
      ))}
      {shown.map((t, i) => {
        const at = stickerSlot(i, t.id)
        return (
          <Sticker
            key={t.id}
            trick={t}
            rotate={at.rotate}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${at.x}%`, top: `${at.y}%` }}
          />
        )
      })}
      {more > 0 &&
        (() => {
          const at = stickerSlot(shown.length, '+')
          return (
            <span
              className="num absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-text px-2.5 py-1 text-[12px] font-bold text-bg shadow-md"
              style={{ left: `${at.x}%`, top: `${at.y}%`, rotate: `${at.rotate}deg` }}
            >
              +{more}
            </span>
          )
        })()}
      {!shown.length && (
        <span
          className={cx(
            'absolute inset-0 grid place-items-center px-10 text-center text-[15px]',
            !design ? 'text-muted' : dark ? 'text-white/80' : 'text-black/60',
          )}
        >
          Land je eerste trick en hij komt hier als sticker op
        </span>
      )}
    </div>
  )
}

/** Per track één regel; tik voor alle stickers van die track, ook de lege plekken. */
export function StickerTracks({ landed }: { landed: string[] }) {
  const book = stickerBook(landed)
  const [open, setOpen] = useState<StickerTrack | null>(null)
  return (
    <>
      <List>
        {book.tracks.map((t) => {
          const next = nextSticker(t)
          return (
            <Row
              key={t.track}
              title={t.name}
              detail={next ? `Volgende: ${next.name}` : 'Compleet'}
              value={`${t.landed}/${t.stickers.length}`}
              onClick={() => setOpen(t)}
            />
          )
        })}
      </List>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open && (
          <div className="flex flex-wrap gap-2 pb-6 pt-1">
            {open.stickers.map(({ trick, landed: got }) =>
              got ? (
                <Link key={trick.id} to={`/tricks/${trick.id}`} aria-label={trick.name}>
                  <Sticker trick={trick} className="max-w-none text-[13px]" />
                </Link>
              ) : (
                <Link
                  key={trick.id}
                  to={`/tricks/${trick.id}`}
                  aria-label={`${trick.name}, nog te verdienen`}
                  className="rounded-full border-2 border-dashed hairline px-2.5 py-1 text-[13px] text-muted"
                >
                  {trick.name}
                </Link>
              ),
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}

/** Kleur = moeilijkheid, net als de pistes. */
export function StickerLegend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
      {(['groen', 'blauw', 'rood', 'zwart'] as const).map((p) => (
        <span key={p} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border hairline" style={{ background: pisteColor(p) }} />
          {PISTES.find((x) => x.id === p)?.label}
        </span>
      ))}
      <span>= moeilijkheid</span>
    </div>
  )
}
