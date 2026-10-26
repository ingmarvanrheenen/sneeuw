import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, Mood } from '../design/icons'
import { Button, Card, Page, PageHeader, Progress, Section, LevelDots } from '../components/ui'
import { SyncBadge } from '../components/SyncBadge'
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
    <Card className="relative mb-4 border-accent">
      <button
        aria-label="Verbergen"
        className="absolute right-3 top-3 text-muted"
        onClick={() => {
          try {
            localStorage.setItem('sd-install-dismissed', '1')
          } catch {
            /* ok */
          }
          setShow(false)
        }}
      >
        <Icon name="close" size={16} />
      </button>
      <div className="label text-accent-text">Installeer de app</div>
      <p className="mt-1 pr-6 text-sm">
        Tik in Safari op <Icon name="share" size={14} className="inline -mt-0.5" /> <b>Deel</b> → <b>Zet op beginscherm</b>. Dan werkt hij
        als echte app, ook offline op de berg.
      </p>
    </Card>
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
      <PageHeader kicker={fmtDate(today, true)} title={`${greet}${name ? `, ${name}` : ''}`} right={<SyncBadge />} />
      <InstallHint />

      {lvl && (
        <Card onClick={() => nav('/badges')} className="relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <div className="label">Level {String(lvl.level).padStart(2, '0')}</div>
              <div className="mt-0.5 text-2xl font-semibold tracking-tight">{lvl.name}</div>
            </div>
            <div className="text-right">
              <div className="num text-3xl font-semibold text-accent-text">{lvl.xp}</div>
              <div className="label">XP</div>
            </div>
          </div>
          <Progress value={lvl.progress} className="mt-4" />
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>{lvl.next ? `Nog ${lvl.needed - lvl.current} XP tot ${lvl.next}` : 'Max level. Respect.'}</span>
            <span>{progress.badges.length} badges</span>
          </div>
        </Card>
      )}

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" icon={<Icon name="plus" size={20} />} onClick={() => nav('/log/nieuw')}>
          Log je dag
        </Button>
        <Button size="lg" variant="ghost" icon={<Icon name="chat" size={20} />} onClick={() => nav('/coach')} aria-label="Coach Daddy">
          Coach
        </Button>
      </div>

      {nextTrip && (
        <Card onClick={() => nav(`/reizen/${nextTrip.id}`)} className="mt-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="label">Volgende trip</div>
              <div className="mt-0.5 font-semibold">{nextTrip.name}</div>
              <div className="text-xs text-muted">{nextTrip.resortName}</div>
            </div>
            <div className="text-right">
              <div className="num text-3xl font-semibold">{Math.max(0, daysUntil(nextTrip.startDate!))}</div>
              <div className="label">dagen</div>
            </div>
          </div>
          {nextTrip.packing.length > 0 && (
            <>
              <Progress value={packed / nextTrip.packing.length} className="mt-3" />
              <div className="mt-1 text-xs text-muted">
                Paklijst {packed}/{nextTrip.packing.length}
              </div>
            </>
          )}
        </Card>
      )}

      <Section
        title="Doelen"
        action={
          <Link to="/doelen" className="label flex items-center gap-1 !text-accent-text">
            alle <Icon name="arrow" size={12} />
          </Link>
        }
      >
        {openGoals.length ? (
          <div className="space-y-2">
            {openGoals.map((g) => (
              <Card key={g.id} onClick={() => nav(g.trickId ? `/tricks/${g.trickId}` : '/doelen')} className="flex items-center gap-3 py-3">
                <Icon name="target" size={18} className="text-accent-text" />
                <span className="flex-1 text-sm">{g.title}</span>
                {g.trickId && <LevelDots level={TRICK_BY_ID.get(g.trickId)?.level ?? 1} />}
              </Card>
            ))}
          </div>
        ) : (
          <Card onClick={() => nav('/doelen')} className="text-sm text-muted">
            Nog geen doelen. Wat wil je deze trip leren? →
          </Card>
        )}
      </Section>

      <Section title="Volgende stap">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {nextUp.map((t) => (
            <Link key={t.id} to={`/tricks/${t.id}`} className="card w-40 shrink-0 p-3">
              <LevelDots level={t.level} />
              <div className="mt-2 text-sm font-semibold leading-tight">{t.name}</div>
              <div className="mt-1 line-clamp-2 text-xs text-muted">{t.summary}</div>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        title="Laatste dagen"
        action={
          <Link to="/log" className="label flex items-center gap-1 !text-accent-text">
            logboek <Icon name="arrow" size={12} />
          </Link>
        }
      >
        {recent.length ? (
          <div className="space-y-2">
            {recent.map((s) => (
              <Card key={s.id} onClick={() => nav(`/log/${s.id}`)} className="flex items-center gap-3 py-3">
                <Mood value={s.mood} className="text-accent-text" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.resortName || 'Onbekend'}</div>
                  <div className="label">{fmtDate(s.date)}</div>
                </div>
                <div className="num text-right text-xs text-muted">
                  {s.hours}u · {s.falls}× gevallen
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-sm text-muted">Nog niks gelogd. Na je eerste dag staat hier je geschiedenis.</Card>
        )}
      </Section>
    </Page>
  )
}
