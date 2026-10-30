// Waar is de crew: status zetten, weghalen, en wat je van je crew ziet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeSupabase } from './fakeSupabase'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true, backendInfo: {} }
})

import { CrewWhere } from '../components/CrewWhere'
import { ago, crewStatuses, isFresh, setCrewStatus } from '../lib/crewStatus'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { toastStore } from '../lib/toast'
import type { CrewMember } from '../lib/crew'

const fake = () => sb.ref!
const NOW = Date.parse('2027-01-14T12:00:00Z')
const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()
const members = [
  { user_id: 'me', display_name: 'Ingmar' },
  { user_id: 'daan', display_name: 'Daan' },
  { user_id: 'sem', display_name: 'Sem' },
] as CrewMember[]

beforeEach(async () => {
  await db.kv.clear()
  setCurrentUserId('me')
  toastStore.set([])
  fake().calls.length = 0
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
})
afterEach(() => cleanup())

describe('status-tijd', () => {
  it('"net", minuten en uren; ouder dan 12 uur telt niet meer', () => {
    expect(ago(new Date(NOW - 30_000).toISOString(), NOW)).toBe('net')
    expect(ago(new Date(NOW - 12 * 60_000).toISOString(), NOW)).toBe('12 min geleden')
    expect(ago(new Date(NOW - 150 * 60_000).toISOString(), NOW)).toBe('3 uur geleden')
    expect(isFresh({ user_id: 'x', status: 'lift', updated_at: new Date(NOW - 11 * 3600_000).toISOString() }, NOW)).toBe(true)
    expect(isFresh({ user_id: 'x', status: 'lift', updated_at: new Date(NOW - 13 * 3600_000).toISOString() }, NOW)).toBe(false)
  })

  it('lijst van de server: alleen verse statussen; zetten gaat via de functie', async () => {
    fake().respond(() => ({
      data: [
        { user_id: 'daan', status: 'lift', updated_at: at(5) },
        { user_id: 'sem', status: 'park', updated_at: at(60 * 20) },
      ],
    }))
    expect((await crewStatuses()).map((s) => s.user_id)).toEqual(['daan'])
    fake().respond(() => ({ data: { user_id: 'me', status: 'pauze', updated_at: at(0) } }))
    await setCrewStatus('pauze')
    expect(fake().calls.at(-1)).toMatchObject({ op: 'rpc', table: 'set_crew_status', payload: { p_status: 'pauze' } })
  })
})

describe('waar is de crew', () => {
  it('toont crewgenoten met een status (nieuwste eerst); wie niet in deze crew zit niet', async () => {
    fake().respond(() => ({
      data: [
        { user_id: 'daan', status: 'lift', updated_at: at(5) },
        { user_id: 'sem', status: 'pauze', updated_at: at(1) },
        { user_id: 'vreemd', status: 'park', updated_at: at(1) },
      ],
    }))
    render(<CrewWhere members={members} me="me" />)
    await screen.findByText('Sem')
    const list = screen.getByText('Sem').closest('.card') as HTMLElement
    expect(
      within(list)
        .getAllByText(/Sem|Daan/)
        .map((e) => e.textContent),
    ).toEqual(['Sem', 'Daan'])
    expect(within(list).getByText('Pauze')).toBeTruthy()
    expect(within(list).getByText('5 min geleden')).toBeTruthy()
    expect(screen.queryByText('vreemd')).toBeNull()
  })

  it('status kiezen zet hem; nog een keer tikken haalt hem weg', async () => {
    const user = userEvent.setup()
    let mine: object[] = []
    fake().respond((c) => {
      if (c.op === 'rpc') return ((mine = [{ user_id: 'me', status: 'lift', updated_at: at(0) }]), { data: mine[0] })
      if (c.op === 'delete') return ((mine = []), { data: null })
      return { data: mine }
    })
    render(<CrewWhere members={members} me="me" />)
    const group = await screen.findByRole('group', { name: 'Jouw status' })
    await user.click(within(group).getByRole('button', { name: /In de lift/ }))
    await waitFor(() =>
      expect(
        within(group)
          .getByRole('button', { name: /In de lift/ })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    )
    expect(fake().calls.some((c) => c.op === 'rpc' && c.table === 'set_crew_status')).toBe(true)
    await user.click(within(group).getByRole('button', { name: /In de lift/ }))
    await waitFor(() =>
      expect(
        within(group)
          .getByRole('button', { name: /In de lift/ })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    )
    expect(fake().calls.some((c) => c.op === 'delete' && c.table === 'crew_status')).toBe(true)
  })

  it('lukt het niet: terug naar hoe het was, met een melding', async () => {
    const user = userEvent.setup()
    fake().respond((c) => (c.op === 'rpc' ? { error: { message: 'stuk' } } : { data: [] }))
    render(<CrewWhere members={members} me="me" />)
    const group = await screen.findByRole('group', { name: 'Jouw status' })
    await user.click(within(group).getByRole('button', { name: /Pauze/ }))
    await waitFor(() => expect(toastStore.get().map((t) => t.title)).toContain('Status zetten lukt niet'))
    expect(within(group).getByRole('button', { name: /Pauze/ }).getAttribute('aria-pressed')).toBe('false')
  })
})
