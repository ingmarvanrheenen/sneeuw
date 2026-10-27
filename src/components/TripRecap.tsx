// Trip-recap: wat de hele crew deze trip gedaan heeft, uit de met de crew gedeelde dagen.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { List, Stat, StatGroup } from './ui'
import { Icon, Spinner } from '../design/icons'
import { crewMembers } from '../lib/crew'
import { computeRecap, tripDays, type Recap } from '../lib/crewTrips'
import { getCurrentUserId } from '../lib/auth-state'
import { plural } from '../lib/format'
import { kvGet, kvSet } from '../lib/db'
import { TRICK_BY_ID } from '../content/tricks'
import type { Trip } from '../lib/types'

export function TripRecap({ tripId, crewId, trip }: { tripId: string; crewId: string; trip: Pick<Trip, 'startDate' | 'endDate'> }) {
  const me = getCurrentUserId()
  const { startDate, endDate } = trip
  const [recap, setRecap] = useState<Recap | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const key = `tripRecap:${tripId}`
    void kvGet<Recap | null>(key, null).then((c) => alive && setRecap((cur) => cur ?? c))
    if (!navigator.onLine) return
    Promise.all([tripDays(crewId, { startDate, endDate }), crewMembers(crewId)])
      .then(async ([days, members]) => {
        const names = Object.fromEntries(members.map((m) => [m.user_id, m.display_name]))
        const r = computeRecap(days, names)
        await kvSet(key, r)
        if (alive) setRecap(r)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [tripId, crewId, startDate, endDate])

  const name = (p: { userId: string; name: string }) => (p.userId === me ? 'Jij' : p.name)

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-[20px] font-semibold tracking-tight">Trip-recap</h2>
      <p className="mb-3 text-[15px] text-muted">Alles wat de crew deze trip gelogd en gedeeld heeft.</p>
      {!recap ? (
        <div className="card grid h-20 place-items-center text-muted">{failed ? 'Recap laden lukte niet' : <Spinner size={20} />}</div>
      ) : recap.days === 0 ? (
        <p className="card p-4 text-[15px] text-muted">
          Nog geen gedeelde dagen in deze periode. Log je dag en zet delen met je crew aan, dan komt hij hier.
        </p>
      ) : (
        <>
          <StatGroup>
            <Stat label="Dagen" value={recap.days} />
            <Stat label="Uren" value={recap.hours} />
            <Stat label="Valpartijen" value={recap.falls} />
          </StatGroup>

          {(recap.mostHours || recap.mostFalls || recap.mostTricks) && (
            <List className="mt-3">
              {recap.mostHours && (
                <Highlight icon="clock" label="Meeste uren op de plank" value={`${name(recap.mostHours)} · ${recap.mostHours.hours} u`} />
              )}
              {recap.mostTricks && (
                <Highlight
                  icon="stomp"
                  label="Meeste tricks geland"
                  value={`${name(recap.mostTricks)} · ${recap.mostTricks.landed.length}`}
                />
              )}
              {recap.mostFalls && (
                <Highlight icon="impact" label="Vaakst gevallen (respect)" value={`${name(recap.mostFalls)} · ${recap.mostFalls.falls}x`} />
              )}
            </List>
          )}

          <List className="mt-3">
            {recap.people.map((p) => (
              <Link
                key={p.userId}
                to={`/rider/${p.userId === me ? 'ik' : p.userId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{name(p)}</span>
                  <span className="block text-[13px] text-muted">
                    {plural(p.days, 'dag', 'dagen')} · {plural(p.landed.length, 'trick', 'tricks')} geland
                  </span>
                </span>
                <span className="num shrink-0 text-right text-[15px]">
                  {p.hours} u · {p.falls} val
                </span>
              </Link>
            ))}
          </List>

          {recap.landed.length > 0 && (
            <p className="mt-3 text-[15px] text-muted">
              Geland deze trip: {recap.landed.map((t) => TRICK_BY_ID.get(t)?.name ?? t).join(', ')}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function Highlight({ icon, label, value }: { icon: 'clock' | 'stomp' | 'impact'; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon name={icon} size={20} className="shrink-0 text-accent-text" />
      <span className="min-w-0 flex-1 text-[15px]">{label}</span>
      <span className="shrink-0 text-[15px] font-semibold">{value}</span>
    </div>
  )
}
