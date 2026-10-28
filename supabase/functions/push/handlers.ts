// Wie krijgt welke melding. Puur: alle data komt via `Store`, versturen via `send`,
// zodat dit in vitest te testen is (src/test/pushHandlers.test.ts). index.ts koppelt het aan Supabase.

export interface PushMessage {
  title: string
  body: string
  /** hash-route in de app, bijv. '#/crew' */
  url: string
  /** zelfde tag vervangt een oudere melding op je telefoon */
  tag: string
}

export type Pref = 'crew_days' | 'goals' | 'reminder' | 'pow'

export interface SubRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  tz: string
}

export interface RecordRow {
  id: string
  user_id: string
  kind: string
  crew_id: string | null
  deleted: boolean
  data: Record<string, unknown>
}

export interface Store {
  record(id: string): Promise<RecordRow | null>
  crewMemberIds(crewId: string): Promise<string[]>
  displayName(userId: string): Promise<string>
  goal(id: string): Promise<{ id: string; crew_id: string; trip_id: string; title: string } | null>
  goalDoneIds(goalId: string): Promise<string[]>
  /** abonnementen met deze voorkeur aan (null: alle); zonder userIds: van iedereen */
  subscriptions(pref: Pref | null, userIds?: string[]): Promise<SubRow[]>
  /** trips en dagen (niet verwijderd) van deze users */
  tripsAndDays(userIds: string[]): Promise<Pick<RecordRow, 'user_id' | 'kind' | 'data'>[]>
  /** sneeuwverwachting per dag voor een resort uit de app, of null als het resort onbekend is of het weer niet lukt */
  forecast(resortId: string): Promise<SnowDay[] | null>
  /** true als deze sleutel nog niet gebruikt is (en legt hem vast): elke melding maar één keer */
  once(key: string): Promise<boolean>
  removeSubscription(id: string): Promise<void>
}

export type Send = (sub: SubRow, msg: PushMessage) => Promise<{ ok: boolean; gone: boolean }>

export interface SnowDay {
  date: string
  snowCm: number
}

/** vanaf zoveel cm verse sneeuw in de komende dagen is het pow-alarm */
export const POW_CM = 15

export interface Result {
  status: number
  sent: number
  reason?: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const fmtHours = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')

/** Datum en uur in een tijdzone (onbekende zone: Amsterdam). */
export function localParts(at: Date, tz: string): { date: string; hour: number } {
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
  let f: Intl.DateTimeFormat
  try {
    f = fmt(tz)
  } catch {
    f = fmt('Europe/Amsterdam')
  }
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)

export function dayMessage(name: string, id: string, s: Record<string, unknown>): PushMessage {
  const landed = Array.isArray(s.landed) ? s.landed.length : 0
  const parts = [s.resortName ? String(s.resortName) : '', Number(s.hours) > 0 ? `${fmtHours(Number(s.hours))} u` : '']
  if (landed) parts.push(`${plural(landed, 'trick', 'tricks')} geland`)
  return {
    title: `${name} heeft een dag gedeeld`,
    body: parts.filter(Boolean).join(' · ') || 'Check de crew-feed',
    url: '#/crew',
    tag: `day-${id}`,
  }
}

export function reminderMessage(resortName?: string): PushMessage {
  return {
    title: 'Log je dag',
    body: resortName
      ? `Hoe ging het vandaag in ${resortName}? Even loggen, dan telt hij mee.`
      : 'Hoe ging het vandaag? Even loggen, dan telt hij mee.',
    url: '#/log/nieuw',
    tag: 'reminder',
  }
}

const WEEKDAY = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5)

/**
 * Valt er genoeg verse sneeuw voor deze trip? We kijken naar de komende 6 dagen, alleen tijdens de trip en de
 * twee dagen ervoor (dan ligt het er als je aankomt). Geeft de dagen met sneeuw en de dag met de meeste.
 */
export function powCheck(trip: { startDate: string; endDate?: string }, forecast: SnowDay[], today: string) {
  const end = trip.endDate ?? trip.startDate
  const from = addDays(trip.startDate, -2)
  const days = forecast.filter((d) => d.date > today && d.date <= addDays(today, 6) && d.date >= from && d.date <= end && d.snowCm >= 1)
  const total = Math.round(days.reduce((a, d) => a + d.snowCm, 0))
  if (total < POW_CM) return null
  const peak = days.reduce((a, d) => (d.snowCm > a.snowCm ? d : a))
  return { total, days, peak }
}

