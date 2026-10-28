import { dismissToast, toastStore } from '../lib/toast'
import { cx } from './ui'
import { Icon } from '../design/icons'

export function Toasts() {
  const list = toastStore.use()
  return (
    <div className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4">
      {list.map((t) => {
        // feest (level, badge, geland): als poster-sticker erop geklapt; de rest schuift rustig in
        const party = t.tone === 'level' || t.tone === 'badge' || t.tone === 'success'
        return (
          <div
            key={t.id}
            data-tone={t.tone ?? 'default'}
            className={cx(
              'mt-2 flex w-full max-w-sm items-center gap-3 rounded-[8px] border px-4 py-3',
              party
                ? 'slap border-block bg-block text-block-ink shadow-[4px_4px_0_var(--hot)] [--tilt:-1.5deg]'
                : 'pop-in shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md',
              t.tone === 'error' ? 'border-danger/40 bg-surface/95' : !party && 'hairline bg-surface/95',
            )}
          >
            {t.icon && (
              <div
                className={cx(
                  'grid size-10 shrink-0 place-items-center rounded-[6px]',
                  party ? 'bg-[var(--sticker)] text-[var(--hot-ink)]' : 'bg-accent-soft text-accent-text',
                )}
              >
                <Icon name={t.icon} size={22} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className={party ? 'display text-[20px] uppercase' : 'text-sm font-semibold'}>{t.title}</div>
              {t.body && <div className={cx('text-xs', party ? 'opacity-80' : 'text-muted')}>{t.body}</div>}
            </div>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
                className="pointer-events-auto -my-2 -mr-2 shrink-0 px-3 py-3 text-[15px] font-semibold text-accent-text"
              >
                {t.action.label}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
