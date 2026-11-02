// Trip-toernooi op de trippagina: start met de clips van de trip, stem per duel, en de winnaar als poster.
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Button, Heading, List, cx } from './ui'
import { MediaThumb, MediaViewer } from './Media'
import { Peaks, Sticker } from './Poster'
import { Icon, Spinner } from '../design/icons'
import { crewMembers, type CrewMember } from '../lib/crew'
import { tripDays, tripMedia } from '../lib/crewTrips'
import {
  MAX_ENTRIES,
  cachedBracket,
  layout,
  loadBracket,
  pickEntries,
  resetBracket,
  roundName,
  startBracket,
  voteBracket,
  type Bracket,
  type BracketVote,
  type Match,
} from '../lib/tournament'
import { getCurrentUserId } from '../lib/auth-state'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'
import type { MediaMeta, Trip } from '../lib/types'

export function TripTournament({
  tripId,
  crewId,
  ownerId,
  trip,
  ready = true,
}: {
  tripId: string
  crewId: string
  ownerId: string
  trip: Pick<Trip, 'startDate' | 'endDate'>
  ready?: boolean
}) {
  const me = getCurrentUserId() ?? ''
  const [bracket, setBracket] = useState<Bracket | null | undefined>(undefined)
  const [votes, setVotes] = useState<BracketVote[]>([])
  const [media, setMedia] = useState<MediaMeta[]>([])
  const [members, setMembers] = useState<CrewMember[]>([])
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<MediaMeta | null>(null)
  const { startDate, endDate } = trip

  const load = useCallback(async () => {
    if (!navigator.onLine || !ready) return
    try {
      const [b, mem, days] = await Promise.all([loadBracket(tripId), crewMembers(crewId), tripDays(crewId, { startDate, endDate })])
      setBracket(b.bracket)
      setVotes(b.votes)
      setMembers(mem)
      setMedia(await tripMedia(crewId, { startDate, endDate }, days).catch(() => []))
    } catch (e) {
      setBracket((cur) => (cur === undefined ? null : cur))
      toast({ title: 'Toernooi laden lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }, [tripId, crewId, startDate, endDate, ready])

  useEffect(() => {
    void cachedBracket(tripId).then((c) => {
      if (!c) return
      setBracket((cur) => (cur === undefined ? c.bracket : cur))
      setVotes((cur) => (cur.length ? cur : c.votes))
    })
    void load()
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 30_000)
    return () => clearInterval(t)
  }, [tripId, load])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      await load()
    } catch (e) {
      toast({ title: 'Niet gelukt', body: errMsg(e), tone: 'error', icon: 'alert' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const byId = new Map(media.map((m) => [m.id, m]))
  const riderOf = (id: string | null | undefined) => {
    const uid = id ? byId.get(id)?.userId : null
    return uid === me ? 'Jij' : (members.find((m) => m.user_id === uid)?.display_name ?? 'Iemand')
  }
  const canEdit = navigator.onLine && ready

  if (bracket === undefined)
    return (
      <section className="mt-8">
        <Heading action={<Spinner size={14} />}>Trip-toernooi</Heading>
      </section>
    )

  if (!bracket) {
    const entries = pickEntries(media, tripId)
    return (
      <section className="mt-8">
        <Heading>Trip-toernooi</Heading>
        <div className="card p-4">
          <p className="text-[15px] text-muted">
            {entries.length >= 2
              ? `De beste clips van de trip tegen elkaar, ${entries.length} in de bracket. Per duel stemt de crew wie doorgaat.`
              : 'Nog te weinig gedeelde clips. Deel er minstens twee van deze trip, dan kan het toernooi beginnen.'}
          </p>
          {entries.length >= 2 && canEdit && (
            <Button
              className="mt-3 w-full"
              icon={<Icon name="trophy" size={18} />}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await startBracket(crewId, tripId, entries)
                  sfx.success()
                })
              }
            >
              Start het toernooi
            </Button>
          )}
          {media.length > MAX_ENTRIES && <p className="mt-2 text-[13px] text-muted">Max {MAX_ENTRIES} clips; video’s gaan voor.</p>}
        </div>
      </section>
    )
  }

  const { rounds, champion } = layout(bracket.entries, votes, Math.max(1, members.length))
  const current = rounds.findIndex((r) => r.some((m) => m.open))
  const myVote = (m: Match) => votes.find((v) => v.round === m.round && v.match === m.match && v.voter === me)?.pick
  const canReset = canEdit && (bracket.created_by === me || ownerId === me)

  return (
    <section className="mt-8">
      <Heading
        action={
          canReset && (
            <button
              onClick={() => confirm('Toernooi opnieuw beginnen? Alle stemmen gaan weg.') && void run(() => resetBracket(tripId))}
              className="-my-2 -mr-2 shrink-0 px-2 py-2 text-[15px] font-semibold text-accent-text"
            >
              Opnieuw
            </button>
          )
        }
      >
        Trip-toernooi
      </Heading>

      {champion && (
        <div role="group" aria-label="Winnaar van het toernooi" className="relative mb-4 mt-8 rounded-[6px] bg-block p-4 text-block-ink">
          <Peaks className="bottom-2 right-0 w-[150px]" />
          <Sticker className="-right-2 -top-6" size={92}>
            <span>Winnaar</span>
          </Sticker>
          <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">Clip van de trip</div>
          <div className="display mt-2 text-[40px] uppercase leading-[0.9]">{riderOf(champion)}</div>
          {byId.get(champion) && (
            <MediaThumb
              m={byId.get(champion)!}
              onClick={() => setViewing(byId.get(champion)!)}
              className="mt-3 aspect-video w-full rounded-[6px]"
            />
          )}
        </div>
      )}

      {current >= 0 && (
        <>
          <h3 className="display mb-2 text-[20px] uppercase">{roundName(current, rounds.length)}</h3>
          <div className="space-y-3">
            {rounds[current]
              .filter((m) => m.open)
              .map((m) => (
                <Duel
                  key={`${m.round}-${m.match}`}
                  m={m}
                  mine={myVote(m)}
                  byId={byId}
                  riderOf={riderOf}
                  busy={busy || !canEdit}
                  onView={setViewing}
                  onVote={(pick) =>
                    void run(async () => {
                      await voteBracket(tripId, m.round, m.match, pick, me)
                      sfx.tap()
                    })
                  }
                />
              ))}
          </div>
        </>
      )}

      <h3 className="display mb-2 mt-6 text-[20px] uppercase">Bracket</h3>
      <List>
        {rounds.flatMap((r, ri) =>
          r
            .filter((m) => m.a !== null || m.b !== null)
            .map((m) => (
              <div key={`${ri}-${m.match}`} className="flex items-center gap-3 px-4 py-2.5 text-[15px]">
                <span className="w-24 shrink-0 text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">
                  {roundName(ri, rounds.length)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <Side id={m.a} winner={m.decided && m.winner === m.a} riderOf={riderOf} /> <span className="text-muted">vs</span>{' '}
                  <Side id={m.b} winner={m.decided && m.winner === m.b} riderOf={riderOf} />
                </span>
                {m.a && m.b && (
                  <span className="num shrink-0 text-[13px] text-muted">
                    {m.votesA}-{m.votesB}
                  </span>
                )}
              </div>
            )),
        )}
      </List>
      <MediaViewer m={viewing} onClose={() => setViewing(null)} />
    </section>
  )
}

function Side({
  id,
  winner,
  riderOf,
}: {
  id: string | null | undefined
  winner: boolean
  riderOf: (id: string | null | undefined) => string
}) {
  if (id === undefined) return <span className="text-muted">?</span>
  if (id === null) return <span className="text-muted">vrij</span>
  return <span className={winner ? 'font-semibold' : undefined}>{riderOf(id)}</span>
}

const count = (n: number) => `${n} ${n === 1 ? 'stem' : 'stemmen'}`

/** Eén duel: twee clips naast elkaar, tik de clip om te kijken en de knop eronder om te stemmen. */
function Duel({
  m,
  mine,
  byId,
  riderOf,
  busy,
  onView,
  onVote,
}: {
  m: Match
  mine?: string
  byId: Map<string, MediaMeta>
  riderOf: (id: string | null | undefined) => string
  busy: boolean
  onView: (m: MediaMeta) => void
  onVote: (pick: string) => void
}) {
  return (
    <div className="card grid grid-cols-2 gap-2 p-2" role="group" aria-label={`Duel: ${riderOf(m.a)} tegen ${riderOf(m.b)}`}>
      {([m.a!, m.b!] as const).map((id, i) => {
        const media = byId.get(id)
        const picked = mine === id
        return (
          <div key={id} className="min-w-0">
            {media ? (
              <MediaThumb m={media} onClick={() => onView(media)} className="aspect-[4/5] w-full rounded-[6px]" />
            ) : (
              <div className="grid aspect-[4/5] place-items-center rounded-[6px] bg-surface-2 text-[13px] text-muted">Clip weg</div>
            )}
            <div className="mt-1.5 truncate px-1 text-[13px] font-semibold">{riderOf(id)}</div>
            <button
              type="button"
              disabled={busy}
              aria-pressed={picked}
              onClick={() => onVote(id)}
              className={cx(
                'mt-1.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-[6px] border text-[15px] font-semibold disabled:opacity-60',
                picked ? 'border-text bg-accent text-accent-ink' : 'hairline',
              )}
            >
              {picked ? (
                <span className="slap inline-flex items-center gap-1.5" style={{ '--tilt': '0deg', '--delay': '0ms' } as CSSProperties}>
                  <Icon name="check" size={16} /> Jouw stem
                </span>
              ) : (
                'Deze'
              )}
            </button>
            {mine && <div className="num mt-1 text-center text-[13px] text-muted">{count(i === 0 ? m.votesA : m.votesB)}</div>}
          </div>
        )
      })}
    </div>
  )
}
