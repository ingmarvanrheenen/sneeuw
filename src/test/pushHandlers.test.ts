import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POW_CM,
  createHandlers,
  localParts,
  powCheck,
  type Pref,
  type RecordRow,
  type SnowDay,
  type Store,
  type SubRow,
} from '../../supabase/functions/push/handlers'

// Nep-database: crew c1 met me, daan, sem. Iedereen heeft één telefoon.
let records: RecordRow[]
let subs: (SubRow & Record<Pref, boolean>)[]
let done: string[]
let used: Set<string>
let removed: string[]
let forecasts: Record<string, SnowDay[] | null>
let forecastCalls: string[]
const NOW = new Date('2027-01-17T16:10:00Z') // 17:10 in Amsterdam (wintertijd)

const sub = (user_id: string, over: Partial<SubRow & Record<Pref, boolean>> = {}) => ({
  id: 's-' + user_id,
  user_id,
  endpoint: `https://web.push.apple.com/${user_id}`,
  p256dh: 'p',
  auth: 'a',
  tz: 'Europe/Amsterdam',
  crew_days: true,
  goals: true,
  reminder: true,
  pow: true,
  ...over,
})
const day = (id: string, user_id: string, data: Record<string, unknown>, over: Partial<RecordRow> = {}): RecordRow => ({
  id,
  user_id,
  kind: 'session',
  crew_id: 'c1',
  deleted: false,
  data,
  ...over,
})

const store: Store = {
  record: async (id) => records.find((r) => r.id === id) ?? null,
  crewMemberIds: async (c) => (c === 'c1' ? ['me', 'daan', 'sem'] : []),
  displayName: async (u) => ({ me: 'Ingmar', daan: 'Daan', sem: 'Sem' })[u] ?? 'Rider',
  goal: async (id) => (id === 'g1' ? { id: 'g1', crew_id: 'c1', trip_id: 't1', title: 'Iedereen een rode piste' } : null),
  goalDoneIds: async () => done,
  subscriptions: async (pref, users) => subs.filter((s) => (pref === null || s[pref]) && (!users || users.includes(s.user_id))),
  tripsAndDays: async (users) =>
    records.filter((r) => users.includes(r.user_id) && !r.deleted && (r.kind === 'trip' || r.kind === 'session')),
  forecast: async (id) => {
    forecastCalls.push(id)
    return forecasts[id] ?? null
  },
  once: async (k) => !used.has(k) && !!used.add(k),
  removeSubscription: async (id) => void removed.push(id),
}
const send = vi.fn()
const h = createHandlers(store, send, () => NOW)
const sentTo = () => send.mock.calls.map(([s]) => s.user_id).sort()
const lastMsg = () => send.mock.calls.at(-1)![1]

beforeEach(() => {
  records = [
    {
      id: 't1',
      user_id: 'daan',
      kind: 'trip',
      crew_id: 'c1',
      deleted: false,
      data: { startDate: '2027-01-16', endDate: '2027-01-23', resortName: 'Val Thorens' },
    },
  ]
  subs = [sub('me'), sub('daan'), sub('sem')]
  done = []
  used = new Set()
  removed = []
  forecasts = {}
  forecastCalls = []
  send.mockReset().mockResolvedValue({ ok: true, gone: false })
})

