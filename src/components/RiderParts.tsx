// Bouwstenen van het rider-profiel: avatar, skipas en stickerboek.
import { Link } from 'react-router-dom'
import { Progress, cx } from './ui'
import { PISTES } from '../content/logOptions'
import { barcode, passNumber, seasonFor, stickerBook, trickPiste } from '../lib/rider'
import { fmtDate } from '../lib/format'
import { RESORT_BY_ID } from '../content/resorts'
import type { Profile } from '../lib/types'

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

const pisteColor = (id: string) => (id === 'zwart' ? 'var(--text)' : PISTES.find((p) => p.id === id)?.color)

/** Gelande tricks als stickers (randkleur = moeilijkheid), lege plekken voor wat je nog moet verdienen. */
export function StickerBook({ landed }: { landed: string[] }) {
  const book = stickerBook(landed)
  return (
    <div>
      {book.tracks.map((t) => (
        <div key={t.track} className="mt-4 first:mt-0">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[15px] font-medium">{t.name}</span>
            <span className="num text-[13px] text-muted">
              {t.landed}/{t.stickers.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {t.stickers.map(({ trick, landed: got }, i) =>
              got ? (
                <Link
                  key={trick.id}
                  to={`/tricks/${trick.id}`}
                  className="rounded-full border-2 bg-surface px-3 py-1.5 text-[13px] font-semibold shadow-sm"
                  style={{ borderColor: pisteColor(trickPiste(trick.level)), rotate: `${((i * 37) % 7) - 3}deg` }}
                >
                  {trick.name}
                </Link>
              ) : (
                <Link
                  key={trick.id}
                  to={`/tricks/${trick.id}`}
                  aria-label={`${trick.name}, nog te verdienen`}
                  className="rounded-full border border-dashed hairline px-3 py-1.5 text-[13px] text-muted"
                >
                  {trick.name}
                </Link>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
