import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Field, Page, PageHeader, Segmented, Sheet, cx, inputCls } from '../components/ui'
import { Icon, Mood, Spinner } from '../design/icons'
import { MediaThumb, MediaViewer } from '../components/Media'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import {
  REACTIONS,
  createCrew,
  crewFeed,
  crewMembers,
  joinCrew,
  leaveCrew,
  myCrews,
  cachedCrews,
  reactionsFor,
  toPosts,
  toggleReaction,
  type Crew as CrewT,
  type CrewMember,
  type FeedPost,
  type Reaction,
} from '../lib/crew'
import { TRICK_BY_ID } from '../content/tricks'
import { fmtDate } from '../lib/format'
import { toast } from '../lib/toast'
import type { MediaMeta } from '../lib/types'
import { errMsg } from '../lib/errors'
import { PushNudge } from '../components/PushSettings'
import { RiderAvatar } from '../components/RiderParts'
import { riderProfiles, type CrewRider } from '../lib/riders'
import { SnowGames } from '../components/SnowParts'
import { CrewLadder } from '../components/Ladder'

function NeedAccount() {
  const nav = useNavigate()
  return (
    <Empty
      icon={<Icon name="crew" size={40} className="text-accent-text" />}
      title={hasBackend ? 'Log in voor je crew' : 'Crew nog niet gekoppeld'}
      body={
        hasBackend
          ? 'Maak een account aan, start een crew en deel de code met je vrienden. Dan zie je elkaars dagen, tricks en clips.'
          : 'De crew-functies hebben een server nodig (Supabase). In de README staat in 5 minuten hoe je die koppelt. Je logboek werkt intussen gewoon offline.'
      }
      action={hasBackend ? <Button onClick={() => nav('/instellingen')}>Inloggen</Button> : undefined}
    />
  )
}

