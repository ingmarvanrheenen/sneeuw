import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

vi.mock('../lib/ids', async (orig) => ({ ...(await orig<typeof import('../lib/ids')>()), todayISO: () => '2027-01-14' }))

import { CrewWeekGoal } from '../components/CrewWeekGoal'
import { crewGoal } from '../lib/crewGoal'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { CrewMember, FeedPost } from '../lib/crew'
import type { Session } from '../lib/types'

afterEach(() => cleanup())

const members = (['me', 'daan', 'sem'] as const).map((id) => ({
  user_id: id,
  display_name: id === 'me' ? 'Ingmar' : id[0].toUpperCase() + id.slice(1),
  role: 'member',
  stats: {},
})) as CrewMember[]
const post = (userId: string, date: string, over: Partial<Session> = {}): FeedPost => ({
  id: userId + date,
  userId,
  at: date,
  media: [],
  session: {
    ...EMPTY_DRAFT,
    id: userId + date,
    kind: 'session',
    createdAt: 0,
    updatedAt: 0,
    date,
    hours: 4,
    landed: ['ollie', 'shifty'],
    pistes: ['rood'],
    ...over,
  } as Session,
})
// een crew-id waarvan het doel van deze week op uren valt, en een op "iedereen"
const crewFor = (kind: string) =>
  Array.from({ length: 200 }, (_, i) => `crew-${i}`).find((id) => crewGoal(id, '2027-01-11', 3).kind === kind)!

describe('crew-doel van de week', () => {
  it('poster met het doel, de week, de stand en wie wat bijdroeg', () => {
    const id = crewFor('uren')
    render(
      <CrewWeekGoal
        crewId={id}
        members={members}
        posts={[post('daan', '2027-01-12', { hours: 5.5 }), post('me', '2027-01-13'), post('sem', '2027-01-02', { hours: 9 })]}
        me="me"
      />,
    )
    const goal = screen.getByRole('region', { name: 'Crew-doel van de week' })
    expect(within(goal).getByRole('heading').textContent).toBe('Samen 12 uur op de plank')
    expect(within(goal).getByText(/11 jan – 17 jan · nog 3 dagen/)).toBeTruthy()
    expect(within(goal).getByText('9,5 / 12')).toBeTruthy()
    expect(within(goal).getByText('Daan 5,5 · Jij 4')).toBeTruthy()
    expect(within(goal).queryByText('Gehaald')).toBeNull()
  })

  it('gehaald: stempel erop', () => {
    const id = crewFor('iedereen')
    render(<CrewWeekGoal crewId={id} members={members} posts={['me', 'daan', 'sem'].map((u) => post(u, '2027-01-12'))} me="me" />)
    expect(screen.getByText('Gehaald').className).toContain('slap')
    expect(screen.getByText('3 / 3')).toBeTruthy()
  })

  it('nog niemand deze week: uitleg hoe je hem vult', () => {
    render(<CrewWeekGoal crewId="c1" members={members} posts={[]} me="me" />)
    expect(screen.getByText(/Deel je dag met de crew/)).toBeTruthy()
  })
})
