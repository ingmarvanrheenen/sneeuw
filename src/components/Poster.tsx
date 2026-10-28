// Poster-onderdelen van de park-stijl: sticker, stempel, tape en een balk in blokjes.
// Stickers en stempels worden erop "geklapt" (`.slap`), de blokjes lopen één voor één vol.
import type { CSSProperties, ReactNode } from 'react'
import type { LevelInfo } from '../lib/progress'
import { cx } from './ui'

/** Ster-sticker: punten rondom, gekanteld. `tilt` in graden, `delay` in ms voor het erop klappen. */
export function Sticker({
  children,
  size = 100,
  tilt = 12,
  delay = 250,
  className,
}: {
  children: ReactNode
  size?: number
  tilt?: number
  delay?: number
  className?: string
}) {
  const points = Array.from({ length: 24 }, (_, i) => {
    const r = i % 2 ? 39 : 50
    const a = (i * Math.PI) / 12
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')
  return (
    <div
      className={cx('slap pointer-events-none absolute drop-shadow-[0_3px_0_rgba(0,0,0,0.25)]', className)}
      style={{ width: size, height: size, '--tilt': `${tilt}deg`, '--delay': `${delay}ms` } as CSSProperties}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        <polygon points={points} fill="var(--sticker)" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center text-[10px] font-extrabold uppercase leading-none tracking-[0.06em] text-[var(--hot-ink)]">
        {children}
      </div>
    </div>
  )
}

/** Stempel: klein oranje label, scheef erop geklapt. */
export function Stamp({
  children,
  tilt = -7,
  delay = 300,
  className,
}: {
  children: ReactNode
  tilt?: number
  delay?: number
  className?: string
}) {
  return (
    <span
      className={cx(
        'slap inline-block rounded-[3px] bg-hot px-2.5 py-1 text-[12px] font-extrabold uppercase tracking-[0.08em] text-hot-ink',
        className,
      )}
      style={{ '--tilt': `${tilt}deg`, '--delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </span>
  )
}

/** Stukje tape over de rand van een blok. */
export function Tape({ className }: { className?: string }) {
  return <span aria-hidden className={cx('absolute h-5 w-[70px] -rotate-[5deg] bg-[var(--tape)]', className)} />
}

/** Voortgang in blokjes (zoals een poster), loopt bij het openen één voor één vol. */
export function Segments({ value, count = 12, className }: { value: number; count?: number; className?: string }) {
  const on = Math.round(Math.max(0, Math.min(1, value)) * count)
  return (
    <div className={cx('flex gap-[3px]', className)} role="progressbar" aria-valuenow={Math.round(value * 100)}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="relative h-3.5 flex-1 bg-current/25">
          {i < on && <span className="grow absolute inset-0 bg-current" style={{ '--delay': `${150 + i * 45}ms` } as CSSProperties} />}
        </span>
      ))}
    </div>
  )
}

/** Bergvorm voor in een poster: twee toppen, in de tekstkleur van het blok. */
export function Peaks({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 190 120" aria-hidden className={cx('pointer-events-none absolute opacity-[0.16]', className)}>
      <path d="M0 120 L50 40 L75 70 L115 10 L190 120Z" fill="currentColor" />
    </svg>
  )
}

/**
 * Je level als poster: seizoen, levelnaam groot, bergvorm, tape, sticker met level en XP, en een balk in blokjes.
 * Met `onClick` is het een knop (Home opent je badges).
 */
export function LevelPoster({
  level,
  badges,
  season,
  onClick,
  className,
}: {
  level: LevelInfo
  badges: number
  season: string
  onClick?: () => void
  className?: string
}) {
  const body = (
    <>
      <Tape className="-top-2.5 left-6" />
      <Peaks className="bottom-10 right-0 w-[170px]" />
      <Sticker className="-right-2 -top-6" size={98}>
        <span>
          Level
          <span className="display block text-[32px] tracking-normal">{level.level}</span>
          <span className="num">{level.xp} XP</span>
        </span>
      </Sticker>
      <span className="block text-[12px] font-extrabold uppercase tracking-[0.1em]">Seizoen {season}</span>
      <span className="display mt-3 block max-w-[78%] text-[64px] uppercase leading-[0.82]">{level.name}</span>
      <Segments value={level.progress} className="mt-4" />
      <span className="mt-2 block text-[12px] font-extrabold uppercase tracking-[0.08em] opacity-80">
        {level.next ? `Nog ${level.needed - level.current} XP tot ${level.next}` : 'Max level. Respect.'} · {badges} badges
      </span>
    </>
  )
  const cls = cx('relative block w-full rounded-[6px] bg-block p-4 pb-3.5 text-left text-block-ink', className)
  return onClick ? (
    <button
      onClick={onClick}
      aria-label={`Level ${level.level}, ${level.name}, ${level.xp} XP`}
      className={cx(cls, 'transition-transform duration-150 active:scale-[0.98]')}
    >
      {body}
    </button>
  ) : (
    <div role="group" aria-label={`Level ${level.level}, ${level.name}, ${level.xp} XP`} className={cls}>
      {body}
    </div>
  )
}
