// Trip-recap: wat de hele crew deze trip gedaan heeft, uit de met de crew gedeelde dagen.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { List, Row, Sheet, Stat, StatGroup } from './ui'
import { Spinner } from '../design/icons'
import { crewMembers, type CrewMember } from '../lib/crew'
import {
  VOTE_CATEGORIES,
  cachedVotes,
  castVote,
  computeRecap,
  listVotes,
  removeVote,
  tripDays,
  voteResult,
  type Recap,
  type Vote,
  type VoteCategory,
} from '../lib/crewTrips'
import { crewAwards, type Award } from '../lib/awards'
import { errMsg } from '../lib/errors'
import { toast } from '../lib/toast'
import { getCurrentUserId } from '../lib/auth-state'
import { plural } from '../lib/format'
import { kvGet, kvSet } from '../lib/db'
import { TRICK_BY_ID } from '../content/tricks'
import type { Trip } from '../lib/types'

export function TripRecap({ tripId, crewId, trip }: { tripId: string; crewId: string; trip: Pick<Trip, 'startDate' | 'endDate'> }) {
  const me = getCurrentUserId()
  const { startDate, endDate } = trip
  const [recap, setRecap] = useState<Recap | null>(null)
  const [awards, setAwards] = useState<Award[]>([])
  const [members, setMembers] = useState<CrewMember[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const key = `tripRecap:${tripId}`
    type Cached = { recap: Recap; awards: Award[]; members: CrewMember[] }
    void kvGet<Cached | null>(key, null).then((c) => {
      if (!alive || !c?.recap) return
      setRecap((cur) => cur ?? c.recap)
      setAwards((cur) => (cur.length ? cur : (c.awards ?? [])))
      setMembers((cur) => (cur.length ? cur : (c.members ?? [])))
    })
    if (!navigator.onLine) return
    Promise.all([tripDays(crewId, { startDate, endDate }), crewMembers(crewId)])
      .then(async ([days, mem]) => {
        const names = Object.fromEntries(mem.map((m) => [m.user_id, m.display_name]))
        const r = computeRecap(days, names)
        const a = crewAwards(days)
        await kvSet(key, { recap: r, awards: a, members: mem })
        if (!alive) return
        setRecap(r)
        setAwards(a)
        setMembers(mem)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [tripId, crewId, startDate, endDate])

  const name = (p: { userId: string; name: string }) => (p.userId === me ? 'Jij' : p.name)
  const nameOf = (id: string) =>
    id === me
      ? 'Jij'
      : (members.find((m) => m.user_id === id)?.display_name ?? recap?.people.find((p) => p.userId === id)?.name ?? 'Iemand')
  const names = (ids: string[]) => {
    const n = ids.map(nameOf)
    return n.length > 1 ? `${n.slice(0, -1).join(', ')} en ${n[n.length - 1]}` : n[0]
  }

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
            <Stat label="Uren" value={recap.hours.toLocaleString('nl-NL')} />
            <Stat label="Valpartijen" value={recap.falls} />
          </StatGroup>

          {awards.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-[17px] font-semibold">Awards</h3>
              <List>
                {awards.map((aw) => (
                  <Row
                    key={aw.id}
                    icon={aw.icon}
                    title={<span className="block whitespace-normal">{aw.title}</span>}
                    detail={<span className="block whitespace-normal">{aw.blurb}</span>}
                    value={
                      <span className="block max-w-[9rem] text-right">
                        <span className="block truncate font-semibold text-text">{names(aw.userIds)}</span>
                        <span className="block text-[13px]">{aw.value}</span>
                      </span>
                    }
                  />
                ))}
              </List>
            </>
          )}

          {members.length > 1 && <Votes tripId={tripId} crewId={crewId} members={members} me={me ?? ''} nameOf={nameOf} names={names} />}

          <h3 className="mb-2 mt-6 text-[17px] font-semibold">Per rider</h3>
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
                  {p.hours.toLocaleString('nl-NL')} u · {p.falls} val
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

/** Stemronde: per categorie één stem op een crewgenoot. De stand zie je pas als je zelf gestemd hebt. */
function Votes({
  tripId,
  crewId,
  members,
  me,
  nameOf,
  names,
}: {
  tripId: string
  crewId: string
  members: CrewMember[]
  me: string
  nameOf: (id: string) => string
  names: (ids: string[]) => string
}) {
  const [votes, setVotes] = useState<Vote[]>([])
  const [open, setOpen] = useState<VoteCategory | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setVotes(await cachedVotes(tripId))
    if (navigator.onLine) setVotes(await listVotes(tripId).catch(() => cachedVotes(tripId)))
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  const mine = (c: VoteCategory) => votes.find((v) => v.category === c && v.voter === me)

  async function vote(c: VoteCategory, candidate: string) {
    const prev = mine(c)
    setBusy(true)
    // meteen tonen, daarna de echte stand
    setVotes((vs) => [
      ...vs.filter((v) => !(v.category === c && v.voter === me)),
      ...(prev?.candidate === candidate ? [] : [{ category: c, voter: me, candidate }]),
    ])
    try {
      if (prev?.candidate === candidate) await removeVote(tripId, c)
      else await castVote(crewId, tripId, c, candidate, !!prev)
      await load()
    } catch (e) {
      toast({ title: 'Stemmen lukt niet', body: errMsg(e), tone: 'error', icon: 'alert' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const cat = VOTE_CATEGORIES.find((c) => c.id === open)
  const others = members.filter((m) => m.user_id !== me)

  return (
    <>
      <h3 className="mb-2 mt-6 text-[17px] font-semibold">Stemmen</h3>
      <List>
        {VOTE_CATEGORIES.map((c) => {
          const r = voteResult(votes, c.id)
          const voted = !!mine(c.id)
          return (
            <Row
              key={c.id}
              icon={c.id === 'val' ? 'impact' : 'crown'}
              title={c.title}
              detail={
                !voted
                  ? 'Nog niet gestemd'
                  : r.leaders.length
                    ? `${names(r.leaders)} ${r.leaders.length > 1 ? 'staan' : 'staat'} bovenaan`
                    : 'Nog geen stemmen'
              }
              value={voted ? `${r.total} ${r.total === 1 ? 'stem' : 'stemmen'}` : undefined}
              onClick={() => setOpen(c.id)}
            />
          )
        })}
      </List>

      <Sheet open={!!cat} onClose={() => setOpen(null)} title={cat?.title ?? ''}>
        {cat && (
          <>
            <p className="mb-3 text-[15px] text-muted">{cat.blurb}</p>
            <List className="mb-3">
              {others.map((m) => {
                const r = voteResult(votes, cat.id)
                const picked = mine(cat.id)?.candidate === m.user_id
                return (
                  <Row
                    key={m.user_id}
                    title={m.display_name}
                    detail={picked ? 'Jouw stem, tik om in te trekken' : undefined}
                    chevron={false}
                    onClick={busy ? undefined : () => void vote(cat.id, m.user_id)}
                    value={
                      mine(cat.id) ? (
                        <span className={picked ? 'font-semibold text-accent-text' : undefined}>{r.counts[m.user_id] ?? 0}</span>
                      ) : undefined
                    }
                  />
                )
              })}
            </List>
            <p className="mb-6 text-[13px] text-muted">
              {mine(cat.id) ? `Je stemde op ${nameOf(mine(cat.id)!.candidate)}.` : 'De stand zie je zodra je zelf gestemd hebt.'}
            </p>
          </>
        )}
      </Sheet>
    </>
  )
}
