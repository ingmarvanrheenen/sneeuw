import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from './fakeSupabase'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true }
})

import { db } from '../lib/db'
import { setCurrentUserId } from '../lib/auth-state'
import {
  addItem,
  cachedCrewTrips,
  cachedItems,
  crewTrips,
  listItems,
  removeItem,
  setClaim,
  setDone,
  GROUP_SUGGESTIONS,
  addGoal,
  computeRecap,
  listGoals,
  setGoalDone,
  tripDays,
  cachedGoals,
  mediaOnTrip,
  tripMedia,
} from '../lib/crewTrips'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { Session } from '../lib/types'

const fake = () => sb.ref!
const ME = 'user-me'
const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  crew_id: 'c1',
  trip_id: 't1',
  label: 'Speaker',
  claimed_by: null,
  done: false,
  created_by: ME,
  created_at: '2026-10-27T10:00:00Z',
  ...over,
})

beforeEach(async () => {
  fake().reset()
  setCurrentUserId(ME)
  await db.kv.clear()
})

describe('crew-trips', () => {
  it('haalt alleen trips van crewgenoten op en bewaart ze voor offline', async () => {
    fake().respond(() => ({ data: [{ id: 't9', user_id: 'daan', crew_id: 'c1', data: { name: 'Val Thorens' } }] }))
    const list = await crewTrips()
    expect(list).toEqual([{ id: 't9', ownerId: 'daan', crewId: 'c1', trip: { name: 'Val Thorens' } }])
    const call = fake().calls[0]
    expect(call.table).toBe('records')
    expect(call.filters).toContainEqual(['eq', 'kind', 'trip'])
    expect(call.filters).toContainEqual(['neq', 'user_id', ME])
    expect(call.filters).toContainEqual(['eq', 'deleted', false])
    expect(await cachedCrewTrips()).toEqual(list)
  })

  it('bewaart de groepslijst lokaal zodat hij offline leesbaar is', async () => {
    fake().respond(() => ({ data: [item()] }))
    await listItems('t1')
    expect(await cachedItems('t1')).toEqual([item()])
    expect(await cachedItems('ander')).toEqual([])
  })

  it('voegt een item toe met een opgeschoond label, zonder claim', async () => {
    fake().respond((c) => ({ data: { ...item(), label: (c.payload as { label: string }).label } }))
    await addItem('c1', 't1', '  Speaker  ')
    expect(fake().calls[0].payload).toEqual({ crew_id: 'c1', trip_id: 't1', label: 'Speaker', claimed_by: null })
  })

  it('kapt een te lang label af op 80 tekens en kan meteen voor jezelf claimen', async () => {
    fake().respond(() => ({ data: item() }))
    await addItem('c1', 't1', 'x'.repeat(120), true)
    const p = fake().calls[0].payload as { label: string; claimed_by: string }
    expect(p.label).toHaveLength(80)
    expect(p.claimed_by).toBe(ME)
  })

  it('claimt altijd voor jezelf en kan de claim loslaten', async () => {
    await setClaim('i1', true)
    await setClaim('i1', false)
    expect(fake().calls.map((c) => c.payload)).toEqual([{ claimed_by: ME }, { claimed_by: null }])
    expect(fake().calls[0].filters).toContainEqual(['eq', 'id', 'i1'])
  })

  it('vinkt af en verwijdert per item', async () => {
    await setDone('i1', true)
    await removeItem('i1')
    expect(fake().calls.map((c) => c.op)).toEqual(['update', 'delete'])
    expect(fake().calls[0].payload).toEqual({ done: true })
  })

  it('geeft serverfouten door zodat de UI ze kan tonen', async () => {
    fake().respond(() => ({ error: { message: 'Je kunt alleen zelf iets claimen', code: '42501' } }))
    await expect(setClaim('i1', true)).rejects.toMatchObject({ code: '42501' })
  })

  it('suggesties zijn uniek en niet leeg', () => {
    expect(new Set(GROUP_SUGGESTIONS.map((s) => s.toLowerCase())).size).toBe(GROUP_SUGGESTIONS.length)
    expect(GROUP_SUGGESTIONS.every((s) => s.trim().length > 0 && s.length <= 80)).toBe(true)
  })
})

