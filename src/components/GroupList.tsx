// Gedeelde groepslijst van een crew-trip: toevoegen, "ik neem 'm mee" en afvinken, samen met je crew.
import { useCallback, useEffect, useState } from 'react'
import { Chip, List, cx, inputCls } from './ui'
import { Icon, Spinner } from '../design/icons'
import { crewMembers, type CrewMember } from '../lib/crew'
import { GROUP_SUGGESTIONS, addItem, cachedItems, listItems, removeItem, setClaim, setDone, type CrewTripItem } from '../lib/crewTrips'
import { getCurrentUserId } from '../lib/auth-state'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'

export function GroupList({ tripId, crewId, ownerId, ready = true }: { tripId: string; crewId: string; ownerId: string; ready?: boolean }) {
  const me = getCurrentUserId()
  const [items, setItems] = useState<CrewTripItem[] | null>(null)
  const [members, setMembers] = useState<CrewMember[]>([])
  const [text, setText] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!navigator.onLine || !ready) return
    setRefreshing(true)
    try {
      const [list, mem] = await Promise.all([listItems(tripId), crewMembers(crewId)])
      setItems(list)
      setMembers(mem)
    } catch (e) {
      toast({ title: 'Groepslijst laden lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setRefreshing(false)
    }
  }, [tripId, crewId, ready])

  useEffect(() => {
    void cachedItems(tripId).then((c) => setItems((cur) => cur ?? c))
    void load()
    // vers houden: terug in de app, weer bereik, en elke halve minuut zolang je kijkt
    const refresh = () => document.visibilityState === 'visible' && void load()
    const on = () => {
      setOnline(navigator.onLine)
      refresh()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    const t = setInterval(refresh, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', on)
      clearInterval(t)
    }
  }, [tripId, load])

  const name = (uid: string | null) => members.find((m) => m.user_id === uid)?.display_name ?? 'Iemand'
  const canEdit = online && ready

  /** Meteen tonen, dan pas opslaan; lukt het niet, dan terug naar wat de server zegt. */
  async function change(next: (list: CrewTripItem[]) => CrewTripItem[], run: () => Promise<unknown>) {
    setItems((cur) => next(cur ?? []))
    try {
      await run()
    } catch (e) {
      toast({ title: 'Niet opgeslagen', body: errMsg(e), tone: 'error', icon: 'alert' })
      void load()
    }
  }

  async function add(label: string, claim = false) {
    const clean = label.trim()
    if (!clean || !canEdit) return
    setText('')
    try {
      const item = await addItem(crewId, tripId, clean, claim)
      sfx.tap()
      setItems((cur) => [...(cur ?? []), item])
    } catch (e) {
      toast({ title: 'Toevoegen lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  const list = items ?? []
  const open = list.filter((i) => !i.claimed_by && !i.done).length
  const suggestions = GROUP_SUGGESTIONS.filter((s) => !list.some((i) => i.label.toLowerCase() === s.toLowerCase())).slice(0, 6)

  return (
    <section className="mt-8">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[20px] font-semibold tracking-tight">Groepsspullen</h2>
        <span className="flex items-center gap-2 text-[15px] text-muted">
          {refreshing && items !== null && (
            <span role="status" aria-label="Bijwerken">
              <Spinner size={14} />
            </span>
          )}
          {list.length > 0 && (open ? `${open} nog niemand` : 'alles verdeeld')}
        </span>
      </div>
      <p className="mb-3 text-[15px] text-muted">Wat je met de crew maar één keer nodig hebt. Tik op "Ik" als jij het meeneemt.</p>

      {!ready && (
        <p className="card mb-3 flex items-center gap-2 p-4 text-[15px] text-muted">
          <Icon name="cloud" size={18} /> Je trip wordt eerst met je crew gedeeld. Even syncen en dan kun je de lijst vullen.
        </p>
      )}
      {ready && !online && (
        <p className="mb-3 flex items-center gap-2 text-[15px] text-warn">
          <Icon name="cloudOff" size={16} /> Offline: je ziet de laatst bekende lijst.
        </p>
      )}

      {items === null ? (
        <div className="card grid h-24 place-items-center text-muted">
          <Spinner size={20} />
        </div>
      ) : (
        list.length > 0 && (
          <List>
            {list.map((i) => {
              const mine = i.claimed_by === me
              const canDelete = i.created_by === me || ownerId === me
              return (
                <div key={i.id} className="flex items-center">
                  <button
                    role="checkbox"
                    aria-checked={i.done}
                    disabled={!canEdit}
                    onClick={() => {
                      sfx.toggle()
                      void change(
                        (l) => l.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)),
                        () => setDone(i.id, !i.done),
                      )
                    }}
                    className="flex min-h-14 flex-1 items-center gap-3 py-2 pl-4 text-left active:bg-surface-2"
                  >
                    <span
                      className={cx(
                        'grid size-6 shrink-0 place-items-center rounded-md border-2',
                        i.done ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                      )}
                    >
                      {i.done && <Icon name="check" size={14} stroke={2.6} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block truncate text-[15px]', i.done && 'text-muted line-through')}>{i.label}</span>
                      <span className={cx('block text-[13px]', i.claimed_by ? 'text-muted' : 'text-warn')}>
                        {!i.claimed_by ? 'Nog niemand' : mine ? 'Jij neemt hem mee' : `${name(i.claimed_by)} neemt hem mee`}
                      </span>
                    </span>
                  </button>
                  <button
                    disabled={!canEdit}
                    aria-pressed={mine}
                    onClick={() => {
                      sfx.toggle()
                      void change(
                        (l) => l.map((x) => (x.id === i.id ? { ...x, claimed_by: mine ? null : me } : x)),
                        () => setClaim(i.id, !mine),
                      )
                    }}
                    className={cx(
                      'mx-1 h-9 shrink-0 rounded-full px-3.5 text-[15px] font-medium transition-colors duration-150 disabled:opacity-40',
                      mine ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-text',
                    )}
                  >
                    Ik
                  </button>
                  {canDelete ? (
                    <button
                      aria-label={`${i.label} verwijderen`}
                      disabled={!canEdit}
                      onClick={() =>
                        void change(
                          (l) => l.filter((x) => x.id !== i.id),
                          () => removeItem(i.id),
                        )
                      }
                      className="grid size-12 shrink-0 place-items-center text-muted/60 active:text-danger disabled:opacity-40"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                </div>
              )
            })}
          </List>
        )
      )}

      {canEdit && (
        <>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void add(text)
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Bijv. speaker, EHBO-doos…"
              className={inputCls}
              maxLength={80}
            />
            <button
              type="submit"
              aria-label="Toevoegen"
              className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink"
            >
              <Icon name="plus" size={20} />
            </button>
          </form>
          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Chip key={s} onClick={() => void add(s)}>
                  <Icon name="plus" size={14} /> {s}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
