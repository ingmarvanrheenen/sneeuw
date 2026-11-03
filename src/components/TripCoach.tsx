// Coach op de trip: een plan met per dag een thema, gemaakt door Coach Daddy aan het begin van de trip en
// bewaard bij de trip. Vandaag staat open; elke avond geeft de dagreview je bijsturing voor morgen.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Heading, List, cx, inputCls } from './ui'
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
import type { Trip } from '../lib/types'

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
          {plan.intro && <p className="mb-3 text-[15px]">{plan.intro}</p>}
          {weatherNote && <p className="mb-3 text-[13px] text-muted">{weatherNote}</p>}
          <List>
            {plan.days.map((d) => {
              const isToday = d.date === today
              const expanded = open === d.date || (open === null && isToday)
              const s = loggedOn(d.date)
              const trick = d.trickId ? TRICK_BY_ID.get(d.trickId) : undefined
              return (
                <div key={d.date} className={cx(isToday && 'bg-accent-soft')}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? '' : d.date)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-muted">
                        {isToday ? 'Vandaag' : fmtDate(d.date, true)}
                        {s ? ' · gelogd' : ''}
                      </span>
                      <span className="block truncate text-[15px] font-semibold">{d.titel}</span>
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
                      <Icon name="chevron" size={16} className={cx('shrink-0 text-muted', expanded && 'rotate-90')} />
                    )}
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4">
                      <p className="text-[15px]">{d.focus}</p>
                      <ul className="mt-2 space-y-1.5">
                        {d.oefeningen.map((o) => (
                          <li key={o} className="flex gap-2 text-[15px]">
                            <Icon name="target" size={16} className="mt-0.5 shrink-0 text-accent-text" />
                            {o}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {trick && (
                          <Link to={`/tricks/${trick.id}`} className="rounded-full border hairline px-3 py-1 text-[13px] font-medium">
                            {trick.name}
                          </Link>
                        )}
                        {s ? (
                          <Link to={`/log/${s.id}`} className="text-[13px] font-semibold text-accent-text">
                            Terugblik van die dag
                          </Link>
                        ) : (
                          isToday && <span className="text-[13px] text-muted">Log je dag, dan krijg je vanavond de terugblik.</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </List>
          {editable && (
            <button
              type="button"
              disabled={!canAsk || busy}
              onClick={() => confirm('Een nieuw plan laten maken? Het oude gaat weg.') && void make()}
              className="mt-2 w-full py-2 text-center text-[15px] text-muted disabled:opacity-40"
            >
              {busy ? 'Coach denkt na…' : weatherNow ? 'Nieuw plan met het weer van nu' : 'Nieuw plan'}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-1 text-[13px] text-danger">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  )
}
