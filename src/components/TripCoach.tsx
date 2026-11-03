// Coach op de trip: een plan met per dag een thema, gemaakt door Coach Daddy aan het begin van de trip en
// bewaard bij de trip. Vandaag staat open; elke avond geeft de dagreview je bijsturing voor morgen.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Heading, List, Row, cx, inputCls } from './ui'
import { Peaks, Segments, Stamp, Sticker } from './Poster'
import { Icon, Spinner } from '../design/icons'
import { askTripPlan, CoachError, tripDates } from '../lib/coach'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import { useKind } from '../lib/repo'
import { todayISO } from '../lib/ids'
import { fmtDate } from '../lib/format'
import { FORECAST_DAYS, wmoIcon } from '../lib/weather'
import { RESORTS } from '../content/resorts'
import { TRICK_BY_ID } from '../content/tricks'
import { sfx } from '../lib/sounds'
import { errMsg } from '../lib/errors'
import type { Session, Trip, TripPlan } from '../lib/types'

export function TripCoach({ trip, editable }: { trip: Trip; editable: boolean }) {
  const { user } = authStore.use()
  const sessions = useKind('session')
  const [wish, setWish] = useState(trip.coachPlan?.wish ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const plan = trip.coachPlan
  const dates = tripDates(trip)
  const today = todayISO()
  const canAsk = hasBackend && !!user && editable

  if (!plan && (!editable || !dates.length)) return null

  async function make() {
    setBusy(true)
    setError('')
    try {
      await askTripPlan(trip, wish)
      sfx.success()
      setOpen(null)
    } catch (e) {
      setError(e instanceof CoachError ? e.message : errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  // weer: zat het in het plan, en kan het nu wel (trip binnen twee weken)?
  const outdoor = !!RESORTS.find((r) => r.id === trip.resortId && !r.indoor)
  const withWeather = plan?.weatherDays ?? 0
  const inRange = !!trip.startDate && (Date.parse(trip.startDate) - Date.parse(today)) / 864e5 <= FORECAST_DAYS - 2
  const weatherNow = outdoor && !!plan && withWeather < plan.days.length && inRange && (trip.endDate ?? trip.startDate ?? '') >= today
  const weatherNote =
    !plan || !outdoor || withWeather >= plan.days.length
      ? ''
      : withWeather
        ? `Met het weer voor ${withWeather} van de ${plan.days.length} dagen; de rest lag nog te ver weg.`
        : weatherNow
          ? 'Gemaakt zonder weerbericht. Er is nu een verwachting: maak een nieuw plan met het weer.'
          : `Gemaakt zonder weerbericht; dat komt ongeveer ${FORECAST_DAYS - 2} dagen voor je trip. Maak dan een nieuw plan.`

  const loggedOn = (d: string) => (sessions ?? []).find((s) => s.date === d && !s.deleted)

  // de dag op de poster: vandaag, of dag 1 als de trip nog moet beginnen; na de trip geen
  const todayIdx = plan ? plan.days.findIndex((d) => d.date === today) : -1
  const focus = !plan ? null : todayIdx >= 0 ? todayIdx : plan.days[0] && today < plan.days[0].date ? 0 : null
  const rest = (plan?.days ?? []).map((d, i) => ({ d, i })).filter(({ i }) => i !== focus)

  return (
    <section className="mt-8">
      <Heading action={busy ? <Spinner size={14} /> : undefined}>Coach op de trip</Heading>
      {!plan ? (
        <div className="card p-4">
          <p className="text-[15px] text-muted">
            Coach Daddy maakt een plan voor je {dates.length === 1 ? 'dag' : `${dates.length} dagen`}
            {trip.resortName ? ` in ${trip.resortName}` : ''}: per dag een thema en een paar oefeningen, op jouw niveau. Elke avond stuurt
            je dagreview bij voor morgen.
          </p>
          <div className="mt-3">
            <Field label="Wat wil je deze trip leren? (mag leeg)">
              <input
                className={inputCls}
                value={wish}
                maxLength={300}
                onChange={(e) => setWish(e.target.value)}
                placeholder="Bijv. eindelijk carven, of mijn eerste kicker"
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {error}
            </p>
          )}
          <Button className="mt-3 w-full" icon={<Icon name="chat" size={18} />} disabled={!canAsk || busy} onClick={() => void make()}>
            {busy ? 'Coach denkt na…' : 'Maak een plan'}
          </Button>
          {!canAsk && <p className="mt-2 text-[13px] text-muted">Log in om de coach een plan te laten maken.</p>}
        </div>
      ) : (
        <>
          {plan.intro && <p className="-mt-1 mb-3 text-[15px] text-muted">{plan.intro}</p>}
          <DayPoster plan={plan} today={today} loggedOn={loggedOn} />

          {focus !== null && (
            <DayDetails day={plan.days[focus]} logged={loggedOn(plan.days[focus].date)} isToday={plan.days[focus].date === today} />
          )}

          {weatherNote && <p className="mt-3 text-[13px] text-muted">{weatherNote}</p>}

          {rest.length > 0 && (
            <>
              <h3 className="display mb-2 mt-6 text-[20px] uppercase">{focus === null ? 'Je trip' : 'De andere dagen'}</h3>
              <List>
                {rest.map(({ d, i }) => {
                  const expanded = open === d.date
                  const s = loggedOn(d.date)
                  return (
                    <div key={d.date}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : d.date)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className={cx('display num w-9 shrink-0 text-[26px] leading-none', s && 'text-muted')}>
                          <span className="sr-only">Dag </span>
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{d.titel}</span>
                          <span className="block text-[13px] text-muted">
                            {shortDate(d.date)}
                            {s && <span className="sr-only">, gelogd</span>}
                          </span>
                        </span>
                        {d.weer && (
                          <span className="flex shrink-0 items-center gap-1 text-[13px] text-muted">
                            <Icon name={wmoIcon(d.weerCode ?? 3)} size={16} />
                            {d.weer}
                          </span>
                        )}
                        {s ? (
                          <Icon name="check" size={18} className="shrink-0 text-accent-text" />
                        ) : (
                          <Icon
                            name="chevron"
                            size={16}
                            className={cx('shrink-0 text-muted transition-transform', expanded && 'rotate-90')}
                          />
                        )}
                      </button>
                      {expanded && (
                        <div className="px-4 pb-4 pl-16">
                          <p className="text-[15px]">{d.focus}</p>
                          <ul className="mt-2 space-y-1.5">
                            {d.oefeningen.map((o) => (
                              <li key={o} className="flex gap-2 text-[15px]">
                                <Icon name="target" size={16} className="mt-0.5 shrink-0 text-accent-text" />
                                {o}
                              </li>
                            ))}
                          </ul>
                          {d.trickId && TRICK_BY_ID.get(d.trickId) && (
                            <Link
                              to={`/tricks/${d.trickId}`}
                              className="mt-3 inline-block rounded-full border hairline px-3 py-1 text-[13px] font-medium"
                            >
                              {TRICK_BY_ID.get(d.trickId)!.name}
                            </Link>
                          )}
                          {s && (
                            <Link to={`/log/${s.id}`} className="ml-3 text-[13px] font-semibold text-accent-text">
                              Terugblik van die dag
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </List>
            </>
          )}

          {editable && (
            <Button
              variant="ghost"
              className="mt-4 w-full"
              icon={<Icon name="replay" size={18} />}
              disabled={!canAsk || busy}
              onClick={() => confirm('Een nieuw plan laten maken? Het oude gaat weg.') && void make()}
            >
              {busy ? 'Coach denkt na…' : weatherNow ? 'Nieuw plan met het weer van nu' : 'Nieuw plan'}
            </Button>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  )
}

type PlanDay = TripPlan['days'][number]

/** "ma 2 nov": zonder jaartal, de trip valt toch in dit seizoen. */
const shortDate = (d: string) => fmtDate(d, true).replace(/ \d{4}$/, '')

/** Poster van de dag: vandaag (of dag 1 voor de trip), of "klaar" na de trip. Het weer als sticker. */
function DayPoster({ plan, today, loggedOn }: { plan: TripPlan; today: string; loggedOn: (d: string) => Session | undefined }) {
  const n = plan.days.length
  const logged = plan.days.filter((d) => loggedOn(d.date)).length
  const i = plan.days.findIndex((d) => d.date === today)
  const before = i < 0 && !!plan.days[0] && today < plan.days[0].date
  if (i < 0 && !before)
    return (
      <div role="group" aria-label="Trip klaar" className="relative overflow-hidden rounded-[6px] bg-block p-5 text-block-ink">
        <Peaks className="bottom-0 right-0 w-[170px]" />
        <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">{n} dagen</div>
        <div className="display rise mt-1 text-[48px] uppercase leading-[0.9]">Klaar</div>
        <p className="mt-2 text-[15px]">
          {logged} van de {n} dagen gelogd.
        </p>
        <Segments value={logged / n} count={n} className="mt-3" />
        <Stamp className="absolute right-4 top-4" tilt={8}>
          Trip af
        </Stamp>
      </div>
    )
  const at = i >= 0 ? i : 0
  const d = plan.days[at]
  const s = loggedOn(d.date)
  const days = Math.round((Date.parse(d.date) - Date.parse(today)) / 864e5)
  return (
    <div
      role="group"
      aria-label={`Dag ${at + 1} van ${n}`}
      className="relative overflow-hidden rounded-[6px] bg-block p-5 pr-28 text-block-ink"
    >
      <Peaks className="bottom-0 right-0 w-[170px]" />
      <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">
        Dag {at + 1} van {n} · {before ? (days === 1 ? 'morgen' : `over ${days} dagen`) : 'vandaag'}
      </div>
      <h3 key={d.date} className="display rise mt-1 text-[40px] uppercase leading-[0.9]">
        {d.titel}
      </h3>
      <p className="mt-2 text-[15px]">{d.focus}</p>
      <Segments value={logged / n} count={n} className="mt-4" />
      {d.weer && (
        <Sticker className="-right-1 -top-1" size={96} tilt={10}>
          <span className="flex flex-col items-center gap-0.5 px-2">
            <Icon name={wmoIcon(d.weerCode ?? 3)} size={20} />
            <span>{d.weer.replace(' · ', ' ')}</span>
          </span>
        </Sticker>
      )}
      {s && (
        <Stamp className="absolute bottom-4 right-4" tilt={-6}>
          Gelogd
        </Stamp>
      )}
    </div>
  )
}

/** De oefeningen van de dag op de poster, de trick erbij, en de terugblik. */
function DayDetails({ day, logged, isToday }: { day: PlanDay; logged?: Session; isToday: boolean }) {
  const trick = day.trickId ? TRICK_BY_ID.get(day.trickId) : undefined
  return (
    <>
      <List className="mt-3">
        {day.oefeningen.map((o) => (
          <div key={o} className="flex gap-3 px-4 py-3 text-[15px]">
            <Icon name="target" size={18} className="mt-0.5 shrink-0 text-accent-text" />
            {o}
          </div>
        ))}
      </List>
      {(trick || logged || isToday) && (
        <List className="mt-2">
          {trick && <Row icon="book" title={trick.name} detail="Trick van de dag" to={`/tricks/${trick.id}`} />}
          {logged ? (
            <Row
              icon="chat"
              title={isToday ? 'Terugblik van vandaag' : 'Terugblik van die dag'}
              detail="Coach-review en je plan voor morgen"
              to={`/log/${logged.id}`}
            />
          ) : (
            isToday && <Row icon="log" title="Log je dag" detail="Dan krijg je vanavond de terugblik" to="/log/nieuw" />
          )}
        </List>
      )}
    </>
  )
}
