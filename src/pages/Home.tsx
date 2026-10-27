import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Mood } from '../design/icons'
import { Button, List, Page, PageHeader, Progress, Row, Section, SectionLink, LevelDots } from '../components/ui'
import { SyncBadge } from '../components/SyncBadge'
import { QuickLog } from '../components/QuickLog'
import { useProgress } from '../lib/useProgress'
import { sessionsSorted, useKind } from '../lib/repo'
import { getProfile } from '../lib/auth'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import { isIOS, isStandalone } from '../lib/pwa'
import { todayISO } from '../lib/ids'
import { fmtDate, daysUntil } from '../lib/format'

function InstallHint() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      setShow(isIOS() && !isStandalone() && localStorage.getItem('sd-install-dismissed') !== '1')
    } catch {
      setShow(isIOS() && !isStandalone())
    }
  }, [])
  if (!show) return null
  return (
    <div className="relative mb-6 rounded-[14px] bg-accent-soft p-4 pr-10">
      <button
        aria-label="Verbergen"
        className="absolute right-2 top-2 grid size-9 place-items-center text-muted"
        onClick={() => {
          try {
            localStorage.setItem('sd-install-dismissed', '1')
          } catch {
            /* ok */
          }
          setShow(false)
        }}
      >
        <Icon name="close" size={14} />
      </button>
      <div className="text-[15px] font-semibold">Zet hem op je beginscherm</div>
      <p className="mt-1 text-[15px] text-muted">
        Tik in Safari op <Icon name="share" size={15} className="-mt-0.5 inline" /> Deel en dan Zet op beginscherm. Dan werkt hij als echte
        app, ook offline op de berg.
      </p>
    </div>
  )
}

export default function Home() {
  const nav = useNavigate()
  const progress = useProgress()
  const sessions = useKind('session')
  const goals = useKind('goal')
  const trips = useKind('trip')
  const trickRows = useKind('trick')
  const [name, setName] = useState('')
  const [quick, setQuick] = useState(false)
  useEffect(() => {
    void getProfile().then((p) => setName(p.displayName))
  }, [])

  const today = todayISO()
  const nextTrip = (trips ?? [])
    .filter((t) => t.startDate && (t.endDate ?? t.startDate) >= today)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))[0]
  const packed = nextTrip ? nextTrip.packing.filter((p) => p.checked).length : 0
  const openGoals = (goals ?? []).filter((g) => !g.done).slice(0, 3)
  const recent = sessionsSorted(sessions ?? []).slice(0, 3)
  const loggedToday = (sessions ?? []).find((s) => s.date === today)

  const landedIds = new Set((trickRows ?? []).filter((t) => t.status === 'geland' || t.status === 'beheerst').map((t) => t.trickId))
  // Eerst wat net ontgrendeld is door iets wat je al kunt, dan de rest op niveau
  const nextUp = TRICKS.filter((t) => !landedIds.has(t.id) && t.prereqs.every((p) => landedIds.has(p)))
    .sort((a, b) => Number(b.prereqs.length > 0) - Number(a.prereqs.length > 0) || a.level - b.level)
    .slice(0, 4)

  const lvl = progress?.level
  const hour = new Date().getHours()
  const greet = hour < 6 ? 'Nachtbraker' : hour < 12 ? 'Goeiemorgen' : hour < 18 ? 'Yo' : 'Goeienavond'

  return (
    <Page>
      <PageHeader subtitle={fmtDate(today, true)} title={`${greet}${name ? `, ${name}` : ''}`} right={<SyncBadge />} />
      <InstallHint />

      {lvl && (
        <button onClick={() => nav('/badges')} className="block w-full text-left active:opacity-70">
          <div className="flex items-baseline justify-between gap-3">
            <span className="display text-[26px]">{lvl.name}</span>
            <span className="num text-[15px] text-muted">
              Level {lvl.level} · {lvl.xp} XP
            </span>
          </div>
          <Progress value={lvl.progress} className="mt-3" />
          <div className="mt-2 text-[13px] text-muted">
            {lvl.next ? `Nog ${lvl.needed - lvl.current} XP tot ${lvl.next}` : 'Max level. Respect.'} · {progress.badges.length} badges
          </div>
        </button>
      )}

      {loggedToday ? (
        <Button
          size="lg"
          variant="outline"
          className="mt-6 w-full"
          icon={<Icon name="edit" size={20} />}
          onClick={() => nav(`/log/${loggedToday.id}/bewerk`)}
        >
          Vandaag aanvullen
        </Button>
      ) : (
        <Button size="lg" className="mt-6 w-full" icon={<Icon name="plus" size={20} stroke={2.2} />} onClick={() => setQuick(true)}>
          Log je dag
        </Button>
      )}
      <QuickLog open={quick} onClose={() => setQuick(false)} />

      <List className="mt-3">
        <Row icon="chat" title="Coach Daddy" detail="Vraag om tips of een oefenplan" to="/coach" />
        {nextTrip && (
          <Row
            icon="suitcase"
            title={nextTrip.name}
            detail={`${nextTrip.resortName ?? ''}${nextTrip.packing.length ? ` · paklijst ${packed}/${nextTrip.packing.length}` : ''}`}
            value={`over ${Math.max(0, daysUntil(nextTrip.startDate!))} d`}
            to={`/reizen/${nextTrip.id}`}
          />
        )}
      </List>

      <Section title="Doelen" action={<SectionLink to="/doelen">Alle</SectionLink>}>
        <List>
          {openGoals.length ? (
            openGoals.map((g) => (
              <Row
                key={g.id}
                icon="target"
                title={g.title}
                to={g.trickId ? `/tricks/${g.trickId}` : '/doelen'}
                value={g.trickId ? <LevelDots level={TRICK_BY_ID.get(g.trickId)?.level ?? 1} /> : undefined}
              />
            ))
          ) : (
            <Row icon="target" title="Stel een doel" detail="Wat wil je deze trip leren?" to="/doelen" />
          )}
        </List>
      </Section>

      <Section title="Volgende stap" action={<SectionLink to="/tricks">Bijbel</SectionLink>}>
        <List>
          {nextUp.map((t) => (
            <Row key={t.id} title={t.name} detail={t.summary} value={<LevelDots level={t.level} />} to={`/tricks/${t.id}`} />
          ))}
        </List>
      </Section>

      <Section title="Laatste dagen" action={<SectionLink to="/log">Logboek</SectionLink>}>
        {recent.length ? (
          <List>
            {recent.map((s) => (
              <Row
                key={s.id}
                icon={<Mood value={s.mood} size={24} className="shrink-0 text-accent-text" />}
                title={s.resortName || 'Onbekend'}
                detail={fmtDate(s.date)}
                value={`${s.hours}u · ${s.falls} val`}
                to={`/log/${s.id}`}
              />
            ))}
          </List>
        ) : (
          <p className="text-[15px] text-muted">Nog niks gelogd. Na je eerste dag staat hier je geschiedenis.</p>
        )}
      </Section>
    </Page>
  )
}
