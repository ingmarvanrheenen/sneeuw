// Rider-profiel: je skipas, signature trick, eerlijke stats, stickerboek, badges en highlights.
// Je eigen profiel werkt ook zonder account; dat van een crewgenoot komt van de server (laatst bekende offline).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Chip, Empty, Field, List, Page, PageHeader, Row, Section, Sheet, Stat, StatGroup, inputCls } from '../components/ui'
import { RiderAvatar, SkiPass, StickerBook, resortName } from '../components/RiderParts'
import { MediaGrid } from '../components/Media'
import { ResortPicker } from '../components/Pickers'
import { Icon, Spinner } from '../design/icons'
import { Medal } from '../design/Medal'
import { BADGES } from '../lib/progress'
import { riderStats, stickerBook, type RiderStats } from '../lib/rider'
import {
  answerNickname,
  cachedRider,
  loadRider,
  makeAvatar,
  nicknameInbox,
  riderMedia,
  suggestNickname,
  type CrewRider,
  type NicknameSuggestion,
} from '../lib/riders'
import { useProgress } from '../lib/useProgress'
import { authStore, getProfile, saveProfile } from '../lib/auth'
import { scheduleSync } from '../lib/sync'
import { db } from '../lib/db'
import { TRICK_BY_ID } from '../content/tricks'
import { fmtDate, plural } from '../lib/format'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'
import type { MediaMeta, Profile } from '../lib/types'

export default function Rider() {
  const { id = 'ik' } = useParams()
  const { user } = authStore.use()
  return id === 'ik' || id === user?.id ? <MyRider /> : <CrewRiderPage userId={id} />
}

const fmtHours = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')

