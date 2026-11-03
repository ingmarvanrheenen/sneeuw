import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, Mood } from '../design/icons'
import { Button, List, Page, PageHeader, Row, Section, SectionLink, LevelDots, cx } from '../components/ui'
import { LevelPoster } from '../components/Poster'
import { SyncBadge } from '../components/SyncBadge'
import { QuickLog } from '../components/QuickLog'
import { MemoRecorder } from '../components/VoiceMemos'
import { looseMemos } from '../lib/memo'
import { fmtClock, loadRunDay, runStats, runStore, stateOf } from '../lib/runs'
import { loadPrograms, nextDay, programById, programStore } from '../lib/programs'
import { planDay } from '../lib/coach'
import { toast } from '../lib/toast'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProgress } from '../lib/useProgress'
import { seasonOf } from '../lib/format'
import { LiftQuestion } from '../components/LiftQuestion'
import { DailyChallenge } from '../components/DailyChallenge'
import { DailyDrill } from '../components/DailyDrill'
import { sessionsSorted, useKind } from '../lib/repo'
import { dueNow, dueText } from '../lib/maintenance'
import { StartSteps } from '../components/StartSteps'
import { alarmDate } from '../lib/alarm'
import { getProfile } from '../lib/auth'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import { isIOS, isStandalone } from '../lib/pwa'
import { todayISO } from '../lib/ids'
import { fmtDate, daysUntil, plural } from '../lib/format'

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
    <div className="relative mb-6 rounded-[8px] bg-accent-soft p-4 pr-10">
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

/** Een cijfer van je seizoen; slams in het oranje vak, een tikje scheef. */
function SeasonCell({ value, label, hot }: { value: number | string; label: string; hot?: boolean }) {
  return (
    <span
      className={cx(
        'block rounded-[6px] border px-3 py-2.5',
        hot ? '-rotate-2 border-hot bg-hot text-hot-ink' : 'hairline bg-surface text-text',
      )}
    >
      <span className="display num block text-[32px]">{value}</span>
      <span className={cx('block text-[11px] font-extrabold uppercase tracking-[0.08em]', hot ? 'opacity-70' : 'text-muted')}>{label}</span>
    </span>
  )
}

