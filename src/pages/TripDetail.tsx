import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, List, Page, PageHeader, Progress, Row, Section, Stat, Toggle, cx, inputCls, StatGroup } from '../components/ui'
import { GroupList } from '../components/GroupList'
import { CrewGoals } from '../components/CrewGoals'
import { TripRecap } from '../components/TripRecap'
import { todayISO, uid } from '../lib/ids'
import { useLiveQuery } from 'dexie-react-hooks'
import { kvGet } from '../lib/db'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import { cachedCrews, myCrews, type Crew } from '../lib/crew'
import { Icon } from '../design/icons'
import { remove, update, useKind, useRecord } from '../lib/repo'
import { daysUntil, fmtShort } from '../lib/format'

import { sfx } from '../lib/sounds'
import { celebrate, undoToast } from '../lib/toast'
import type { PackItem, Trip } from '../lib/types'

/** Trip delen met je crew, plus de gedeelde groepslijst zodra hij gedeeld is. */
function CrewShare({ trip }: { trip: Trip }) {
  const { user } = authStore.use()
  const [crews, setCrews] = useState<Crew[]>([])
  const syncedCrew = useLiveQuery(() => kvGet<string | null>(`tripCrew:${trip.id}`, null), [trip.id])
  useEffect(() => {
    if (!hasBackend || !user) return
    let alive = true
    void cachedCrews().then((c) => alive && setCrews(c))
    if (navigator.onLine)
      myCrews()
        .then((c) => alive && setCrews(c))
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [user])
  if (!hasBackend || !user) return null
  const shared = crews.find((c) => c.id === trip.crewId)
  // klaar als de server de trip al met deze crew kent; een niet-gesyncte paklijst-wijziging doet daar niks aan af
  const ready = syncedCrew === trip.crewId || !trip.dirty

  return (
    <>
      <Section title="Met je crew">
        {crews.length === 0 ? (
          <List>
            <Row icon="crew" title="Deel deze trip met je crew" detail="Start of join eerst een crew" to="/crew" />
          </List>
        ) : (
          <List>
            {crews.map((c) => (
              <Toggle
                key={c.id}
                on={trip.crewId === c.id}
                onChange={(on) => void update(trip, { crewId: on ? c.id : null })}
                label={`Delen met ${c.name}`}
                sub={trip.crewId === c.id ? 'Je crew ziet de trip en vult de groepslijst mee' : 'Dan zie je samen wie wat meeneemt'}
              />
            ))}
          </List>
        )}
      </Section>
      {shared && (
        <>
          {trip.startDate && trip.startDate <= todayISO() && <TripRecap tripId={trip.id} crewId={shared.id} trip={trip} />}
          <CrewGoals tripId={trip.id} crewId={shared.id} ownerId={trip.userId ?? user.id} ready={ready} />
          <GroupList tripId={trip.id} crewId={shared.id} ownerId={trip.userId ?? user.id} ready={ready} />
        </>
      )}
    </>
  )
}

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

      <CrewShare trip={trip} />

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
        title={`${trip.crewId ? 'Je eigen paklijst' : 'Paklijst'} ${packed}/${trip.packing.length}`}
        action={
          <button onClick={() => setHideDone((h) => !h)} className="-my-2.5 -mr-2 px-2 py-2.5 text-[15px] text-accent-text">
            {hideDone ? 'Toon alles' : 'Verberg ingepakt'}
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
                  <div key={item.id} className="flex items-center">
                    {/* hele rij is de knop: ook met handschoenen raak je hem */}
                    <button
                      role="checkbox"
                      aria-checked={!!item.checked}
                      onClick={() => {
                        sfx.toggle()
                        void setPacking(trip.packing.map((p) => (p.id === item.id ? { ...p, checked: !p.checked } : p)))
                      }}
                      className="flex min-h-12 flex-1 items-center gap-3 py-2.5 pl-4 text-left active:bg-surface-2"
                    >
                      <span
                        className={cx(
                          'grid size-6 shrink-0 place-items-center rounded-md border-2',
                          item.checked ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                        )}
                      >
                        {item.checked && <Icon name="check" size={14} stroke={2.6} />}
                      </span>
                      <span className={cx('flex-1 text-[15px]', item.checked && 'text-muted line-through')}>{item.label}</span>
                    </button>
                    <button
                      aria-label={`${item.label} verwijderen`}
                      onClick={async () => {
                        const before = trip.packing
                        await setPacking(before.filter((p) => p.id !== item.id))
                        undoToast(`${item.label} weg`, () => void setPacking(before))
                      }}
                      className="grid size-12 shrink-0 place-items-center text-muted/60 active:text-danger"
                    >
                      <Icon name="close" size={16} />
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
