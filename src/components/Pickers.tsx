import { useMemo, useState } from 'react'
import { Icon } from '../design/icons'
import { TRICKS, TRACKS } from '../content/tricks'
import { RESORTS, type Resort } from '../content/resorts'
import { Button, Sheet, cx, inputCls, LevelDots, CountryTag } from './ui'

export function TrickPicker({
  open,
  onClose,
  selected,
  onChange,
  title = 'Kies tricks',
}: {
  open: boolean
  onClose: () => void
  selected: string[]
  onChange: (ids: string[]) => void
  title?: string
}) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return TRICKS.filter((t) => !s || t.name.toLowerCase().includes(s) || t.aka?.some((a) => a.toLowerCase().includes(s)))
  }, [q])
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="relative mb-3">
        <Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek trick…" className={cx(inputCls, 'pl-10')} />
      </div>
      {TRACKS.map((track) => {
        const items = list.filter((t) => t.track === track.id)
        if (!items.length) return null
        return (
          <div key={track.id} className="mb-3">
            <div className="label mb-1">{track.name}</div>
            <div className="card divide-y divide-[var(--line)] overflow-hidden p-0">
              {items.map((t) => {
                const on = selected.includes(t.id)
                return (
                  <button key={t.id} onClick={() => toggle(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span
                      className={cx(
                        'grid size-6 place-items-center rounded-md border',
                        on ? 'border-accent bg-accent text-accent-ink' : 'hairline',
                      )}
                    >
                      {on && <Icon name="check" size={14} stroke={2.4} />}
                    </span>
                    <span className="flex-1 text-sm">{t.name}</span>
                    <LevelDots level={t.level} />
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="sticky bottom-0 bg-surface py-3">
        <Button className="w-full" onClick={onClose}>
          Klaar ({selected.length})
        </Button>
      </div>
    </Sheet>
  )
}

export function ResortPicker({
  open,
  onClose,
  onPick,
  title = 'Waar was je?',
}: {
  open: boolean
  onClose: () => void
  onPick: (r: { id?: string; name: string; resort?: Resort }) => void
  title?: string
}) {
  const [q, setQ] = useState('')
  const list = RESORTS.filter(
    (r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.region.toLowerCase().includes(q.toLowerCase()),
  )
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="relative mb-3">
        <Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek of typ een naam…" className={cx(inputCls, 'pl-10')} />
      </div>
      {q && !list.some((r) => r.name.toLowerCase() === q.toLowerCase()) && (
        <button onClick={() => onPick({ name: q })} className="card mb-2 w-full p-3 text-left text-sm">
          “{q}” gebruiken
        </button>
      )}
      <div className="card mb-4 divide-y divide-[var(--line)] overflow-hidden p-0">
        {list.map((r) => (
          <button
            key={r.id}
            onClick={() => onPick({ id: r.id, name: r.name, resort: r })}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <CountryTag code={r.country} />
            <span className="flex-1">
              <span className="block text-sm">{r.name}</span>
              <span className="label">{r.region}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