export function powMessage(
  tripId: string,
  resortName: string,
  trip: { startDate: string },
  pow: NonNullable<ReturnType<typeof powCheck>>,
  today: string,
): PushMessage {
  const label = (date: string) => {
    const n = dayDiff(today, date)
    return n === 1 ? 'morgen' : n === 2 ? 'overmorgen' : WEEKDAY[new Date(date + 'T12:00:00Z').getUTCDay()]
  }
  const list = pow.days.map((d) => `${label(d.date)} ${Math.round(d.snowCm)} cm`).join(', ')
  const until = dayDiff(today, trip.startDate)
  const when =
    until <= 0
      ? 'Zet je wekker voor de eerste lift.'
      : until === 1
        ? 'Je trip begint morgen. Goggles klaarleggen.'
        : `Je trip begint over ${until} dagen.`
  return {
    title: `Pow-alarm: ${pow.total} cm in ${resortName}`,
    body: `${list[0].toUpperCase()}${list.slice(1)}. ${when}`,
    url: '#/weer',
    tag: `pow-${tripId}`,
  }
}

export function createHandlers(store: Store, send: Send, now: () => Date = () => new Date()) {
  async function deliver(subs: SubRow[], msg: (s: SubRow) => PushMessage): Promise<number> {
    const results = await Promise.allSettled(
      subs.map(async (s) => {
        const r = await send(s, msg(s))
        if (r.gone) await store.removeSubscription(s.id)
        return r.ok
      }),
    )
    return results.filter((r) => r.status === 'fulfilled' && r.value).length
  }

  /** Je deelde een dag met je crew: de rest van de crew krijgt een melding. */
  async function onDay(userId: string, id: string): Promise<Result> {
    const r = await store.record(id)
    if (!r || r.user_id !== userId || r.kind !== 'session' || !r.crew_id || r.deleted)
      return { status: 400, sent: 0, reason: 'geen gedeelde dag van jou' }
    // oude dagen die nu pas syncen: geen melding meer
    const today = now().toISOString().slice(0, 10)
    const date = String(r.data.date ?? '')
    if (date < addDays(today, -2) || date > addDays(today, 1)) return { status: 200, sent: 0, reason: 'te oud' }
    if (!(await store.once(`day:${id}`))) return { status: 200, sent: 0, reason: 'al gemeld' }
    const others = (await store.crewMemberIds(r.crew_id)).filter((u) => u !== userId)
    if (!others.length) return { status: 200, sent: 0 }
    const msg = dayMessage(await store.displayName(userId), id, r.data)
    return { status: 200, sent: await deliver(await store.subscriptions('crew_days', others), () => msg) }
  }

  /** Je vinkte een crew-doel af: wie het nog niet heeft krijgt een duwtje, en als iedereen het heeft: feest. */
  async function onGoal(userId: string, id: string): Promise<Result> {
    const g = await store.goal(id)
    if (!g) return { status: 400, sent: 0, reason: 'onbekend doel' }
    const done = await store.goalDoneIds(id)
    if (!done.includes(userId)) return { status: 400, sent: 0, reason: 'niet afgevinkt' }
    const members = await store.crewMemberIds(g.crew_id)
    if (!members.includes(userId)) return { status: 400, sent: 0, reason: 'niet in deze crew' }
    if (!(await store.once(`goal:${id}:${userId}`))) return { status: 200, sent: 0, reason: 'al gemeld' }

    const trip = await store.record(g.trip_id)
    const url = (uid: string) => (trip?.user_id === uid ? `#/reizen/${g.trip_id}` : `#/reizen/crew/${g.trip_id}`)
    const allDone = members.every((m) => done.includes(m))
    const name = await store.displayName(userId)
    const others = members.filter((u) => u !== userId)
    // iedereen klaar: de hele crew; anders alleen wie hem nog moet halen
    const to = allDone ? others : others.filter((u) => !done.includes(u))
    if (!to.length) return { status: 200, sent: 0 }
    const msg = (s: SubRow): PushMessage =>
      allDone
        ? {
            title: 'Crew-doel gehaald',
            body: `Iedereen heeft "${g.title}" gehaald. ${name} was de laatste.`,
            url: url(s.user_id),
            tag: `goal-${id}`,
          }
        : {
            title: `${name} heeft "${g.title}" gehaald`,
            body: `${done.length}/${members.length} van de crew. Jij nog?`,
            url: url(s.user_id),
            tag: `goal-${id}`,
          }
    return { status: 200, sent: await deliver(await store.subscriptions('goals', to), msg) }
  }

  /**
   * Elk uur via pg_cron: om 17:00 (lokale tijd van je telefoon) tijdens een trip, als je vandaag nog niks logde.
   * Mag vaker aangeroepen worden: per user per dag maar één herinnering.
   */
  async function runReminders(): Promise<Result> {
    const at = now()
    const subs = (await store.subscriptions('reminder')).filter((s) => localParts(at, s.tz).hour === 17)
    if (!subs.length) return { status: 200, sent: 0 }
    const users = [...new Set(subs.map((s) => s.user_id))]
    const rows = await store.tripsAndDays(users)
    let sent = 0
    for (const u of users) {
      const mine = subs.filter((s) => s.user_id === u)
      const today = localParts(at, mine[0].tz).date
      const trip = rows.find((r) => {
        if (r.user_id !== u || r.kind !== 'trip' || !r.data.startDate) return false
        const start = String(r.data.startDate)
        return start <= today && String(r.data.endDate ?? start) >= today
      })
      const logged = rows.some((r) => r.user_id === u && r.kind === 'session' && r.data.date === today)
      if (!trip || logged || !(await store.once(`reminder:${u}:${today}`))) continue
      const msg = reminderMessage(trip.data.resortName ? String(trip.data.resortName) : undefined)
      sent += await deliver(mine, () => msg)
    }
    return { status: 200, sent }
  }

  /**
   * Elk uur via pg_cron (zelfde aanroep als de herinnering): om 18:00 lokaal, voor je eerstvolgende trip
   * (bezig of binnen een week). Dezelfde sneeuwbui (trip + dag met de meeste sneeuw) meldt hij maar één keer.
   */
  async function runPow(): Promise<Result> {
    const at = now()
    const subs = (await store.subscriptions('pow')).filter((s) => localParts(at, s.tz).hour === 18)
    if (!subs.length) return { status: 200, sent: 0 }
    const users = [...new Set(subs.map((s) => s.user_id))]
    const rows = await store.tripsAndDays(users)
    const forecasts = new Map<string, Promise<SnowDay[] | null>>()
    let sent = 0
    for (const u of users) {
      const mine = subs.filter((s) => s.user_id === u)
      const today = localParts(at, mine[0].tz).date
      const trip = rows
        .filter((r) => r.user_id === u && r.kind === 'trip' && r.data.startDate && r.data.resortId)
        .filter((r) => String(r.data.endDate ?? r.data.startDate) > today && String(r.data.startDate) <= addDays(today, 7))
        .sort((a, b) => String(a.data.startDate).localeCompare(String(b.data.startDate)))[0]
      if (!trip) continue
      const resortId = String(trip.data.resortId)
      // één weerbericht per resort per run, ook als de hele crew erheen gaat
      if (!forecasts.has(resortId))
        forecasts.set(
          resortId,
          store.forecast(resortId).catch(() => null),
        )
      const forecast = await forecasts.get(resortId)!
      if (!forecast) continue
      const t = { startDate: String(trip.data.startDate), endDate: trip.data.endDate ? String(trip.data.endDate) : undefined }
      const pow = powCheck(t, forecast, today)
      const tripId = String(trip.data.id ?? '')
      if (!pow || !(await store.once(`pow:${u}:${tripId}:${pow.peak.date}`))) continue
      sent += await deliver(mine, () => powMessage(tripId, String(trip.data.resortName ?? 'je resort'), t, pow, today))
    }
    return { status: 200, sent }
  }

  /** Testmelding naar je eigen telefoon(s), vanuit Instellingen. */
  async function onTest(userId: string): Promise<Result> {
    const subs = await store.subscriptions(null, [userId])
    if (!subs.length) return { status: 400, sent: 0, reason: 'geen abonnement' }
    if (!(await store.once(`test:${userId}:${now().toISOString().slice(0, 16)}`))) return { status: 429, sent: 0, reason: 'even wachten' }
    const msg: PushMessage = {
      title: 'Meldingen staan aan',
      body: 'Zo ziet een melding van Sneeuw Daddy eruit.',
      url: '#/instellingen',
      tag: 'test',
    }
    return { status: 200, sent: await deliver(subs, () => msg) }
  }

  return { onDay, onGoal, runReminders, runPow, onTest }
}