function Post({
  post,
  member,
  photo,
  reactions,
  me,
  onReact,
}: {
  post: FeedPost
  member?: CrewMember
  photo?: string
  reactions: Reaction[]
  me: string
  onReact: (key: string, mine: boolean) => void
}) {
  const [open, setOpen] = useState<MediaMeta | null>(null)
  const s = post.session
  const t = post.trick
  return (
    <Card className="p-0">
      <div className="flex items-center gap-3 p-4 pb-3">
        <Link to={`/rider/${post.userId}`} className="flex min-w-0 flex-1 items-center gap-3">
          <RiderAvatar photo={photo} name={member?.display_name ?? '?'} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{member?.display_name ?? 'Rider'}</div>
            <div className="label">{fmtDate(post.at)}</div>
          </div>
        </Link>
        {s && <Mood value={s.mood} className="text-accent-text" />}
        {t && <Icon name="stomp" size={24} className="text-accent-text" />}
      </div>
      <div className="px-4 pb-3">
        {s && (
          <>
            <div className="font-medium">{s.resortName || 'Dag op de plank'}</div>
            {s.highlight && <div className="mt-0.5 text-sm text-muted">“{s.highlight}”</div>}
            <div className="num mt-2 text-xs text-muted">
              {s.hours}u · {s.falls} val · {s.landed.length} geland
            </div>
            {s.landed.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.landed.map((id) => (
                  <Link key={id} to={`/tricks/${id}`} className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-ink">
                    {TRICK_BY_ID.get(id)?.name ?? id}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
        {t && (
          <div>
            <span className="text-muted">landde </span>
            <Link to={`/tricks/${t.trickId}`} className="font-semibold text-accent-text">
              {TRICK_BY_ID.get(t.trickId)?.name ?? t.trickId}
            </Link>
          </div>
        )}
      </div>
      {post.media.length > 0 && (
        <div className={cx('grid gap-0.5', post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {post.media.slice(0, 4).map((m) => (
            <MediaThumb
              key={m.id}
              m={m}
              onClick={() => setOpen(m)}
              className={cx('w-full rounded-none', post.media.length === 1 ? 'aspect-[4/3]' : 'aspect-square')}
            />
          ))}
        </div>
      )}
      <div className="flex gap-1.5 p-3">
        {REACTIONS.map((r) => {
          const all = reactions.filter((x) => x.emoji === r.key)
          const mine = all.some((x) => x.user_id === me)
          return (
            <button
              key={r.key}
              aria-label={r.label}
              onClick={() => onReact(r.key, mine)}
              className={cx(
                'flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs transition active:scale-90',
                mine ? 'border-accent bg-accent-soft text-accent-text' : 'hairline text-muted',
              )}
            >
              <Icon name={r.icon} size={15} />
              {all.length > 0 && <span className="num">{all.length}</span>}
            </button>
          )
        })}
      </div>
      <MediaViewer m={open} onClose={() => setOpen(null)} />
    </Card>
  )
}

export default function Crew() {
  const { user } = authStore.use()
  const [crews, setCrews] = useState<CrewT[] | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [tab, setTab] = useState<'feed' | 'board' | 'snow'>('feed')
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [members, setMembers] = useState<CrewMember[]>([])
  const [riders, setRiders] = useState<Record<string, CrewRider>>({})
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [loading, setLoading] = useState(false)
  const [sheet, setSheet] = useState<'new' | 'join' | null>(null)
  const [input, setInput] = useState('')

  const loadCrews = useCallback(async () => {
    try {
      const list = await myCrews()
      setCrews(list)
      setActive((a) => a ?? list[0]?.id ?? null)
    } catch (e) {
      // geen bereik: laatst bekende crews tonen in plaats van "nog geen crew"
      const list = await cachedCrews()
      setCrews(list)
      setActive((a) => a ?? list[0]?.id ?? null)
      if (navigator.onLine) toast({ title: 'Crew laden mislukt', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }, [])

  /** `quiet`: verversen op de achtergrond, zonder spinner of foutmelding */
  const loadFeed = useCallback(async (crewId: string, quiet = false) => {
    if (quiet && !navigator.onLine) return
    if (!quiet) setLoading(true)
    try {
      const [items, mem] = await Promise.all([crewFeed(crewId), crewMembers(crewId)])
      const p = toPosts(items)
      setPosts(p)
      setMembers(mem)
      // foto's en bijnamen voor de feed; lukt het niet, dan gewoon de letter
      riderProfiles(mem.map((m) => m.user_id))
        .then(setRiders)
        .catch(() => {})
      setReactions(await reactionsFor(p.map((x) => x.id)))
    } catch (e) {
      if (!quiet) toast({ title: 'Offline?', body: errMsg(e), tone: 'error', icon: 'cloudOff' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) void loadCrews()
  }, [user, loadCrews])
  useEffect(() => {
    if (active) void loadFeed(active)
  }, [active, loadFeed])
  // feed blijft vers: bij terugkomen in de app, weer bereik, en elke minuut zolang je kijkt
  useEffect(() => {
    if (!active) return
    const refresh = () => document.visibilityState === 'visible' && void loadFeed(active, true)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
      clearInterval(timer)
    }
  }, [active, loadFeed])

  if (!hasBackend || !user)
    return (
      <Page>
        <PageHeader title="Crew" />
        <NeedAccount />
      </Page>
    )

  const crew = crews?.find((c) => c.id === active)

  async function submit() {
    try {
      const c = sheet === 'new' ? await createCrew(input.trim()) : await joinCrew(input)
      setSheet(null)
      setInput('')
      await loadCrews()
      setActive(c.id)
      toast({ title: sheet === 'new' ? 'Crew aangemaakt' : 'Welkom in de crew', body: c.name, icon: 'crew', tone: 'success' })
    } catch (e) {
      toast({ title: 'Lukt niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  return (
    <Page>
      <PageHeader
        title={crew?.name ?? 'Crew'}
        right={
          <>
            <button
              aria-label="Crew joinen"
              onClick={() => setSheet('join')}
              className="grid size-9 place-items-center rounded-full border hairline"
            >
              <Icon name="link" size={16} />
            </button>
            <button
              aria-label="Nieuwe crew"
              onClick={() => setSheet('new')}
              className="grid size-9 place-items-center rounded-full bg-accent text-accent-ink"
            >
              <Icon name="plus" size={16} />
            </button>
          </>
        }
      />

      {crews === null ? (
        <div className="flex justify-center py-10 text-muted">
          <Spinner size={22} />
        </div>
      ) : !crews.length ? (
        <Empty
          icon={<Icon name="crew" size={40} className="text-accent-text" />}
          title="Nog geen crew"
          body="Start een crew voor je vriendengroep of join met een code die je van een maat kreeg."
          action={
            <div className="flex gap-2">
              <Button onClick={() => setSheet('new')}>Crew starten</Button>
              <Button variant="ghost" onClick={() => setSheet('join')}>
                Code invullen
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {crews.length > 1 && (
            <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
              {crews.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className={cx(
                    'h-9 shrink-0 rounded-full border px-4 text-sm',
                    c.id === active ? 'border-accent bg-accent text-accent-ink' : 'hairline',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {crew && (
            <Card className="mb-3 flex items-center justify-between">
              <div>
                <div className="label">Invite-code</div>
                <div className="num text-2xl font-semibold tracking-[0.2em]">{crew.invite_code}</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon={<Icon name="share" size={16} />}
                onClick={async () => {
                  const text = `Join mijn crew "${crew.name}" in Sneeuw Daddy met code ${crew.invite_code}`
                  try {
                    if (navigator.share) await navigator.share({ text })
                    else {
                      await navigator.clipboard.writeText(crew.invite_code)
                      toast({ title: 'Code gekopieerd', icon: 'copy' })
                    }
                  } catch {
                    /* geannuleerd */
                  }
                }}
              >
                Deel
              </Button>
            </Card>
          )}
          <PushNudge />
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'feed', label: 'Feed' },
              { value: 'board', label: 'Leaderboard' },
              { value: 'snow', label: 'S.N.O.W.' },
            ]}
          />
          {loading && (
            <div className="flex justify-center py-6 text-muted">
              <Spinner size={20} />
            </div>
          )}
          {tab === 'feed' && !loading && (
            <div className="mt-4 space-y-3">
              {!posts.length && (
                <Empty
                  icon={<Icon name="image" size={36} className="text-muted" />}
                  title="Nog stil hier"
                  body="Kies bij het loggen van een dag 'Delen' met deze crew. Dan verschijnt hij hier, met je foto's en video's."
                />
              )}
              {posts.map((p) => (
                <Post
                  key={p.id}
                  post={p}
                  member={members.find((m) => m.user_id === p.userId)}
                  photo={riders[p.userId]?.profile.photo}
                  reactions={reactions.filter((r) => r.record_id === p.id)}
                  me={user.id}
                  onReact={async (key, mine) => {
                    setReactions((rs) =>
                      mine
                        ? rs.filter((r) => !(r.record_id === p.id && r.user_id === user.id && r.emoji === key))
                        : [...rs, { record_id: p.id, user_id: user.id, emoji: key }],
                    )
                    try {
                      await toggleReaction(p.id, key, mine)
                    } catch {
                      toast({ title: 'Reactie mislukt', tone: 'error', icon: 'alert' })
                    }
                  }}
                />
              ))}
            </div>
          )}
          {tab === 'board' && !loading && <CrewLadder members={members} riders={riders} me={user.id} />}
          {tab === 'snow' && !loading && crew && <SnowGames crewId={crew.id} members={members} me={user.id} />}
          {crew && (
            <button
              onClick={async () => {
                if (!confirm(`Crew "${crew.name}" verlaten?`)) return
                await leaveCrew(crew.id)
                setActive(null)
                await loadCrews()
              }}
              className="label mt-8 w-full py-3 text-center"
            >
              Crew verlaten
            </button>
          )}
        </>
      )}

      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'new' ? 'Nieuwe crew' : 'Crew joinen'}>
        <Field
          label={sheet === 'new' ? 'Naam' : 'Code'}
          hint={sheet === 'new' ? 'Bijvoorbeeld de naam van je groepsapp.' : '6 tekens, gekregen van een maat.'}
        >
          <input
            value={input}
            onChange={(e) => setInput(sheet === 'join' ? e.target.value.toUpperCase() : e.target.value)}
            maxLength={sheet === 'join' ? 6 : 60}
            placeholder={sheet === 'new' ? 'Shredheads' : 'ABC123'}
            className={cx(inputCls, sheet === 'join' && 'num tracking-[0.3em]')}
            autoFocus
          />
        </Field>
        <Button className="mb-4 mt-4 w-full" disabled={!input.trim()} onClick={submit}>
          {sheet === 'new' ? 'Starten' : 'Joinen'}
        </Button>
      </Sheet>
    </Page>
  )
}
