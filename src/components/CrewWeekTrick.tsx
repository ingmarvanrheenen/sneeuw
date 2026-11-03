// Trick van de week in de crew-feed: de trick voor deze week, de clips die je crew ervan deelde, en één stem per
// persoon op de beste (niet op je eigen). De stand zie je zodra je zelf gestemd hebt.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heading, cx } from './ui'
import { MediaThumb, MediaViewer } from './Media'
import { Icon } from '../design/icons'
import { cachedWeekVotes, entriesOf, tally, voteWeek, weekTrick, weekVotes, type WeekVote } from '../lib/weekTrick'
import { weekOf } from '../lib/crewGoal'
import { todayISO } from '../lib/ids'
import { fmtShort } from '../lib/format'
import type { CrewMember } from '../lib/crew'
import type { MediaMeta } from '../lib/types'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'
import { sfx } from '../lib/sounds'

export function CrewWeekTrick({ crewId, members, media, me }: { crewId: string; members: CrewMember[]; media: MediaMeta[]; me: string }) {
  const week = weekOf(todayISO())
  const trick = weekTrick(crewId, week.key)
  const entries = entriesOf(media, trick.id, week)
  const [votes, setVotes] = useState<WeekVote[]>([])
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<MediaMeta | null>(null)

  const load = useCallback(async () => {
    setVotes(await cachedWeekVotes(crewId, week.key))
    if (navigator.onLine) setVotes(await weekVotes(crewId, week.key).catch(() => cachedWeekVotes(crewId, week.key)))
  }, [crewId, week.key])
  useEffect(() => void load(), [load])

  const mine = votes.find((v) => v.voter === me)
  const { counts, leaders, total } = tally(votes)
  const name = (id: string) => (id === me ? 'Jij' : (members.find((m) => m.user_id === id)?.display_name ?? 'Iemand'))

  async function vote(mediaId: string) {
    setBusy(true)
    try {
      await voteWeek(crewId, week.key, mediaId, mine)
      if (mine?.media_id !== mediaId) sfx.success()
      await load()
    } catch (e) {
      toast({ title: 'Stemmen lukt niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Trick van de week" className="mt-4">
      <Heading>Trick van de week</Heading>
      <Link to={`/tricks/${trick.id}`} className="flex items-center justify-between gap-3 rounded-[6px] bg-surface px-4 py-3">
        <span className="min-w-0">
          <span className="display block text-[26px] uppercase leading-none">{trick.name}</span>
          <span className="mt-1 block text-[13px] text-muted">
            {fmtShort(week.from)} – {fmtShort(week.to)} ·{' '}
            {entries.length ? `${entries.length} ${entries.length === 1 ? 'clip' : 'clips'}` : 'nog geen clips'}
          </span>
        </span>
        <Icon name="chevron" size={18} className="shrink-0 text-muted" />
      </Link>
      {!entries.length ? (
        <p className="mt-2 text-[13px] text-muted">
          Film hem, koppel de clip aan de trick en deel hem met je crew. De crew stemt op de beste.
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {entries.map((e) => {
              const own = e.userId === me
              const picked = mine?.media_id === e.media.id
              const lead = !!mine && leaders.includes(e.media.id)
              return (
                <div key={e.media.id} className={cx('overflow-hidden rounded-[6px]', lead && 'ring-2 ring-accent')}>
                  <MediaThumb
                    m={e.media}
                    onClick={() => setViewing(e.media)}
                    className="aspect-square w-full"
                    label={`Clip van ${name(e.userId)}`}
                  />
                  <button
                    type="button"
                    disabled={busy || own}
                    onClick={() => void vote(e.media.id)}
                    aria-pressed={picked}
                    aria-label={own ? `Je eigen clip` : picked ? `Stem op ${name(e.userId)} intrekken` : `Stem op ${name(e.userId)}`}
                    className={cx(
                      'flex h-9 w-full items-center justify-center gap-1 text-[13px] font-semibold disabled:opacity-60',
                      picked ? 'bg-accent text-accent-ink' : 'bg-surface-2',
                    )}
                  >
                    {own ? 'Jij' : name(e.userId)}
                    {mine && <span className="num">· {counts[e.media.id] ?? 0}</span>}
                  </button>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[13px] text-muted">
            {mine
              ? `Je stemde. ${total} ${total === 1 ? 'stem' : 'stemmen'} tot nu toe; zondagavond is de week om.`
              : 'Tik op een naam om te stemmen. De stand zie je zodra je zelf gestemd hebt.'}
          </p>
        </>
      )}
      <MediaViewer m={viewing} onClose={() => setViewing(null)} />
    </section>
  )
}