export default function Home() {
  const nav = useNavigate()
  const progress = useProgress()
  // Wrapped op Home zodra je dit seizoen 3 dagen of meer gelogd hebt
  const wrappedSeason = (() => {
    const now = seasonOf(todayISO())
    const days = new Set((progress?.input.sessions ?? []).filter((s) => seasonOf(s.date) === now).map((s) => s.date)).size
    return days >= 3 ? now : null
  })()
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
  const waiting = useLiveQuery(() => looseMemos(today), [today, sessions?.length])
  const runDay = runStore.use()
  const [tick, setTick] = useState(Date.now())
  const runState = stateOf(runDay, tick)
  const counting = runState === 'piste' || runState === 'lift'
  useEffect(() => void loadRunDay(), [])
  const programs = programStore.use()
  useEffect(() => void loadPrograms(), [])
  const program = programs.active ? programById(programs, programs.active) : undefined
  const programDay = program ? nextDay(program, programs.runs[program.id]) : null
  const gear = useKind('gear')
  const care = dueNow(gear ?? [], sessions ?? [])[0]
  const coachTrip = (trips ?? []).find((t) => planDay(t, today))
  // morgen een dag op de berg (op trip): dan een rij naar de wekker
  const tomorrow = alarmDate()
  const tripTomorrow = (trips ?? []).some((t) => t.startDate && t.startDate <= tomorrow && (t.endDate ?? t.startDate) >= tomorrow)
  const coachToday = coachTrip ? planDay(coachTrip, today) : null
  // lopende teller: elke seconde bijwerken
  useEffect(() => {
    if (!counting) return
    const t = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [counting])

  const landedIds = new Set((trickRows ?? []).filter((t) => t.status === 'geland' || t.status === 'beheerst').map((t) => t.trickId))
  // Eerst wat net ontgrendeld is door iets wat je al kunt, dan de rest op niveau
  const nextUp = TRICKS.filter((t) => !landedIds.has(t.id) && t.prereqs.every((p) => landedIds.has(p)))
    .sort((a, b) => Number(b.prereqs.length > 0) - Number(a.prereqs.length > 0) || a.level - b.level)
    .slice(0, 4)

  const lvl = progress?.level
  const season = seasonOf(today)
  const seasonStats = (() => {
    const mine = (sessions ?? []).filter((x) => seasonOf(x.date) === season)
    return {
      days: new Set(mine.map((x) => x.date)).size,
      hours: Math.round(mine.reduce((a, x) => a + (x.hours || 0), 0) * 10) / 10,
      falls: mine.reduce((a, x) => a + (x.falls || 0), 0),
    }
  })()
  const hour = new Date().getHours()
  const greet = hour < 6 ? 'Nachtbraker' : hour < 12 ? 'Goeiemorgen' : hour < 18 ? 'Yo' : 'Goeienavond'

  return (
    <Page>
      <PageHeader subtitle={fmtDate(today, true)} title={greet} outline={name || undefined} right={<SyncBadge />} />
      <InstallHint />
      <StartSteps className="mt-4" />

      {lvl && <LevelPoster level={lvl} badges={progress.badges.length} season={season} onClick={() => nav('/badges')} className="mt-2" />}

      <button
        onClick={() => nav('/stats')}
        className="stagger mt-3 grid w-full grid-cols-3 gap-2 text-left"
        aria-label="Je seizoen in cijfers"
      >
        <SeasonCell value={seasonStats.days} label={seasonStats.days === 1 ? 'dag' : 'dagen'} />
        <SeasonCell value={seasonStats.hours.toLocaleString('nl-NL')} label="uur" />
        <SeasonCell value={seasonStats.falls} label="slams" hot />
      </button>

      {counting && (
        <button
          type="button"
          onClick={() => nav('/runs')}
          className={cx(
            'mt-6 flex w-full items-center gap-3 rounded-[6px] px-4 py-3 text-left',
            runState === 'piste' ? 'bg-hot text-hot-ink' : 'bg-block text-block-ink',
          )}
          aria-label="Run-teller"
        >
          <Icon name={runState === 'piste' ? 'mountain' : 'lift'} size={22} />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-extrabold uppercase tracking-[0.1em]">
              {runState === 'piste' ? `Run ${runStats(runDay, tick).runs + 1}` : 'In de lift'}
            </span>
            <span className="display num block text-[28px] leading-none">{fmtClock(runStats(runDay, tick).currentMs)}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}
      {loggedToday ? (
        <Button
          size="lg"
          variant="outline"
          className={counting ? 'mt-2 w-full' : 'mt-6 w-full'}
          icon={<Icon name="edit" size={20} />}
          onClick={() => nav(`/log/${loggedToday.id}/bewerk`)}
        >
          Vandaag aanvullen
        </Button>
      ) : (
        <Button
          size="lg"
          className={counting ? 'mt-2 w-full' : 'mt-6 w-full'}
          icon={<Icon name="plus" size={20} stroke={2.2} />}
          onClick={() => setQuick(true)}
        >
          Log je dag
        </Button>
      )}
      <MemoRecorder
        className="mt-2"
        label="Spraakmemo"
        link={loggedToday ? { sessionId: loggedToday.id, crewId: loggedToday.crewId ?? null } : {}}
        onSaved={() =>
          toast({
            title: 'Memo bewaard',
            body: loggedToday ? 'Staat bij je dag van vandaag.' : 'Komt bij je dag zodra je die logt.',
            icon: 'mic',
            tone: 'success',
          })
        }
      />
      {!loggedToday && !!waiting?.length && (
        <p className="mt-2 text-center text-[13px] text-muted">{plural(waiting.length, 'memo wacht', "memo's wachten")} op je dag</p>
      )}
      <QuickLog open={quick} onClose={() => setQuick(false)} />
      <DailyChallenge />
      <DailyDrill />
      <LiftQuestion />

      <List className="mt-3">
        {wrappedSeason && (
          <Row
            icon="sparkle"
            title={`Season Wrapped ${wrappedSeason}`}
            detail="Je seizoen tot nu toe, als story"
            to={`/wrapped?seizoen=${encodeURIComponent(wrappedSeason)}`}
          />
        )}
        {!counting && (
          <Row
            icon="lift"
            title="Run-teller"
            detail={runDay.runs.length ? `${runStats(runDay, tick).runs} runs vandaag` : 'Tel je runs en je tijd in de lift'}
            to="/runs"
          />
        )}
        {!loggedToday && !runDay.runs.length && (
          <Row icon="bolt" title="Warming-up" detail="5 minuten voor de eerste lift" to="/warming-up" />
        )}
        {tripTomorrow && <Row icon="clock" title="Wekker voor morgen" detail="Hoe laat je op moet voor de eerste lift" to="/wekker" />}
        {coachTrip && coachToday && (
          <Row icon="chat" title={`Coach: ${coachToday.titel}`} detail={coachToday.focus} to={`/reizen/${coachTrip.id}`} />
        )}
        {program && programDay !== null ? (
          <Row
            icon="list"
            title={`Dag ${programDay + 1}: ${program.days[programDay].title}`}
            detail={program.name}
            value={`${programDay + 1}/${program.days.length}`}
            to={`/programmas/${program.id}`}
          />
        ) : (
          <Row icon="list" title="Programma's" detail="Van groen naar rood in vijf dagen, en meer" to="/programmas" />
        )}
        {care && (
          <Row
            icon="board"
            title={`${care.due.label}: ${[care.gear.brand, care.gear.name].filter(Boolean).join(' ')}`}
            detail={dueText(care.due)}
            to="/gear"
          />
        )}
        <Row icon="replay" title="Trick-roulette" detail="Weet je niet wat je moet oefenen?" to="/tricks?roulette=1" />
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
                icon={<Mood value={s.mood} size={32} className="shrink-0" />}
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
