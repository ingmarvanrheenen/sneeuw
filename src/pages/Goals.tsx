import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Empty, Page, PageHeader, Section, cx, inputCls } from '../components/ui'
import { Icon } from '../design/icons'
import { TrickPicker } from '../components/Pickers'
import { create, getTrickProgress, remove, setTrickStatus, update, useKind } from '../lib/repo'
import { TRICK_BY_ID } from '../content/tricks'
import { celebrate } from '../lib/toast'
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
    <Card key={g.id} className="flex items-center gap-3 py-3">
      <button
        aria-label={g.done ? 'Markeer als open' : 'Markeer als gehaald'}
        onClick={() => toggle(g)}
        className={cx(
          'grid size-7 shrink-0 place-items-center rounded-lg border-2',
          g.done ? 'border-accent bg-accent text-accent-ink' : 'border-line',
        )}
      >
        {g.done && <Icon name="check" size={16} stroke={2.4} />}
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
      <button aria-label="Verwijderen" onClick={() => remove(g)} className="text-muted">
        <Icon name="trash" size={16} />
      </button>
    </Card>
  )

  return (
    <Page>
      <PageHeader kicker="Doelen" title="Doelen" back />
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
            Trick kiezen
          </Button>
        </div>
      </Card>

      <Section title={`Open ${open.length}`}>
        {open.length ? (
          <div className="space-y-2">{open.map(row)}</div>
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
          <div className="space-y-2">{done.map(row)}</div>
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
