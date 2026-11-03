// Run-teller: één grote knop. Start boven, Beneden onder; de tijd ertussen is lift. Werkt offline, alleen lokaal.
// Met GPS aan ook topsnelheid, hoogtemeters en afstand per run, zolang de app open is.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Heading, List, Page, PageHeader, Row, Stat, StatGroup, Toggle, cx } from '../components/ui'
import { Peaks } from '../components/Poster'
import { Icon } from '../design/icons'
import {
  dropRun,
  gpsPref,
  loadGpsPref,
  setGpsPref,
  setRunGps,
  type Run,
  fmtClock,
  fmtSpan,
  LONG_RUN_MS,
  loadRunDay,
  resetRunDay,
  runStats,
  runStore,
  startRun,
  stateOf,
  stopRun,
  undoRun,
} from '../lib/runs'
import { update, useKind } from '../lib/repo'
import { todayISO } from '../lib/ids'
import { fmtDate } from '../lib/format'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'
import { addFix, dayGps, emptyGps, fmtDist, fmtKmh, watchFixes, type RunGps } from '../lib/runGps'

/** Volgt GPS zolang de run loopt en GPS aan staat; bewaart elke 5 seconden en bij het stoppen. */
function useRunGps(active: boolean, run: Run | undefined) {
  const [live, setLive] = useState<RunGps | null>(null)
  const [error, setError] = useState('')
  const start = run?.start
  useEffect(() => {
    if (!active || start === undefined) {
      setLive(null)
      return
    }
    let g = run?.gps ?? emptyGps()
    let saved = 0
    setLive(g)
    setError('')
    const stop = watchFixes(
      (f) => {
        const next = addFix(g, f)
        if (next === g) return
        g = next
        setLive(g)
        setError('')
        if (f.t - saved >= 5000) {
          saved = f.t
          void setRunGps(start, g)
        }
      },
      (msg, fatal) => {
        setError(msg)
        if (fatal) void setGpsPref(false)
      },
    )
    return () => {
      stop()
      if (g.fixes) void setRunGps(start, g)
    }
    // alleen opnieuw bij een andere run of GPS aan/uit (de run zelf verandert bij elke save)
  }, [active, start])
  return { live, error }
}

const time = (t: number) => new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

