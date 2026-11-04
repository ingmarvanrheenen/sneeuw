// Trick van de week: dezelfde trick voor de hele crew per week, de clips van die week, de stand, en stemmen in de
// crew-feed (niet op je eigen clip, stand pas na je eigen stem). Server nagedaan; de database-regels staan in
// supabase/tests/crew_week_votes.sh.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { fakeSupabase } from './fakeSupabase'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true, backendInfo: {} }
})

import { CrewWeekTrick } from '../components/CrewWeekTrick'
import { entriesOf, tally, voteWeek, weekTrick, WEEK_TRICKS, type WeekVote } from '../lib/weekTrick'
import { weekOf } from '../lib/crewGoal'
import { todayISO } from '../lib/ids'
import { db } from '../lib/db'
import type { MediaMeta } from '../lib/types'

const fake = () => sb.ref!
const clip = (id: string, over: Partial<MediaMeta> = {}) =>
  ({ id, kind: 'media', type: 'video', mime: 'video/mp4', createdAt: Date.now(), updatedAt: 0, userId: 'daan', ...over }) as MediaMeta

describe('welke trick, welke clips, de stand', () => {
  it('per crew en week altijd dezelfde, uit de tricks die je op een gewone dag filmt', () => {
    const a = weekTrick('c1', '2027-01-11')
    expect(weekTrick('c1', '2027-01-11').id).toBe(a.id)
    expect(WEEK_TRICKS).toContainEqual(a)
    const many = new Set(Array.from({ length: 30 }, (_, i) => weekTrick('c1', `2027-${String(i + 1).padStart(2, '0')}-01`).id))
    expect(many.size).toBeGreaterThan(5)
    expect(WEEK_TRICKS.every((t) => t.track !== 'basis' && t.track !== 'lift')).toBe(true)
  })

  it('clips: bij de trick, uit deze week, geen memo of trip-film', () => {
    const week = { from: '2027-01-11', to: '2027-01-17' }
    const at = (d: string) => new Date(`${d}T12:00:00`).getTime()
    const list = [
      clip('goed', { trickId: 'ollie', createdAt: at('2027-01-12') }),
      clip('vorige-week', { trickId: 'ollie', createdAt: at('2027-01-08') }),
      clip('andere-trick', { trickId: 'nollie', createdAt: at('2027-01-12') }),
      clip('memo', { trickId: 'ollie', type: 'audio', createdAt: at('2027-01-12') }),
      clip('nieuwer', { trickId: 'ollie', createdAt: at('2027-01-16'), userId: 'noor' }),
    ]
    expect(entriesOf(list, 'ollie', week).map((e) => [e.media.id, e.userId])).toEqual([
      ['nieuwer', 'noor'],
      ['goed', 'daan'],
    ])
  })

  it('stand: stemmen per clip en wie bovenaan staat (samen bij gelijkspel)', () => {
    const v: WeekVote[] = [
      { voter: 'a', media_id: 'm1' },
      { voter: 'b', media_id: 'm2' },
      { voter: 'c', media_id: 'm1' },
    ]
    expect(tally(v)).toEqual({ counts: { m1: 2, m2: 1 }, leaders: ['m1'], total: 3 })
    expect(tally([...v, { voter: 'd', media_id: 'm2' }]).leaders.sort()).toEqual(['m1', 'm2'])
    expect(tally([]).leaders).toEqual([])
  })

  it('stemmen: nieuw, veranderen, en nog een keer = intrekken', async () => {
    fake().calls.length = 0
    await voteWeek('c1', '2027-01-11', 'm1', undefined)
    expect(fake().calls.at(-1)).toMatchObject({ op: 'insert', payload: { crew_id: 'c1', week: '2027-01-11', media_id: 'm1' } })
    await voteWeek('c1', '2027-01-11', 'm2', { voter: 'me', media_id: 'm1' })
    expect(fake().calls.at(-1)).toMatchObject({ op: 'update', payload: { media_id: 'm2' } })
    await voteWeek('c1', '2027-01-11', 'm2', { voter: 'me', media_id: 'm2' })
    expect(fake().calls.at(-1)!.op).toBe('delete')
  })
})

describe('in de crew-feed', () => {
  let votes: WeekVote[] = []
  const trick = () => weekTrick('c1', weekOf(todayISO()).key)
  const members = [
    { user_id: 'me', display_name: 'Ingmar', role: 'member', stats: {} },
    { user_id: 'daan', display_name: 'Daan', role: 'member', stats: {} },
    { user_id: 'noor', display_name: 'Noor', role: 'member', stats: {} },
  ] as never[]
  beforeEach(async () => {
    await db.kv.clear()
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    votes = [{ voter: 'noor', media_id: 'daan1' }]
    fake().calls.length = 0
    fake().respond((c) => {
      if (c.table !== 'crew_week_votes') return { data: null }
      if (c.op === 'select') return { data: votes }
      if (c.op === 'insert') votes = [...votes, { voter: 'me', media_id: (c.payload as WeekVote).media_id }]
      if (c.op === 'delete') votes = votes.filter((v) => v.voter !== 'me')
      return { data: null }
    })
  })
  afterEach(() => cleanup())
  const show = (media: MediaMeta[]) =>
    render(
      <MemoryRouter>
        <CrewWeekTrick crewId="c1" members={members} media={media} me="me" />
      </MemoryRouter>,
    )

  it('de trick met link, de clips, je eigen clip kun je niet stemmen, en de stand na je stem', async () => {
    const user = userEvent.setup()
    show([clip('daan1', { trickId: trick().id }), clip('mijn1', { trickId: trick().id, userId: 'me' })])
    const box = screen.getByRole('region', { name: 'Trick van de week' })
    expect(
      within(box)
        .getByRole('link', { name: new RegExp(trick().name) })
        .getAttribute('href'),
    ).toBe(`/tricks/${trick().id}`)
    expect(within(box).getByText(/2 clips/)).toBeTruthy()
    expect((within(box).getByRole('button', { name: 'Je eigen clip' }) as HTMLButtonElement).disabled).toBe(true)
    // nog niet gestemd: geen stand
    expect(within(box).queryByText(/· 1/)).toBeNull()
    await user.click(within(box).getByRole('button', { name: 'Stem op Daan' }))
    await waitFor(() => expect(within(box).getByRole('button', { name: 'Stem op Daan intrekken' })).toBeTruthy())
    expect(within(box).getByText(/2 stemmen tot nu toe/)).toBeTruthy()
    expect(within(box).getByText('· 2')).toBeTruthy()
    await user.click(within(box).getByRole('button', { name: 'Stem op Daan intrekken' }))
    await waitFor(() => expect(within(box).getByRole('button', { name: 'Stem op Daan' })).toBeTruthy())
  })

  it('nog geen clips: uitleg hoe je meedoet', async () => {
    show([])
    expect(screen.getByText('nog geen clips', { exact: false })).toBeTruthy()
    expect(screen.getByText(/Film hem, koppel de clip aan de trick/)).toBeTruthy()
  })
})
