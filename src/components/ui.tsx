import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../design/icons'
import { sfx } from '../lib/sounds'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-xl px-4 pb-28', className)}>{children}</div>
}

/**
 * iOS-achtige grote titel. Bij scrollen verschijnt een compacte balk met de titel klein.
 * `subtitle` staat ónder de titel en draagt echte informatie (datum, voortgang), nooit een label.
 */
export function PageHeader({
  title,
  outline,
  subtitle,
  back,
  right,
}: {
  title: string
  /** tweede deel van de titel in outline-letters (bijv. je naam op Home) */
  outline?: string
  subtitle?: ReactNode
  back?: boolean | string
  right?: ReactNode
}) {
  const nav = useNavigate()
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 56)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const backBtn = back ? (
    <button
      onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
      className="-ml-2 flex h-11 items-center gap-0.5 pr-2 text-[17px] text-accent-text"
    >
      <Icon name="back" size={20} stroke={2.2} />
      Terug
    </button>
  ) : (
    <span />
  )
  return (
    <>
      {/* compacte balk: alleen bruikbaar (ook voor VoiceOver) als hij zichtbaar is, anders staat alles dubbel */}
      <div
        aria-hidden={!compact}
        inert={!compact}
        className={cx(
          'pt-safe fixed inset-x-0 top-0 z-30 border-b bg-bg/90 backdrop-blur-xl transition-[border-color,opacity] duration-200',
          compact ? 'hairline opacity-100' : 'pointer-events-none border-transparent opacity-0',
        )}
      >
        <div className="mx-auto grid h-11 max-w-xl grid-cols-[1fr_auto_1fr] items-center px-4">
          <div className="justify-self-start">{back ? backBtn : null}</div>
          <div className="max-w-[60vw] truncate text-[17px] font-semibold">
            {title}
            {outline ? ` ${outline}` : ''}
          </div>
          <div className="flex items-center gap-2 justify-self-end">{right}</div>
        </div>
      </div>
      <header className="pt-safe mb-5">
        <div className="flex h-11 items-center justify-between">
          {backBtn}
          <div className="flex items-center gap-2">{right}</div>
        </div>
        {/* key: bij een nieuwe titel komt hij opnieuw omhoog */}
        <h1 key={title} className="display rise mt-1 text-[44px] uppercase leading-[0.88] text-text">
          {title}
          {outline && <span className="outline-text"> {outline}</span>}
        </h1>
        {subtitle && <div className="mt-1.5 text-[15px] text-muted">{subtitle}</div>}
      </header>
    </>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'plain'
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
        'inline-flex select-none items-center justify-center gap-2 font-semibold transition duration-150 disabled:opacity-40',
        size === 'sm' && 'h-9 rounded-[6px] px-3.5 text-[15px]',
        size === 'md' && 'h-11 rounded-[6px] px-5 text-[17px]',
        size === 'lg' && 'h-[54px] rounded-[6px] px-6 text-[17px]',
        // primair: zwart/lime met een harde oranje schaduw waar je in drukt; groot in poster-letters
        variant === 'primary' && 'shadow-hard bg-accent text-accent-ink',
        variant === 'primary' && size !== 'sm' && 'display text-[20px] uppercase tracking-[0.02em]',
        variant === 'ghost' && 'bg-surface-2 text-text active:opacity-70',
        variant === 'outline' && 'border-[1.5px] border-text text-text active:opacity-70',
        variant === 'danger' && 'border hairline bg-surface text-danger active:opacity-70',
        variant === 'plain' && 'text-accent-text active:opacity-70',
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
      className={cx('grid size-11 place-items-center rounded-full text-accent-text active:opacity-60', className)}
    >
      {children}
    </button>
  )
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cx('card p-4', onClick && 'cursor-pointer transition-opacity duration-150 active:opacity-70', className)}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </div>
  )
}

/** Sectiekop in poster-stijl: titel in hoofdletters, een doorlopende lijn, en rechts eventueel een actie. */
export function Heading({ children, id, action, className }: { children: ReactNode; id?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-center gap-3', className)}>
      <h2 id={id} className="display text-[26px] uppercase">
        {children}
      </h2>
      <span aria-hidden className="rule" />
      {action}
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
    <section className={cx('mt-8', className)}>
      <Heading action={action}>{title}</Heading>
      {children}
    </section>
  )
}

/** Tekstlink rechts in een sectiekop, iOS-stijl. */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="-my-2.5 -mr-2 px-2 py-2.5 text-[15px] text-accent-text">
      {children}
    </Link>
  )
}

