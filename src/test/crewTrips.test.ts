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
} from '../lib/crewTrips'

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