export default function Runs() {
  const nav = useNavigate()
  const day = runStore.use()
  const gpsOn = gpsPref.use()
  const sessions = useKind('session')
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    void loadRunDay()
    void loadGpsPref()
    const t = setInterval(() => setNow(Date.now()), 1000)
    // terug in de app (scherm weer aan): meteen de juiste tijd
    const vis = () => document.visibilityState === 'visible' && setNow(Date.now())
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])

  const state = stateOf(day, now)
  const s = runStats(day, now)
  const nextRun = s.runs + 1
  const today = (sessions ?? []).find((x) => x.date === todayISO())
  const forgot = state === 'piste' && s.currentMs > LONG_RUN_MS
  const done = day.runs.filter((r) => r.end !== undefined)
  const { live, error: gpsErr } = useRunGps(gpsOn && state === 'piste', day.runs.at(-1))
  const dg = dayGps(done)

  const big =
    state === 'piste'
      ? { title: `Run ${nextRun}`, sub: 'Op de piste', clock: fmtClock(s.currentMs) }
      : state === 'lift'
        ? { title: 'In de lift', sub: `${s.runs} ${s.runs === 1 ? 'run' : 'runs'} erin`, clock: fmtClock(s.currentMs) }
        : state === 'pauze'
          ? { title: 'Pauze', sub: `${s.runs} ${s.runs === 1 ? 'run' : 'runs'} erin`, clock: fmtSpan(s.currentMs) }
          : { title: 'Klaar?', sub: 'Tik Start boven aan de piste', clock: '0:00' }

  async function tap() {
    if (state === 'piste') await stopRun()
    else await startRun()
    sfx.tap()
    setNow(Date.now())
  }

  async function toDay() {
    if (!today) return nav('/log/nieuw')
    await update(today, { runs: s.runs })
    sfx.success()
    toast({
      title: 'In je dag gezet',
      body: `${s.runs} ${s.runs === 1 ? 'run' : 'runs'} bij ${today.resortName || 'vandaag'}`,
      icon: 'check',
      tone: 'success',
    })
  }

  return (
    <Page>
      <PageHeader title="Run-teller" subtitle={fmtDate(todayISO(), true)} back="/" />

      <div
        role="group"
        aria-label="Nu"
        className={cx('relative overflow-hidden rounded-[6px] p-5', state === 'piste' ? 'bg-hot text-hot-ink' : 'bg-block text-block-ink')}
      >
        <Peaks className="bottom-0 right-0 w-[180px]" />
        <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">{big.sub}</div>
        <div key={big.title} className="display rise mt-1 text-[44px] uppercase leading-[0.9]">
          {big.title}
        </div>
        <div className="display num mt-3 text-[64px] leading-none" aria-live="off">
          {big.clock}
        </div>
        {live && (
          <div className="relative mt-2 text-[15px] font-semibold">
            {live.fixes ? `${fmtKmh(live.top)} top · ${live.drop} m omlaag` : 'GPS zoeken…'}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void tap()}
        className={cx(
          'shadow-hard display mt-4 flex h-24 w-full items-center justify-center gap-3 rounded-[6px] text-[30px] uppercase active:translate-y-[2px]',
          state === 'piste' ? 'bg-text text-bg' : 'bg-accent text-accent-ink',
        )}
      >
        <Icon name={state === 'piste' ? 'stop' : 'play'} size={26} />
        {state === 'piste' ? 'Beneden' : `Start run ${nextRun}`}
      </button>

      {forgot && (
        <div role="alert" className="card mt-3 p-4">
          <div className="text-[15px] font-semibold">Vergeten op Beneden te tikken?</div>
          <p className="mt-1 text-[13px] text-muted">Deze run loopt al {fmtSpan(s.currentMs)}.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => void dropRun()}>
              Gooi hem weg
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void stopRun()}>
              Stop hem nu
            </Button>
          </div>
        </div>
      )}

      {gpsErr && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {gpsErr}
        </p>
      )}

      {day.runs.length > 0 && (
        <button
          type="button"
          onClick={() => void undoRun()}
          className="mt-3 w-full py-2 text-center text-[15px] font-semibold text-accent-text"
        >
          Oeps, terug
        </button>
      )}

      <List className="mt-4">
        <Toggle
          on={gpsOn}
          onChange={(v) => void setGpsPref(v)}
          label="GPS tijdens je run"
          sub="Topsnelheid en hoogtemeters. Alleen met de app open en je scherm aan; blijft op je telefoon."
        />
      </List>

      {s.runs > 0 && (
        <>
          <StatGroup className="stagger mt-6">
            <Stat label="Runs" value={s.runs} />
            <Stat label="Op de piste" value={fmtSpan(s.pisteMs)} />
            <Stat label="In de lift" value={fmtSpan(s.liftMs)} />
          </StatGroup>
          <p className="mt-2 text-[13px] text-muted">
            Langste run {fmtClock(s.longestMs)} · gemiddeld {fmtClock(s.averageMs)}
            {s.pauseMs > 0 && ` · pauze ${fmtSpan(s.pauseMs)}`}
          </p>
          {dg && (
            <>
              <StatGroup className="stagger mt-4">
                <Stat label="km/u top" value={Math.round(dg.top)} />
                <Stat label="m omlaag" value={dg.drop} />
                <Stat label="Afstand" value={fmtDist(dg.dist)} />
              </StatGroup>
              {dg.runs < s.runs && (
                <p className="mt-2 text-[13px] text-muted">
                  Met GPS: {dg.runs} van de {s.runs} runs
                </p>
              )}
            </>
          )}

          <Button size="lg" className="mt-5 w-full" icon={<Icon name="log" size={20} />} onClick={() => void toDay()}>
            {today ? 'Zet in je dag' : 'Log je dag'}
          </Button>

          <section className="mt-8">
            <Heading>Runs</Heading>
            <List>
              {[...done].reverse().map((r, i) => (
                <div key={r.start} className="flex items-center gap-3 px-4 py-2.5 text-[15px]">
                  <span className="display num w-10 text-[22px]">{done.length - i}</span>
                  <span className="flex-1 text-muted">
                    {time(r.start)}
                    {r.gps?.fixes ? ` · ${fmtKmh(r.gps.top)} · ${r.gps.drop} m` : ''}
                  </span>
                  <span className="num font-semibold">{fmtClock(r.end! - r.start)}</span>
                </div>
              ))}
            </List>
          </section>
          <button
            type="button"
            onClick={() => confirm('De teller van vandaag op nul?') && void resetRunDay()}
            className="mt-4 w-full py-2 text-center text-[15px] text-muted"
          >
            Opnieuw beginnen
          </button>
        </>
      )}
      {!day.runs.length && (
        <List className="mt-4">
          <Row icon="bolt" title="Eerst warm worden?" detail="5 minuten, met je board aan" to="/warming-up" />
        </List>
      )}
      {!day.runs.length && (
        <p className="mt-4 text-[15px] text-muted">
          Tik Start boven aan de piste en Beneden als je onder bent. De tijd ertussen is lift; langer dan 45 minuten telt als pauze. Werkt
          ook zonder bereik, en als je scherm uit gaat.
        </p>
      )}
    </Page>
  )
}
