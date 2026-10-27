import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Page, PageHeader, Progress, Section, Stat, cx, inputCls, StatGroup } from '../components/ui'
import { Icon } from '../design/icons'
import { remove, update, useKind, useRecord } from '../lib/repo'
import { daysUntil, fmtShort } from '../lib/format'
import { uid } from '../lib/ids'
import { sfx } from '../lib/sounds'
import { celebrate } from '../lib/toast'
import type { PackItem } from '../lib/types'

export default function TripDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const trip = useRecord('trip', id)
  const sessions = useKind('session')
  const goals = useKind('goal')
  const [newItem, setNewItem] = useState('')
  const [hideDone, setHideDone] = useState(false)

  const groups = useMemo(() => {
    const m = new Map<string, PackItem[]>()
    for (const p of trip?.packing ?? []) m.set(p.category, [...(m.get(p.category) ?? []), p])
    return [...m.entries()]
  }, [trip])

  if (!trip) return null
  const packed = trip.packing.filter((p) => p.checked).length
  const tripSessions = (sessions ?? []).filter((s) => s.tripId === trip.id)
  const tripGoals = (goals ?? []).filter((g) => g.tripId === trip.id)

  async function setPacking(packing: PackItem[]) {
    const wasDone = trip!.packing.length > 0 && trip!.packing.every((p) => p.checked)
    await update(trip!, { packing })
    if (!wasDone && packing.length > 0 && packing.every((p) => p.checked))
      celebrate('goal', 'Alles ingepakt', 'Klaar om te gaan', 'suitcase')
  }

  return (
    <Page>
      <PageHeader subtitle={trip.resortName ?? 'Trip'} title={trip.name} back="/reizen" />
      <StatGroup>
        <Stat label="Over" value={trip.startDate ? Math.max(0, daysUntil(trip.startDate)) : '–'} sub="dagen" />
        <Stat label="Gelogd" value={tripSessions.length} sub="dagen" />
        <Stat label="Ingepakt" value={`${trip.packing.length ? Math.round((packed / trip.packing.length) * 100) : 0}%`} />
      </StatGroup>
      {trip.startDate && (
        <div className="label mt-2">
          {fmtShort(trip.startDate)}
          {trip.endDate ? ` – ${fmtShort(trip.endDate)}` : ''}
        </div>
      )}

      {tripGoals.length > 0 && (
        <Section title="Doelen deze trip">
          <div className="card divide-y divide-[var(--line)]">
            {tripGoals.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                <Icon name={g.done ? 'stomp' : 'target'} size={18} className={g.done ? 'text-accent-text' : 'text-muted'} />
                <span className={cx('text-sm', g.done && 'text-muted line-through')}>{g.title}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title={`Paklijst ${packed}/${trip.packing.length}`}
        action={
          <button onClick={() => setHideDone((h) => !h)} className="label !text-accent-text">
            {hideDone ? 'toon alles' : 'verberg ingepakt'}
          </button>
        }
      >
        <Progress value={trip.packing.length ? packed / trip.packing.length : 0} />
        {groups.map(([cat, items]) => {
          const shown = hideDone ? items.filter((i) => !i.checked) : items
          if (!shown.length) return null
          return (
            <div key={cat} className="mt-4">
              <div className="label mb-1.5">{cat}</div>
              <div className="card divide-y divide-[var(--line)] overflow-hidden p-0">
                {shown.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      aria-label={item.checked ? 'Uitvinken' : 'Afvinken'}
                      onClick={() => {
                        sfx.toggle()
                        void setPacking(trip.packing.map((p) => (p.id === item.id ? { ...p, checked: !p.checked } : p)))
                      }}
                      className={cx(
                        'grid size-6 shrink-0 place-items-center rounded-md border-2',
                        item.checked ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                      )}
                    >
                      {item.checked && <Icon name="check" size={14} stroke={2.6} />}
                    </button>
                    <span className={cx('flex-1 text-sm', item.checked && 'text-muted line-through')}>{item.label}</span>
                    <button
                      aria-label="Verwijderen"
                      onClick={() => setPacking(trip.packing.filter((p) => p.id !== item.id))}
                      className="text-muted/60"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newItem.trim()) return
            void setPacking([...trip.packing, { id: uid(), label: newItem.trim(), category: 'Eigen', checked: false }])
            setNewItem('')
          }}
        >
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Eigen item toevoegen" className={inputCls} />
          <Button type="submit" variant="ghost">
            <Icon name="plus" size={18} />
          </Button>
        </form>
      </Section>

      {tripSessions.length > 0 && (
        <Section title="Dagen">
          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {tripSessions.map((s) => (
              <Link key={s.id} to={`/log/${s.id}`} className="flex justify-between px-4 py-3 text-[15px] active:bg-surface-2">
                <span>{fmtShort(s.date)}</span>
                <span className="num text-muted">
                  {s.hours}u · {s.falls} val
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Button
        variant="danger"
        className="mt-8 w-full"
        icon={<Icon name="trash" size={16} />}
        onClick={async () => {
          if (!confirm('Trip verwijderen? Je gelogde dagen blijven bestaan.')) return
          await remove(trip)
          nav('/reizen', { replace: true })
        }}
      >
        Trip verwijderen
      </Button>
    </Page>
  )
}