const day = (user_id: string, date: string, over: Partial<Session> = {}) => ({
  user_id,
  data: { ...EMPTY_DRAFT, id: date + user_id, kind: 'session', createdAt: 0, updatedAt: 0, date, ...over } as Session,
})

describe('crew-doelen', () => {
  it('haalt doelen op met wie ze gehaald heeft, en bewaart ze voor offline', async () => {
    fake().respond((c) =>
      c.table === 'crew_trip_goals'
        ? { data: [{ id: 'g1', crew_id: 'c1', trip_id: 't1', title: 'Rode piste', created_by: ME, created_at: 'x' }] }
        : {
            data: [
              { goal_id: 'g1', user_id: 'daan' },
              { goal_id: 'g1', user_id: ME },
            ],
          },
    )
    const goals = await listGoals('t1')
    expect(goals[0].done).toEqual(['daan', ME])
    expect(fake().calls[1].filters).toContainEqual(['in', 'goal_id', ['g1']])
    expect(await cachedGoals('t1')).toEqual(goals)
  })

  it('geen doelen: geen tweede query', async () => {
    fake().respond(() => ({ data: [] }))
    expect(await listGoals('t1')).toEqual([])
    expect(fake().calls).toHaveLength(1)
  })

  it('afvinken alleen voor jezelf; uitvinken haalt alleen jouw vinkje weg', async () => {
    await setGoalDone('g1', true)
    await setGoalDone('g1', false)
    expect(fake().calls[0]).toMatchObject({ table: 'crew_trip_goal_done', op: 'insert', payload: { goal_id: 'g1' } })
    expect(fake().calls[1].op).toBe('delete')
    expect(fake().calls[1].filters).toContainEqual(['eq', 'user_id', ME])
  })

  it('doel toevoegen met opgeschoonde titel', async () => {
    fake().respond((c) => ({ data: { id: 'g2', ...(c.payload as object), created_by: ME, created_at: 'x' } }))
    const g = await addGoal('c1', 't1', '  Iedereen een carve  ')
    expect(g).toMatchObject({ title: 'Iedereen een carve', done: [] })
  })
})

