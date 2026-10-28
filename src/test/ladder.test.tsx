import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const crew = vi.hoisted(() => ({ myCrews: vi.fn(), crewMembers: vi.fn() }))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), ...crew }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))
vi.mock('../lib/ids', async (orig) => ({ ...(await orig<typeof import('../lib/ids')>()), todayISO: () => '2027-01-16' }))

import { cachedPodiums, currentSeason, ladder, loadPodiums, podiums, previousSeason } from '../lib/ladder'
import { seasonXPs } from '../lib/rider'
import { seasonOf } from '../lib/format'
import { seasonFor } from '../lib/rider'
import { CrewLadder } from '../components/Ladder'
import { db } from '../lib/db'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { CrewMember } from '../lib/crew'
import type { Goal, Session, TrickProgress } from '../lib/types'

const m = (user_id: string, display_name: string, stats: Partial<CrewMember['stats']>): CrewMember => ({
  user_id,
  display_name,
  role: 'member',
  stats,
})
const MEMBERS = [
  m('me', 'Ingmar', { xp: 900, seasonXP: { '26/27': 300, '25/26': 600 } }),
  m('daan', 'Daan', { xp: 800, seasonXP: { '26/27': 500, '25/26': 300 } }),
  m('sem', 'Sem', { xp: 50, seasonXP: { '25/26': 300 } }),
]

beforeEach(async () => {
  await db.kv.clear()
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
})
afterEach(() => cleanup())

describe('seizoenen', () => {
  it('één definitie voor de hele app: juli t/m juni, ook de skipas', () => {
    for (let mth = 1; mth <= 12; mth++) {
      const d = `2026-${String(mth).padStart(2, '0')}-15`
      expect(seasonOf(d), d).toBe(seasonFor(new Date(`${d}T12:00:00`)).label)
    }
    expect(seasonOf('2026-07-01')).toBe('26/27')
    expect(seasonOf('2026-06-30')).toBe('25/26')
  })

  it('huidig en vorig seizoen, ook over de eeuw heen', () => {
    expect(currentSeason('2027-01-16')).toBe('26/27')
    expect(previousSeason('26/27')).toBe('25/26')
    expect(previousSeason('00/01')).toBe('99/00')
  })

  it('XP per seizoen: dagen, eerste keer geland en doelen, elk in het seizoen van hun datum', () => {
    const day = (date: string, hours: number) => ({ ...EMPTY_DRAFT, date, hours, kind: 'session' }) as Session
    const xp = seasonXPs({
      sessions: [day('2026-12-20', 5), day('2027-03-01', 2), day('2025-12-20', 1)],
      tricks: [
        { trickId: 'ollie', status: 'geland', firstLandedAt: '2027-01-02', mediaIds: [] } as unknown as TrickProgress,
        { trickId: 'nollie', status: 'bezig', firstLandedAt: undefined, mediaIds: [] } as unknown as TrickProgress,
      ],
      goals: [{ done: true, doneAt: Date.parse('2026-01-10T12:00:00Z') } as Goal, { done: false } as Goal],
    })
    // 26/27: dag 5u (50 + 50) + dag 2u (50 + 20) + ollie; 25/26: dag 1u (50 + 10) + doel 30
    expect(Object.keys(xp).sort()).toEqual(['25/26', '26/27'])
    expect(xp['25/26']).toBe(90)
    expect(xp['26/27']).toBeGreaterThan(170)
  })

  it('houdt alleen de laatste vier seizoenen', () => {
    const day = (date: string) => ({ ...EMPTY_DRAFT, date, hours: 1, kind: 'session' }) as Session
    const xp = seasonXPs({
      sessions: ['2020-12-01', '2021-12-01', '2022-12-01', '2023-12-01', '2024-12-01'].map(day),
      tricks: [],
      goals: [],
    })
    expect(Object.keys(xp).sort()).toEqual(['21/22', '22/23', '23/24', '24/25'])
  })
})

describe('ladder', () => {
  it('per seizoen; zonder XP sta je er in dat seizoen niet in; gelijke XP = gedeelde plek', () => {
    expect(ladder(MEMBERS, '26/27').map((r) => [r.name, r.xp, r.rank])).toEqual([
      ['Daan', 500, 1],
      ['Ingmar', 300, 2],
    ])
    expect(ladder(MEMBERS, '25/26').map((r) => [r.name, r.rank])).toEqual([
      ['Ingmar', 1],
      ['Daan', 2],
      ['Sem', 2],
    ])
    expect(ladder(MEMBERS, 'altijd').map((r) => r.name)).toEqual(['Ingmar', 'Daan', 'Sem'])
  })

  it('podium: alleen top 3 en pas vanaf twee man', () => {
    const crews = [
      { id: 'c1', name: 'Shredheads', members: MEMBERS },
      { id: 'c2', name: 'Solo', members: [MEMBERS[2]] },
    ]
    expect(podiums('sem', crews, '25/26')).toEqual([{ crewId: 'c1', crewName: 'Shredheads', season: '25/26', rank: 2, of: 3 }])
    expect(podiums('me', crews, '25/26')[0].rank).toBe(1)
    expect(podiums('sem', crews, '26/27')).toEqual([])
  })

  it('podiums laden uit je crews (alleen waar deze rider in zit) en lokaal bewaren', async () => {
    crew.myCrews.mockResolvedValue([
      { id: 'c1', name: 'Shredheads' },
      { id: 'c2', name: 'Anderen' },
    ])
    crew.crewMembers.mockImplementation(async (id: string) =>
      id === 'c1' ? MEMBERS : [m('x', 'X', { seasonXP: { '25/26': 999 } }), m('y', 'Y', {})],
    )
    const list = await loadPodiums('me')
    expect(list).toEqual([{ crewId: 'c1', crewName: 'Shredheads', season: '25/26', rank: 1, of: 3 }])
    expect(await cachedPodiums('me')).toEqual(list)
  })
})

describe('leaderboard op de crew-pagina', () => {
  const show = (members: CrewMember[]) =>
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<CrewLadder members={members} riders={{}} me="me" />} />
        </Routes>
      </MemoryRouter>,
    )

  it('opent op dit seizoen; vorig seizoen en altijd te kiezen', async () => {
    const user = userEvent.setup()
    show(MEMBERS)
    const list = () => screen.getByRole('list')
    expect(
      within(list())
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([expect.stringMatching(/^1.*Daan.*500/), expect.stringMatching(/^2.*Ingmar.*300/)])
    await user.click(screen.getByRole('button', { name: 'Vorig seizoen (25/26)' }))
    expect(within(list()).getAllByRole('link')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Altijd' }))
    expect(within(list()).getAllByRole('link')[0].textContent).toMatch(/Ingmar.*900/)
  })

  it('nog niemand met seizoens-XP (oude app-versie): eerst het totaal', () => {
    show([m('daan', 'Daan', { xp: 300 }), m('me', 'Ingmar', { xp: 100 })])
    expect(screen.getByRole('button', { name: 'Altijd' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('list')).getAllByRole('link')).toHaveLength(2)
  })
})