function RiderView({
  userId,
  name,
  profile,
  stats,
  progress,
  media,
  isMe,
  children,
}: {
  userId: string | null
  name: string
  profile: Partial<Profile>
  stats: Partial<RiderStats>
  progress?: number
  media: MediaMeta[]
  isMe: boolean
  children?: ReactNode
}) {
  const landed = stats.landed ?? []
  const book = stickerBook(landed)
  const signature = profile.signatureTrick ? TRICK_BY_ID.get(profile.signatureTrick) : undefined
  const badges = BADGES.filter((b) => stats.badgeIds?.includes(b.id))
  const falls = stats.falls ?? 0
  return (
    <>
      <SkiPass
        userId={userId}
        name={name}
        profile={profile}
        level={stats.level ?? 1}
        levelName={stats.levelName ?? 'Groentje'}
        progress={progress}
      />
      {children}

      {signature && (
        <Section title="Signature trick">
          <List>
            <Row
              icon="star"
              title={<span className="text-[17px] font-semibold">{signature.name}</span>}
              detail={signature.summary}
              to={`/tricks/${signature.id}`}
            />
          </List>
        </Section>
      )}

      <Section title="Eerlijke stats">
        <StatGroup>
          <Stat label="Dagen" value={stats.days ?? 0} />
          <Stat label="Uren" value={fmtHours(stats.hours ?? 0)} />
          <Stat label="Valpartijen" value={falls} />
        </StatGroup>
        <List className="mt-3">
          <Row
            icon="impact"
            title={falls ? `${plural(falls, 'keer', 'keer')} gevallen` : 'Nog nooit gevallen'}
            detail={falls ? 'En nooit opgegeven' : 'Dat gaat nog komen'}
            value={stats.worstFalls ? `max ${stats.worstFalls} op een dag` : undefined}
          />
          <Row icon="clock" title="Langste dag" value={stats.bestDay ? `${fmtHours(stats.bestDay)} u` : '–'} />
          <Row icon="mountain" title="Eerste rode piste" value={stats.firstRed ? fmtDate(stats.firstRed) : 'Nog niet'} />
          <Row icon="pin" title="Resorts" value={stats.resorts ?? 0} />
        </List>
      </Section>

      <Section title="Stickerboek">
        <p className="mb-3 text-[15px] text-muted">
          <span className="num">{book.landed}</span> van <span className="num">{book.total}</span> verdiend.{' '}
          {isMe ? 'Land een trick en hij komt erbij.' : 'Lege plekken zijn nog te verdienen.'}
        </p>
        <StickerBook landed={landed} />
      </Section>

      {badges.length > 0 && (
        <Section title="Badges">
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
            {badges.map((b) => (
              <div key={b.id} className="flex w-20 shrink-0 flex-col items-center text-center">
                <Medal icon={b.icon} mark={b.mark} unlocked size={58} />
                <span className="mt-1 text-[13px] leading-tight">{b.name}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Highlights">
        {media.length ? (
          <MediaGrid items={media} />
        ) : (
          <p className="text-[15px] text-muted">
            {isMe ? "Nog geen clips of foto's. Voeg ze toe bij een dag of trick." : 'Nog niks met de crew gedeeld.'}
          </p>
        )}
      </Section>
    </>
  )
}

// ── Je eigen profiel ────────────────────────────────────────────────────────

function MyRider() {
  const { user } = authStore.use()
  const progress = useProgress()
  const profile = useLiveQuery(() => getProfile(), [])
  const media = useLiveQuery(async () => {
    const all = (await db.records.where('kind').equals('media').toArray()).filter((m) => !m.deleted) as MediaMeta[]
    return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, 9)
  }, [])
  const [editing, setEditing] = useState(false)
  const [inbox, setInbox] = useState<NicknameSuggestion[]>([])

  useEffect(() => {
    if (!user || !navigator.onLine) return
    nicknameInbox()
      .then(setInbox)
      .catch(() => {})
  }, [user])

  if (!progress || !profile)
    return (
      <Page>
        <PageHeader title="Je skipas" back />
        <div className="grid h-40 place-items-center text-muted">
          <Spinner size={22} />
        </div>
      </Page>
    )

  const stats = riderStats(progress)
  // alleen tricks die (nog) in de bijbel staan kun je als signature kiezen
  const choosable = stats.landed.filter((id) => TRICK_BY_ID.has(id))
  async function answer(s: NicknameSuggestion, ok: boolean) {
    setInbox((cur) => cur.filter((x) => x.id !== s.id))
    try {
      await answerNickname(s, ok)
      if (ok) toast({ title: `Je heet nu “${s.nickname}”`, icon: 'crew', tone: 'success' })
    } catch (e) {
      setInbox((cur) => [...cur, s])
      toast({ title: 'Niet opgeslagen', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  return (
    <Page>
      <PageHeader
        title="Je skipas"
        back
        right={
          <button onClick={() => setEditing(true)} className="h-11 px-1 text-[17px] text-accent-text">
            Bewerk
          </button>
        }
      />
      <RiderView
        userId={user?.id ?? null}
        name={profile.displayName || 'Rider'}
        profile={profile}
        stats={stats}
        progress={progress.level.progress}
        media={media ?? []}
        isMe
      >
        {inbox.length > 0 && (
          <Section title="Bijnaam-voorstellen">
            <List>
              {inbox.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[17px] font-medium">“{s.nickname}”</div>
                    <div className="text-[13px] text-muted">van {s.fromName}</div>
                  </div>
                  <Button size="sm" onClick={() => void answer(s, true)}>
                    Ja
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void answer(s, false)}>
                    Nee
                  </Button>
                </div>
              ))}
            </List>
          </Section>
        )}
      </RiderView>
      <ProfileEditor open={editing} onClose={() => setEditing(false)} profile={profile} landed={choosable} />
    </Page>
  )
}

function ProfileEditor({ open, onClose, profile, landed }: { open: boolean; onClose: () => void; profile: Profile; landed: string[] }) {
  const [p, setP] = useState(profile)
  const [resorts, setResorts] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) setP(profile)
    // alleen bij openen de laatste versie pakken, niet bij elke wijziging tijdens het bewerken
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function close() {
    await saveProfile({ ...p, displayName: p.displayName.trim() || 'Rider', motto: p.motto?.trim() || undefined })
    scheduleSync()
    onClose()
  }

  async function pickPhoto(f: File | undefined) {
    if (!f) return
    try {
      const photo = await makeAvatar(f)
      setP((cur) => ({ ...cur, photo }))
    } catch (e) {
      toast({ title: 'Foto lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  return (
    <Sheet open={open} onClose={() => void close()} title="Profiel bewerken">
      <div className="mb-4 flex items-center gap-4">
        <RiderAvatar photo={p.photo} name={p.displayName} size={72} square />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
            {p.photo ? 'Andere foto' : 'Foto kiezen'}
          </Button>
          {p.photo && (
            <Button size="sm" variant="plain" onClick={() => setP({ ...p, photo: undefined })}>
              Weghalen
            </Button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Profielfoto"
          onChange={(e) => {
            void pickPhoto(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      <div className="space-y-4">
        <Field label="Naam">
          <input value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} maxLength={40} className={inputCls} />
        </Field>
        <Field label="Motto" hint="Eén zin op je skipas.">
          <input
            value={p.motto ?? ''}
            onChange={(e) => setP({ ...p, motto: e.target.value })}
            maxLength={60}
            placeholder="Bijv. vallen is ook een trick"
            className={inputCls}
          />
        </Field>
        <Field label="Thuisresort" group>
          <button onClick={() => setResorts(true)} className={inputCls + ' text-left'}>
            {resortName(p.homeResort) ?? <span className="text-muted">Kies je resort</span>}
          </button>
        </Field>
        <Field
          group
          label="Signature trick"
          hint={landed.length ? 'De trick waar je het trotst op bent.' : 'Land eerst een trick, dan kun je hem hier kiezen.'}
        >
          {landed.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {landed.map((id) => (
                <Chip
                  key={id}
                  active={p.signatureTrick === id}
                  onClick={() => setP({ ...p, signatureTrick: p.signatureTrick === id ? undefined : id })}
                >
                  {TRICK_BY_ID.get(id)?.name ?? id}
                </Chip>
              ))}
            </div>
          )}
        </Field>
        <List>
          <Row icon="board" title="Stance en bindingen" detail="Staat op je pas, stel je in bij Gear" to="/gear" />
        </List>
        {p.nickname && (
          <div className="flex items-center justify-between text-[15px]">
            <span>
              Bijnaam: <span className="font-medium">“{p.nickname}”</span>
            </span>
            <Button size="sm" variant="plain" onClick={() => setP({ ...p, nickname: undefined })}>
              Weghalen
            </Button>
          </div>
        )}
      </div>
      <div className="h-4" />
      <ResortPicker
        open={resorts}
        title="Je thuisresort"
        onClose={() => setResorts(false)}
        onPick={(r) => {
          setP({ ...p, homeResort: r.id ?? r.name })
          setResorts(false)
        }}
      />
    </Sheet>
  )
}

// ── Profiel van een crewgenoot ──────────────────────────────────────────────

function CrewRiderPage({ userId }: { userId: string }) {
  const [rider, setRider] = useState<CrewRider | null | undefined>(undefined)
  const [media, setMedia] = useState<MediaMeta[]>([])
  const [suggest, setSuggest] = useState(false)
  const [nick, setNick] = useState('')

  useEffect(() => {
    let alive = true
    void cachedRider(userId).then((c) => alive && setRider((cur) => cur ?? c ?? (navigator.onLine ? undefined : null)))
    if (navigator.onLine) {
      loadRider(userId)
        .then((r) => alive && setRider(r))
        .catch(() => alive && setRider((cur) => cur ?? null))
      riderMedia(userId)
        .then((m) => alive && setMedia(m))
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [userId])

  if (rider === undefined)
    return (
      <Page>
        <PageHeader title="Rider" back />
        <div className="grid h-40 place-items-center text-muted">
          <Spinner size={22} />
        </div>
      </Page>
    )
  if (rider === null)
    return (
      <Page>
        <PageHeader title="Rider" back />
        <Empty
          icon={<Icon name="crew" size={40} className="text-accent-text" />}
          title="Profiel niet gevonden"
          body="Je ziet alleen de profielen van je crew. Misschien zit deze rider niet (meer) in je crew."
        />
      </Page>
    )

  async function send() {
    try {
      await suggestNickname(userId, nick)
      toast({ title: 'Voorgesteld', body: `${rider!.name} beslist zelf of hij op de skipas komt.`, icon: 'crew' })
      setSuggest(false)
      setNick('')
    } catch (e) {
      toast({ title: 'Voorstellen lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  return (
    <Page>
      <PageHeader title={rider.name} back />
      <RiderView userId={rider.userId} name={rider.name} profile={rider.profile} stats={rider.stats} media={media} isMe={false}>
        {navigator.onLine && (
          <Button variant="ghost" className="mt-3 w-full" onClick={() => setSuggest(true)}>
            Bijnaam voorstellen
          </Button>
        )}
      </RiderView>
      <Sheet open={suggest} onClose={() => setSuggest(false)} title="Bijnaam voorstellen" closeLabel="Annuleer">
        <Field label="Bijnaam" hint={`${rider.name} krijgt je voorstel en kiest zelf of hij op de skipas komt.`}>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={30}
            placeholder="Bijv. Valkoning"
            className={inputCls}
            autoFocus
          />
        </Field>
        <Button className="mb-4 mt-4 w-full" disabled={!nick.trim()} onClick={() => void send()}>
          Voorstellen
        </Button>
      </Sheet>
    </Page>
  )
}