/** Gegroepeerde lijst zoals iOS Instellingen. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('card stagger divide-y divide-[var(--line)] overflow-hidden', className)}>{children}</div>
}

export function Row({
  icon,
  title,
  detail,
  value,
  to,
  onClick,
  chevron = !!(to || onClick),
  className,
  children,
}: {
  icon?: IconName | ReactNode
  title: ReactNode
  detail?: ReactNode
  value?: ReactNode
  to?: string
  onClick?: () => void
  chevron?: boolean
  className?: string
  children?: ReactNode
}) {
  const body = (
    <>
      {icon && (typeof icon === 'string' ? <Icon name={icon as IconName} size={22} className="shrink-0 text-accent-text" /> : icon)}
      <div className="min-w-0 flex-1">
        <div className="truncate">{title}</div>
        {detail && <div className="truncate text-[13px] text-muted">{detail}</div>}
      </div>
      {value !== undefined && <div className="num shrink-0 text-[15px] text-muted">{value}</div>}
      {children}
      {chevron && <Icon name="chevron" size={14} stroke={2.2} className="shrink-0 text-muted/60" />}
    </>
  )
  const cls = cx('flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left', (to || onClick) && 'active:bg-surface-2', className)
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    )
  return <div className={cls}>{body}</div>
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
      aria-pressed={active}
      onClick={() => {
        sfx.toggle()
        onClick?.()
      }}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[15px] transition-colors duration-150',
        active ? 'border-accent bg-accent font-semibold text-accent-ink' : 'hairline bg-surface text-text',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** iOS segmented control. */
/** Aan/uit-rij in iOS-stijl, voor in een `List`. */
export function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button
      onClick={() => {
        onChange(!on)
        sfx.toggle()
      }}
      className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
      role="switch"
      aria-checked={on}
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition', on ? 'bg-accent' : 'bg-surface-2')}>
        <span className={cx('absolute top-1 size-5 rounded-full transition-all', on ? 'left-6 bg-accent-ink' : 'left-1 bg-muted')} />
      </span>
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
    <div className="flex rounded-[8px] bg-surface-2 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => {
            sfx.toggle()
            onChange(o.value)
          }}
          className={cx(
            'h-8 flex-1 rounded-[6px] px-3 text-[13px] font-semibold transition duration-200',
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
        className="grid size-11 place-items-center rounded-full bg-surface-2 active:opacity-60"
      >
        <Icon name="minus" size={18} />
      </button>
      <div className="display num min-w-14 text-center text-[32px]">
        {value}
        {suffix && <span className="ml-1 text-sm text-muted">{suffix}</span>}
      </div>
      <button
        type="button"
        aria-label="Meer"
        onClick={() => set(value + step)}
        className="grid size-11 place-items-center rounded-full bg-surface-2 active:opacity-60"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}

/** `group`: voor knoppen of chips. Een <label> zou zijn naam aan de eerste knop geven en tikken doorsturen. */
export function Field({ label, children, hint, group }: { label: string; children: ReactNode; hint?: string; group?: boolean }) {
  const body = (
    <>
      <span className="label pl-1">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 pl-1 text-[13px] text-muted">{hint}</p>}
    </>
  )
  return group ? (
    <div role="group" aria-label={label} className="mt-4 block">
      {body}
    </div>
  ) : (
    <label className="mt-4 block">{body}</label>
  )
}

export const inputCls =
  'w-full rounded-[6px] border border-transparent bg-surface px-4 py-3 text-text outline-none placeholder:text-muted/70 focus:border-accent'

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={cx('h-2 overflow-hidden rounded-[2px] bg-surface-2', className)}
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
    >
      {/* loopt vol bij het openen (grow), daarna schuift hij mee */}
      <div
        className="grow h-full rounded-[2px] bg-accent transition-[width] duration-500 ease-[var(--ease-out-expo)]"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  )
}

/** Lege staat die uitlegt wat hier komt en hoe je begint. */
export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 text-muted">{icon}</div>
      <div className="text-[17px] font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-xs text-[15px] text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  closeLabel = 'Klaar',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  closeLabel?: string
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)]" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="sheet-in pb-safe max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-[14px] bg-bg px-4 pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1.5 w-9 rounded-full bg-line" />
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center">
          <span />
          <h3 className="display text-[22px] uppercase">{title}</h3>
          <button onClick={onClose} className="justify-self-end text-[17px] font-semibold text-accent-text">
            {closeLabel}
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Getal + omschrijving. Zet er meerdere in een `StatGroup`. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="px-3 py-3">
      <div className="display num text-[32px]">{value}</div>
      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">
        {label}
        {sub ? ` ${sub}` : ''}
      </div>
    </div>
  )
}

export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('card grid grid-cols-3 divide-x divide-[var(--line)]', className)}>{children}</div>
}

export function LevelDots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Niveau ${level} van 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cx('h-1.5 w-2.5 rounded-[1px]', i <= level ? 'bg-accent' : 'bg-line')} />
      ))}
    </span>
  )
}

/** Landcode als klein tagje (geen vlag-emoji). */
export function CountryTag({ code }: { code: string }) {
  return (
    <span className="inline-grid h-6 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-[11px] font-semibold text-muted">
      {code}
    </span>
  )
}