describe('trip-recap', () => {
  it('neemt alleen gedeelde dagen binnen de tripperiode mee', async () => {
    fake().respond(() => ({
      data: [day('a', '2027-01-15'), day('a', '2027-01-16'), day('b', '2027-01-23'), day('b', '2027-01-24')],
    }))
    const days = await tripDays('c1', { startDate: '2027-01-16', endDate: '2027-01-23' })
    expect(days.map((d) => d.data.date)).toEqual(['2027-01-16', '2027-01-23'])
    expect(fake().calls[0].filters).toContainEqual(['eq', 'crew_id', 'c1'])
    expect(fake().calls[0].filters).toContainEqual(['eq', 'kind', 'session'])
  })

  it('trip zonder startdatum: niks ophalen', async () => {
    expect(await tripDays('c1', {})).toEqual([])
    expect(fake().calls).toHaveLength(0)
  })

  it('telt per persoon en voor de hele crew, met de opvallendste', () => {
    const r = computeRecap(
      [
        day('a', '2027-01-16', { hours: 5, falls: 2, landed: ['ollie'] }),
        day('a', '2027-01-17', { hours: 4.5, falls: 0, landed: ['ollie', 'fs-180'] }),
        day('b', '2027-01-16', { hours: 3, falls: 9, landed: [] }),
      ],
      { a: 'Daan', b: 'Ingmar' },
    )
    expect(r).toMatchObject({ days: 3, hours: 12.5, falls: 11 })
    expect(r.landed.sort()).toEqual(['fs-180', 'ollie'])
    expect(r.people.map((p) => [p.name, p.days, p.hours, p.landed.length])).toEqual([
      ['Daan', 2, 9.5, 2],
      ['Ingmar', 1, 3, 0],
    ])
    expect(r.mostHours?.name).toBe('Daan')
    expect(r.mostFalls?.name).toBe('Ingmar')
    expect(r.mostTricks?.name).toBe('Daan')
  })

  it('alleen jij: geen "meeste"-lijstje, en onbekende namen worden "Iemand"', () => {
    const r = computeRecap([day('x', '2027-01-16', { hours: 2, falls: 1, landed: ['ollie'] })], {})
    expect(r.people[0].name).toBe('Iemand')
    expect(r.mostHours).toBeUndefined()
    expect(r.mostFalls).toBeUndefined()
    expect(r.mostTricks).toBeUndefined()
  })

  it('niemand gevallen of niks geland: daar geen winnaar voor', () => {
    const r = computeRecap([day('a', '2027-01-16', { hours: 2 }), day('b', '2027-01-16', { hours: 3 })], { a: 'A', b: 'B' })
    expect(r.mostHours?.name).toBe('B')
    expect(r.mostFalls).toBeUndefined()
    expect(r.mostTricks).toBeUndefined()
  })

  it('lege trip', () => {
    expect(computeRecap([], {})).toMatchObject({ days: 0, hours: 0, falls: 0, landed: [], people: [] })
  })
})

describe('trip-clips (stemronde)', () => {
  const trip = { startDate: '2027-01-16', endDate: '2027-01-18' }
  const at = (date: string, hour = 12) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime()
  const media = (id: string, userId: string, over: Record<string, unknown> = {}) =>
    ({ id, userId, kind: 'media', type: 'video', mime: 'video/mp4', createdAt: at('2027-01-17'), updatedAt: 0, ...over }) as never

  it('aan een dag van de trip gekoppeld, of tijdens de trip gemaakt; nieuwste eerst', () => {
    const days = [day('daan', '2027-01-16')]
    const list = mediaOnTrip(
      [
        media('aan-dag', 'daan', { sessionId: '2027-01-16daan', createdAt: at('2027-02-01') }), // later toegevoegd, hoort bij een tripdag
        media('tijdens', 'daan', { createdAt: at('2027-01-18', 20) }),
        media('ervoor', 'daan', { createdAt: at('2027-01-15') }),
        media('erna', 'sem', { createdAt: at('2027-01-19') }),
        media('andere-dag', 'sem', { sessionId: 'oude-dag', createdAt: at('2027-01-17') }),
      ],
      days,
      trip,
    )
    expect(list.map((m) => (m as { id: string }).id)).toEqual(['aan-dag', 'tijdens'])
  })

  it('haalt de met de crew gedeelde media op en filtert op de trip', async () => {
    fake().respond(() => ({
      data: [
        { user_id: 'daan', data: media('m1', 'daan') },
        { user_id: 'sem', data: media('m2', 'sem', { createdAt: at('2026-12-01') }) },
      ],
    }))
    const list = await tripMedia('c1', trip, [])
    expect(list.map((m) => m.id)).toEqual(['m1'])
    const call = fake().calls[0]
    expect(call.filters).toContainEqual(['eq', 'kind', 'media'])
    expect(call.filters).toContainEqual(['eq', 'crew_id', 'c1'])
    expect(call.filters).toContainEqual(['eq', 'deleted', false])
  })

  it('media zonder eigenaar in de data krijgt de eigenaar van de rij', async () => {
    fake().respond(() => ({ data: [{ user_id: 'daan', data: media('m1', null as never) }] }))
    expect((await tripMedia('c1', trip, []))[0].userId).toBe('daan')
  })
})