describe('dag gedeeld', () => {
  it('de rest van de crew krijgt een melding, jij niet', async () => {
    records.push(day('d1', 'me', { date: '2027-01-17', resortName: 'Val Thorens', hours: 5.5, landed: ['ollie', 'shifty'] }))
    expect(await h.onDay('me', 'd1')).toEqual({ status: 200, sent: 2 })
    expect(sentTo()).toEqual(['daan', 'sem'])
    expect(lastMsg()).toEqual({
      title: 'Ingmar heeft een dag gedeeld',
      body: 'Val Thorens · 5,5 u · 2 tricks geland',
      url: '#/crew',
      tag: 'day-d1',
    })
  })

  it('maar één keer per dag, ook als hij vaker synct', async () => {
    records.push(day('d1', 'me', { date: '2027-01-17' }))
    await h.onDay('me', 'd1')
    expect(await h.onDay('me', 'd1')).toMatchObject({ sent: 0, reason: 'al gemeld' })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('niet voor andermans dag, privédagen, verwijderde of oude dagen', async () => {
    records.push(
      day('x', 'daan', { date: '2027-01-17' }),
      day('p', 'me', { date: '2027-01-17' }, { crew_id: null }),
      day('del', 'me', { date: '2027-01-17' }, { deleted: true }),
      day('old', 'me', { date: '2027-01-02' }),
    )
    expect(await h.onDay('me', 'x')).toMatchObject({ status: 400 })
    expect(await h.onDay('me', 'p')).toMatchObject({ status: 400 })
    expect(await h.onDay('me', 'del')).toMatchObject({ status: 400 })
    expect(await h.onDay('me', 'old')).toMatchObject({ sent: 0, reason: 'te oud' })
    expect(send).not.toHaveBeenCalled()
  })

  it('respecteert de voorkeur en ruimt verlopen abonnementen op', async () => {
    subs = [sub('daan', { crew_days: false }), sub('sem')]
    send.mockResolvedValue({ ok: false, gone: true })
    records.push(day('d1', 'me', { date: '2027-01-17' }))
    expect(await h.onDay('me', 'd1')).toEqual({ status: 200, sent: 0 })
    expect(sentTo()).toEqual(['sem'])
    expect(removed).toEqual(['s-sem'])
  })
})

describe('crew-doel', () => {
  it('wie hem nog niet heeft krijgt een duwtje, met de juiste link', async () => {
    done = ['me']
    expect(await h.onGoal('me', 'g1')).toEqual({ status: 200, sent: 2 })
    expect(sentTo()).toEqual(['daan', 'sem'])
    const byUser = Object.fromEntries(send.mock.calls.map(([s, m]) => [s.user_id, m]))
    expect(byUser.sem).toEqual({
      title: 'Ingmar heeft "Iedereen een rode piste" gehaald',
      body: '1/3 van de crew. Jij nog?',
      url: '#/reizen/crew/t1',
      tag: 'goal-g1',
    })
    // daan is de eigenaar van de trip: die opent zijn eigen trip
    expect(byUser.daan.url).toBe('#/reizen/t1')
  })

  it('wie hem al heeft, wordt niet gestoord', async () => {
    done = ['daan', 'me']
    await h.onGoal('me', 'g1')
    expect(sentTo()).toEqual(['sem'])
  })

  it('de laatste: de hele crew krijgt "Crew-doel gehaald"', async () => {
    done = ['daan', 'sem', 'me']
    await h.onGoal('me', 'g1')
    expect(sentTo()).toEqual(['daan', 'sem'])
    expect(lastMsg().title).toBe('Crew-doel gehaald')
    expect(lastMsg().body).toBe('Iedereen heeft "Iedereen een rode piste" gehaald. Ingmar was de laatste.')
  })

  it('alleen als je hem echt afgevinkt hebt, en maar één keer', async () => {
    expect(await h.onGoal('me', 'g1')).toMatchObject({ status: 400, reason: 'niet afgevinkt' })
    expect(await h.onGoal('me', 'nope')).toMatchObject({ status: 400 })
    done = ['me']
    await h.onGoal('me', 'g1')
    expect(await h.onGoal('me', 'g1')).toMatchObject({ sent: 0, reason: 'al gemeld' })
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('"Log je dag"-herinnering', () => {
  it('om 17:00 lokaal tijdens een trip, als je nog niks logde', async () => {
    records.push(day('d1', 'sem', { date: '2027-01-17' }))
    expect(await h.runReminders()).toEqual({ status: 200, sent: 1 })
    expect(sentTo()).toEqual(['daan']) // me en sem: me heeft geen trip, sem logde al
    expect(lastMsg()).toEqual({
      title: 'Log je dag',
      body: 'Hoe ging het vandaag in Val Thorens? Even loggen, dan telt hij mee.',
      url: '#/log/nieuw',
      tag: 'reminder',
    })
  })

  it('niet buiten 17:00 in jouw tijdzone, niet zonder voorkeur, en maar één keer per dag', async () => {
    subs = [sub('daan', { tz: 'America/New_York' })]
    expect(await h.runReminders()).toEqual({ status: 200, sent: 0 })
    subs = [sub('daan', { reminder: false })]
    expect(await h.runReminders()).toEqual({ status: 200, sent: 0 })
    subs = [sub('daan')]
    await h.runReminders()
    expect(await h.runReminders()).toEqual({ status: 200, sent: 0 })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('niet als de trip voorbij of nog niet begonnen is', async () => {
    records[0].data = { startDate: '2027-01-20', endDate: '2027-01-27' }
    expect(await h.runReminders()).toMatchObject({ sent: 0 })
  })
})

describe('testmelding', () => {
  it('naar je eigen telefoon, ook met alle soorten uit; niet vaker dan eens per minuut', async () => {
    subs = [sub('me', { crew_days: false, goals: false, reminder: false })]
    expect(await h.onTest('me')).toEqual({ status: 200, sent: 1 })
    expect(lastMsg().title).toBe('Meldingen staan aan')
    expect(await h.onTest('me')).toMatchObject({ status: 429 })
    expect(await h.onTest('daan')).toMatchObject({ status: 400 })
  })
})

describe('localParts', () => {
  it('rekent in de tijdzone van de telefoon, met Amsterdam als vangnet', () => {
    expect(localParts(NOW, 'Europe/Amsterdam')).toEqual({ date: '2027-01-17', hour: 17 })
    expect(localParts(NOW, 'Asia/Tokyo')).toEqual({ date: '2027-01-18', hour: 1 })
    expect(localParts(NOW, 'Niet/Bestaand')).toEqual({ date: '2027-01-17', hour: 17 })
  })
})

describe('pow-alarm', () => {
  // 17:10 UTC = 18:10 in Amsterdam
  const powH = createHandlers(store, send, () => new Date('2027-01-17T17:10:00Z'))
  const trip = (user_id: string, over: Record<string, unknown> = {}): RecordRow => ({
    id: 'trip-' + user_id,
    user_id,
    kind: 'trip',
    crew_id: null,
    deleted: false,
    data: { id: 'trip-' + user_id, startDate: '2027-01-18', endDate: '2027-01-25', resortId: 'tignes', resortName: 'Tignes', ...over },
  })
  const snow = (cm: Record<string, number>): SnowDay[] => Object.entries(cm).map(([date, snowCm]) => ({ date, snowCm }))

  it('genoeg verse sneeuw: melding om 18:00 met de dagen, één weerbericht per resort', async () => {
    records = [trip('me'), trip('daan')]
    subs = [sub('me'), sub('daan')]
    forecasts.tignes = snow({ '2027-01-17': 30, '2027-01-18': 18, '2027-01-19': 7, '2027-01-20': 0 })
    expect(await powH.runPow()).toEqual({ status: 200, sent: 2 })
    expect(forecastCalls).toEqual(['tignes'])
    // sneeuw van vandaag telt niet (die heb je al gezien), morgen en overmorgen wel
    expect(lastMsg()).toEqual({
      title: 'Pow-alarm: 25 cm in Tignes',
      body: 'Morgen 18 cm, overmorgen 7 cm. Je trip begint morgen. Goggles klaarleggen.',
      url: '#/weer',
      tag: 'pow-trip-daan',
    })
  })

  it('dezelfde bui maar één keer; een nieuwe piekdag wel weer', async () => {
    records = [trip('me')]
    subs = [sub('me')]
    forecasts.tignes = snow({ '2027-01-18': 20 })
    await powH.runPow()
    expect(await powH.runPow()).toMatchObject({ sent: 0 })
    forecasts.tignes = snow({ '2027-01-18': 20, '2027-01-19': 30 })
    expect(await powH.runPow()).toMatchObject({ sent: 1 })
  })

  it('niet om een ander uur, niet met de voorkeur uit, niet zonder resort, niet bij te weinig sneeuw', async () => {
    records = [trip('me'), trip('daan', { resortId: undefined }), trip('sem')]
    subs = [sub('me', { tz: 'Asia/Tokyo' }), sub('daan'), sub('sem', { pow: false })]
    forecasts.tignes = snow({ '2027-01-18': 40 })
    expect(await powH.runPow()).toMatchObject({ sent: 0 })
    subs = [sub('me')]
    records = [trip('me')]
    forecasts.tignes = snow({ '2027-01-18': POW_CM - 1 })
    expect(await powH.runPow()).toMatchObject({ sent: 0 })
  })

  it('trip ver weg of al voorbij: geen alarm; weer kapot: ook niet', async () => {
    subs = [sub('me')]
    forecasts.tignes = snow({ '2027-01-18': 40 })
    records = [trip('me', { startDate: '2027-02-10', endDate: '2027-02-17' })]
    expect(await powH.runPow()).toMatchObject({ sent: 0 })
    records = [trip('me', { startDate: '2027-01-10', endDate: '2027-01-17' })]
    expect(await powH.runPow()).toMatchObject({ sent: 0 })
    records = [trip('me')]
    forecasts.tignes = null
    expect(await powH.runPow()).toMatchObject({ sent: 0 })
  })

  it('tijdens de trip: wekker zetten; sneeuw na de trip telt niet, twee dagen ervoor wel', () => {
    const t = { startDate: '2027-01-20', endDate: '2027-01-22' }
    const r = powCheck(t, snow({ '2027-01-17': 50, '2027-01-18': 10, '2027-01-19': 6, '2027-01-23': 40 }), '2027-01-17')
    // 17e is vandaag, 18e en 19e vallen in de twee dagen voor de trip, 23e is na de trip
    expect(r?.total).toBe(16)
    expect(r?.peak.date).toBe('2027-01-18')
    expect(powCheck(t, snow({ '2027-01-23': 40 }), '2027-01-17')).toBeNull()
  })

  it('tijdens de trip zegt de melding: wekker zetten', async () => {
    records = [trip('me', { startDate: '2027-01-15' })]
    subs = [sub('me')]
    forecasts.tignes = snow({ '2027-01-18': 12, '2027-01-21': 9 })
    await powH.runPow()
    // 21 januari 2027 is een donderdag
    expect(lastMsg().body).toBe('Morgen 12 cm, do 9 cm. Zet je wekker voor de eerste lift.')
  })
})
