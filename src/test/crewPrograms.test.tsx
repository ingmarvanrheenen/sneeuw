// Programma samen met je crew: de stand per crewgenoot, delen met een crew (wat je al deed gaat mee), een dag
// afvinken komt ook bij je crew, en zonder crew geen blok. Server nagedaan; de database-regels staan in
// supabase/tests/crew_program_days.sh.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { fakeSupabase } from './fakeSupabase'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true, backendInfo: {} }
})
const crew = vi.hoisted(() => ({ crewMembers: vi.fn(), myCrews: vi.fn() }))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), ...crew }))

import Programs from '../pages/Programs'
import { crewBoard, sharedCrew, type CrewDay } from '../lib/crewPrograms'
import { loadPrograms, setDayDone, startProgram } from '../lib/programs'
import { authStore } from '../lib/auth'
import { db, kvSet } from '../lib/db'
import type { User } from '@supabase/supabase-js'

const fake = () => sb.ref!
let rows: (CrewDay & { crew_id: string; program_id: string })[] = []
const members = [
  ['me', 'Ingmar'],
  ['daan', 'Daan'],
  ['noor', 'Noor'],
].map(([user_id, display_name]) => ({ user_id, display_name, role: 'member', stats: {} }))

describe('stand per crewgenoot', () => {
  it('wie het meest deed eerst, jij altijd erbij, dagen buiten het programma tellen niet', () => {
    const r: CrewDay[] = [
      { user_id: 'daan', day: 0, done_on: '2027-01-10' },
      { user_id: 'daan', day: 1, done_on: '2027-01-11' },
      { user_id: 'daan', day: 9, done_on: '2027-01-12' },
      { user_id: 'noor', day: 0, done_on: '2027-01-10' },
    ]
    const b = crewBoard(r, members, 'me', 4)
    expect(b.map((x) => [x.name, x.count])).toEqual([
      ['Daan', 2],
      ['Noor', 1],
      ['Jij', 0],
    ])
    expect([...b[0].done]).toEqual([0, 1])
  })
})

describe('op de programmapagina', () => {
  beforeEach(async () => {
    await db.kv.clear()
    await db.records.clear()
    await loadPrograms()
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    authStore.set({ user: { id: 'me' } as User, ready: true })
    rows = [{ crew_id: 'c1', program_id: 'switch', user_id: 'daan', day: 0, done_on: '2027-01-10' }]
    fake().calls.length = 0
    crew.crewMembers.mockReset().mockResolvedValue(members)
    crew.myCrews.mockReset().mockResolvedValue([{ id: 'c1', name: 'Shred', invite_code: 'X', created_by: 'me' }])
    await kvSet('crews', [{ id: 'c1', name: 'Shred', invite_code: 'X', created_by: 'me' }])
    fake().respond((c) => {
      if (c.table !== 'crew_program_days') return { data: null }
      if (c.op === 'select') return { data: rows.filter((r) => r.program_id === 'switch') }
      if (c.op === 'upsert') {
        const p = c.payload as { day: number; done_on?: string }
        rows = [...rows, { crew_id: 'c1', program_id: 'switch', user_id: 'me', day: p.day, done_on: p.done_on ?? '2027-01-20' }]
      }
      if (c.op === 'delete') {
        const day = c.filters.find((f) => f[1] === 'day')?.[2]
        rows = rows.filter((r) => !(r.user_id === 'me' && r.day === day))
      }
      return { data: null }
    })
  })
  afterEach(() => cleanup())
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/programmas/:id" element={<Programs />} />
        </Routes>
      </MemoryRouter>,
    )

  it('delen met je crew: wat je al deed gaat mee, en je ziet je crew', async () => {
    const user = userEvent.setup()
    await startProgram('switch')
    await setDayDone('switch', 0, true, '2027-01-12')
    at('/programmas/switch')
    await user.click(await screen.findByRole('button', { name: 'Volg met Shred' }))
    await waitFor(() => expect(fake().calls.filter((c) => c.op === 'upsert')).toHaveLength(1))
    expect(fake().calls.find((c) => c.op === 'upsert')!.payload).toMatchObject({
      crew_id: 'c1',
      program_id: 'switch',
      day: 0,
      done_on: '2027-01-12',
    })
    expect(await screen.findByRole('group', { name: 'Jij: 1 van 4' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Daan: 1 van 4' })).toBeTruthy()
    expect(await sharedCrew('switch')).toBe('c1')
  })

  it('een dag afvinken komt ook bij je crew, en weer open haalt hem weg', async () => {
    const user = userEvent.setup()
    await startProgram('switch')
    await kvSet('programCrew:switch', 'c1')
    at('/programmas/switch')
    await screen.findByRole('group', { name: 'Daan: 1 van 4' })
    await user.click(screen.getByRole('button', { name: 'Dag gedaan' }))
    await waitFor(() => expect(screen.getByRole('group', { name: /Jij: 1 van 4/ })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: /Weer beginner/ }))
    await user.click(screen.getByRole('button', { name: 'Toch nog niet' }))
    await waitFor(() => expect(fake().calls.some((c) => c.op === 'delete' && c.table === 'crew_program_days')).toBe(true))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Jij: 0 van 4' })).toBeTruthy())
  })

  it('stoppen met delen', async () => {
    const user = userEvent.setup()
    await kvSet('programCrew:switch', 'c1')
    at('/programmas/switch')
    await user.click(await screen.findByRole('button', { name: 'Niet meer delen met Shred' }))
    expect(await screen.findByRole('button', { name: 'Volg met Shred' })).toBeTruthy()
    expect(await sharedCrew('switch')).toBeNull()
  })

  it('geen crew, of een programma van de coach: geen blok', async () => {
    await kvSet('crews', [])
    crew.myCrews.mockResolvedValue([])
    at('/programmas/switch')
    expect((await screen.findAllByText('Switch leren')).length).toBeGreaterThan(0)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Samen met je crew')).toBeNull()
  })
})
