import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Empty, Page, PageHeader, Section, cx, inputCls } from '../components/ui'
import { Icon } from '../design/icons'
import { TrickPicker } from '../components/Pickers'
import { create, getTrickProgress, remove, restore, setTrickStatus, update, useKind } from '../lib/repo'
import { TRICK_BY_ID } from '../content/tricks'
import { celebrate, undoToast } from '../lib/toast'
import type { Goal } from '../lib/types'

export default function Goals() {
  const goals = useKind('goal')
  const trips = useKind('trip')
  const [title, setTitle] = useState('')
  const [tripId, setTripId] = useState('')
  const [pick, setPick] = useState(false)
  const open = (goals ?? []).filter((g) => !g.done).sort((a, b) => b.createdAt - a.createdAt)
  const done = (goals ?? []).filter((g) => g.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))

  async function toggle(g: Goal) {
    await update(g, { done: !g.done, doneAt: g.done ? undefined : Date.now() })
    if (!g.done) {
      celebrate('goal', 'Doel gehaald', g.title, 'target')
      if (g.trickId) {
        const p = await getTrickProgress(g.trickId)
        if (p?.status !== 'beheerst') await setTrickStatus(g.trickId, 'geland')
      }
    }
  }

  const row = (g: Goal) => (
    <div key={g.id} className="flex items-center gap-1 py-1.5 pl-2">
      <button
        aria-label={g.done ? 'Markeer als open' : 'Markeer als gehaald'}
        onClick={() => toggle(g)}
        className="grid size-12 shrink-0 place-items-center"
      >
        <span
          className={cx(
            'grid size-7 place-items-center rounded-[4px] border-2',
            g.done ? 'border-accent bg-accent text-accent-ink' : 'border-line',
          )}
        >
          {g.done && <Icon name="check" size={16} stroke={2.4} />}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className={cx('text-sm', g.done && 'text-muted line-through')}>{g.title}</div>
        <div className="label flex gap-2">
          {g.trickId && (
            <Link to={`/tricks/${g.trickId}`} className="!text-accent-text">
              {TRICK_BY_ID.get(g.trickId)?.name}
            </Link>
          )}
          {g.tripId && <span>{trips?.find((t) => t.id === g.tripId)?.name}</span>}
        </div>
      </div>
      <button
        aria-label={`${g.title} verwijderen`}
        onClick={async () => {
          await remove(g)
          undoToast('Doel verwijderd', () => void restore(g))
        }}
        className="grid size-12 shrink-0 place-items-center text-muted active:text-danger"
      >
        <Icon name="trash" size={17} />
      </button>
    </div>
  )

  return (
    <Page>
      <PageHeader title="Doelen" back />
      <Card>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bijv. 'rode piste zonder vallen'"
          className={inputCls}
        />
        {!!trips?.length && (
          <select value={tripId} onChange={(e) => setTripId(e.target.value)} className={cx(inputCls, 'mt-2')}>
            <option value="">Geen trip</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            disabled={!title.trim()}
            icon={<Icon name="plus" size={16} />}
            onClick={async () => {
              await create('goal', { title: title.trim(), done: false, tripId: tripId || undefined })
              setTitle('')
            }}
          >
            Toevoegen
          </Button>
          <Button variant="ghost" icon={<Icon name="book" size={16} />} onClick={() => setPick(true)}>
            Trick
          </Button>
        </div>
      </Card>

      <Section title={`Open ${open.length}`}>
        {open.length ? (
          <div className="card divide-y divide-[var(--line)] overflow-hidden">{open.map(row)}</div>
        ) : (
          <Empty
            icon={<Icon name="target" size={36} className="text-muted" />}
            title="Geen open doelen"
            body="Kies een trick uit de bijbel of typ je eigen doel."
          />
        )}
      </Section>
      {done.length > 0 && (
        <Section title={`Gehaald ${done.length}`}>
          <div className="card divide-y divide-[var(--line)] overflow-hidden">{done.map(row)}</div>
        </Section>
      )}

      <TrickPicker
        open={pick}
        onClose={() => setPick(false)}
        selected={[]}
        title="Welke trick wil je leren?"
        onChange={async (ids) => {
          for (const id of ids) {
            await create('goal', { title: `${TRICK_BY_ID.get(id)?.name} leren`, trickId: id, done: false, tripId: tripId || undefined })
            if (!(await getTrickProgress(id))) await setTrickStatus(id, 'wil')
          }
          setPick(false)
        }}
      />
    </Page>
  )
}
