import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../design/icons'
import { sfx } from '../lib/sounds'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-xl px-4 pb-28', className)}>{children}</div>
}

export function PageHeader({ title, kicker, back, right }: { title: string; kicker?: string; back?: boolean | string; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="pt-safe sticky top-0 z-20 -mx-4 mb-4 border-b hairline bg-bg/85 px-4 pb-3 backdrop-blur-md">
      <div className="flex min-h-11 items-end justify-between gap-3">
        <div className="flex min-w-0 items-end gap-2">
          {back && (
            <button
              aria-label="Terug"
              onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
              className="-ml-2 mb-0.5 grid size-9 place-items-center rounded-full text-muted active:bg-surface-2"
            >
              <Icon name="back" size={20} />
            </button>
          )}
          <div className="min-w-0">
            {kicker && <div className="label">{kicker}</div>}
            <h1 className="truncate text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
          </div>
        </div>
        {right && <div className="mb-1 flex shrink-0 items-center gap-2">{right}</div>}
      </div>
    </header>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', icon, className, children, onClick, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        sfx.tap()
        onClick?.(e)
      }}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.97] disabled:opacity-40',
        size === 'sm' && 'h-9 px-3.5 text-sm',
        size === 'md' && 'h-11 px-5 text-[15px]',
        size === 'lg' && 'h-14 px-6 text-base',
        variant === 'primary' && 'bg-accent text-accent-ink',
        variant === 'ghost' && 'bg-surface-2 text-text',
        variant === 'outline' && 'border hairline text-text',
        variant === 'danger' && 'bg-danger/15 text-danger',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  children,
  onClick,
  className,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      aria-label={label}
      onClick={() => {
        sfx.tap()
        onClick?.()
      }}
      className={cx('grid size-10 place-items-center rounded-full border hairline bg-surface text-text active:scale-95', className)}
    >
      {children}
    </button>
  )
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cx('card p-4', onClick && 'cursor-pointer transition active:scale-[0.99]', className)}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </div>
  )
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('mt-6', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => {
        sfx.toggle()
        onClick?.()
      }}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition active:scale-95',
        active ? 'border-accent bg-accent text-accent-ink' : 'hairline bg-surface text-text',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-full border hairline bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            sfx.toggle()
            onChange(o.value)
          }}
          className={cx(
            'h-9 flex-1 rounded-full px-3 text-sm font-medium transition',
            value === o.value ? 'bg-accent text-accent-ink' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  const set = (v: number) => {
    sfx.tap()
    onChange(Math.max(min, Math.min(max, Math.round(v * 10) / 10)))
  }
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Minder"
        onClick={() => set(value - step)}
        className="grid size-11 place-items-center rounded-full border hairline bg-surface active:scale-95"
      >
        <Icon name="minus" size={18} />
      </button>
      <div className="num min-w-16 text-center text-2xl font-semibold">
        {value}
        {suffix && <span className="ml-1 text-sm text-muted">{suffix}</span>}
      </div>
      <button
        type="button"
        aria-label="Meer"
        onClick={() => set(value + step)}
        className="grid size-11 place-items-center rounded-full border hairline bg-surface active:scale-95"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mt-4 block">
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-2xl border hairline bg-surface px-4 py-3 text-text outline-none placeholder:text-muted/70 focus:border-accent'

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-surface-2', className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-4xl">{icon}</div>
      <div className="font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="pop-in pb-safe max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] border-t hairline bg-surface px-4 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button aria-label="Sluiten" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-surface-2">
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card p-3.5">
      <div className="label">{label}</div>
      <div className="num mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function LevelDots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Niveau ${level} van 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cx('h-1.5 w-3 rounded-full', i <= level ? 'bg-accent' : 'bg-line')} />
      ))}
    </span>
  )
}

/** Landcode als klein mono-tagje (geen vlag-emoji). */
export function CountryTag({ code }: { code: string }) {
  return (
    <span className="num inline-grid h-6 w-8 shrink-0 place-items-center rounded-md border hairline text-[10px] font-semibold text-muted">
      {code}
    </span>
  )
}
