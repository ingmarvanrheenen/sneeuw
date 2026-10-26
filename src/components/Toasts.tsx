import { toastStore } from '../lib/toast'
import { cx } from './ui'
import { Icon } from '../design/icons'

export function Toasts() {
  const list = toastStore.use()
  return (
    <div className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4">
      {list.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pop-in mt-2 flex w-full max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 shadow-[var(--shadow)] backdrop-blur-md',
            t.tone === 'error'
              ? 'border-danger/40 bg-surface/95'
              : t.tone === 'level' || t.tone === 'badge'
                ? 'border-accent bg-surface/95'
                : 'hairline bg-surface/95',
          )}
        >
          {t.icon && (
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
              <Icon name={t.icon} size={22} />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t.title}</div>
            {t.body && <div className="text-xs text-muted">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
