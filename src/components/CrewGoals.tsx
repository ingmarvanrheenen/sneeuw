// Crew-doelen voor een trip: iedereen vinkt voor zichzelf af, je ziet wie het al gehaald heeft.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Chip, Heading, List, cx, inputCls } from './ui'
import { Icon, Spinner } from '../design/icons'
import { crewMembers, type CrewMember } from '../lib/crew'
import { addGoal, cachedGoals, listGoals, removeGoal, setGoalDone, type CrewGoal } from '../lib/crewTrips'
import { getCurrentUserId } from '../lib/auth-state'
import { sfx } from '../lib/sounds'
import { celebrate, toast } from '../lib/toast'
import { errMsg } from '../lib/errors'
import { notifyCrew } from '../lib/push'

export const GOAL_SUGGESTIONS = ['Iedereen een rode piste', 'Samen de eerste lift', 'Iedereen een carve', 'Een dag zonder vallen']

export function CrewGoals({ tripId, crewId, ownerId, ready = true }: { tripId: string; crewId: string; ownerId: string; ready?: boolean }) {
  const me = getCurrentUserId()
  const [goals, setGoals] = useState<CrewGoal[] | null>(null)
  const [members, setMembers] = useState<CrewMember[]>([])
  const [text, setText] = useState('')
  const online = navigator.onLine
  const canEdit = online && ready
  // telt lokale wijzigingen: een refresh die tijdens een wijziging liep, heeft een oude stand
  const edits = useRef(0)

  const load = useCallback(async () => {
    if (!navigator.onLine || !ready) return
    const at = edits.current
    try {
      const [g, m] = await Promise.all([listGoals(tripId), crewMembers(crewId)])
      setMembers(m)
      if (edits.current === at) setGoals(g)
    } catch (e) {
      setGoals((cur) => cur ?? [])
      toast({ title: 'Crew-doelen laden lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }, [tripId, crewId, ready])

  useEffect(() => {
    // een lege cache zegt online niks (nog nooit geladen), dus dan wachten op de server
    void cachedGoals(tripId).then((c) => (c.length || !navigator.onLine) && setGoals((cur) => cur ?? c))
    void load()
    const refresh = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    // zolang je kijkt elke halve minuut, zodat je het vinkje van je maat ziet
    const t = setInterval(refresh, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
      clearInterval(t)
    }
  }, [tripId, load])

  const crewSize = Math.max(members.length, 1)
  const name = (uid: string) => (uid === me ? 'jij' : (members.find((m) => m.user_id === uid)?.display_name ?? 'iemand'))

  async function toggle(g: CrewGoal) {
    const mine = !!me && g.done.includes(me)
    sfx.toggle()
    edits.current++
    setGoals((cur) =>
      (cur ?? []).map((x) => (x.id === g.id ? { ...x, done: mine ? x.done.filter((u) => u !== me) : [...x.done, me!] } : x)),
    )
    try {
      await setGoalDone(g.id, !mine)
      if (!mine) void notifyCrew('goal', g.id)
      // laatste van de crew die hem haalt: dat mag gevierd worden
      if (!mine && g.done.length + 1 >= crewSize && crewSize > 1) celebrate('goal', 'Crew-doel gehaald', `${g.title}: iedereen`, 'crew')
    } catch (e) {
      toast({ title: 'Niet opgeslagen', body: errMsg(e), tone: 'error', icon: 'alert' })
      void load()
    }
  }

  async function add(title: string) {
    const clean = title.trim()
    if (!clean || !canEdit) return
    setText('')
    try {
      const g = await addGoal(crewId, tripId, clean)
      edits.current++
      setGoals((cur) => [...(cur ?? []), g])
    } catch (e) {
      toast({ title: 'Doel toevoegen lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  const list = goals ?? []
  const suggestions = GOAL_SUGGESTIONS.filter((s) => !list.some((g) => g.title.toLowerCase() === s.toLowerCase())).slice(0, 3)

  return (
    <section className="mt-8">
      <Heading className="mb-1">Crew-doelen</Heading>
      <p className="mb-3 text-[15px] text-muted">Samen iets halen deze trip. Iedereen vinkt voor zichzelf af.</p>
      {goals === null ? (
        <div className="card grid h-20 place-items-center text-muted">
          <Spinner size={20} />
        </div>
      ) : (
        list.length > 0 && (
          <List>
            {list.map((g) => {
              const mine = !!me && g.done.includes(me)
              const canDelete = g.created_by === me || ownerId === me
              const others = g.done.filter((u) => u !== me)
              return (
                <div key={g.id} className="flex items-center">
                  <button
                    role="checkbox"
                    aria-checked={mine}
                    disabled={!canEdit}
                    onClick={() => void toggle(g)}
                    className="flex min-h-14 flex-1 items-center gap-3 py-2 pl-4 text-left active:bg-surface-2"
                  >
                    <span
                      className={cx(
                        'grid size-6 shrink-0 place-items-center rounded-full border-2',
                        mine ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                      )}
                    >
                      {mine && <Icon name="check" size={14} stroke={2.6} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px]">{g.title}</span>
                      <span className="block text-[13px] text-muted">
                        {g.done.length}/{crewSize} gehaald
                        {others.length > 0 && ` · ${others.map(name).join(', ')}`}
                      </span>
                    </span>
                  </button>
                  {canDelete ? (
                    <button
                      aria-label={`${g.title} verwijderen`}
                      disabled={!canEdit}
                      onClick={async () => {
                        edits.current++
                        setGoals((cur) => (cur ?? []).filter((x) => x.id !== g.id))
                        try {
                          await removeGoal(g.id)
                        } catch (e) {
                          toast({ title: 'Verwijderen lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
                          void load()
                        }
                      }}
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
              placeholder="Bijv. iedereen een rode piste"
              className={inputCls}
              maxLength={80}
            />
            <button
              type="submit"
              aria-label="Doel toevoegen"
              className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink"
            >
              <Icon name="plus" size={20} />
            </button>
          </form>
          {goals !== null && suggestions.length > 0 && (
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
