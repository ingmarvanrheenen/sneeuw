import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({ crewChallenges: vi.fn(), flushChallenges: vi.fn(), riderProfiles: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))
vi.mock('../lib/challenges', async (orig) => ({
  ...(await orig<typeof import('../lib/challenges')>()),
  crewChallenges: api.crewChallenges,
  flushChallenges: api.flushChallenges,
}))
vi.mock('../lib/riders', async (orig) => ({ ...(await orig<typeof import('../lib/riders')>()), riderProfiles: api.riderProfiles }))
const TODAY = '2027-01-16'
vi.mock('../lib/ids', async (orig) => ({ ...(await orig<typeof import('../lib/ids')>()), todayISO: () => TODAY }))

import { DailyChallenge } from '../components/DailyChallenge'
import { CHALLENGE_BY_ID, loadChallenges } from '../lib/challenges'
import { authStore } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { setTrickStatus } from '../lib/repo'
import { totalXP, unlockedBadges, type ProgressInput } from '../lib/progress'
import { toastStore } from '../lib/toast'
import type { User } from '@supabase/supabase-js'

const show = () =>
  render(
    <MemoryRouter>
      <DailyChallenge />
    </MemoryRouter>,
  )
const current = async () => CHALLENGE_BY_ID.get((await loadChallenges())[TODAY].id)!

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  setCurrentUserId('me')
  authStore.set({ user: { id: 'me' } as User, ready: true })
  toastStore.set([])
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  api.crewChallenges.mockResolvedValue([])
  api.flushChallenges.mockResolvedValue(undefined)
  api.riderProfiles.mockResolvedValue({})
})
afterEach(() => cleanup())

describe('dagopdracht op Home', () => {
  it('toont de opdracht van vandaag; gedaan geeft een viering en "Toch niet" zet hem terug', async () => {
    const user = userEvent.setup()
    show()
    await waitFor(async () => expect((await loadChallenges())[TODAY]).toBeTruthy())
    const c = await current()
    expect(await screen.findByText(c.text)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Gedaan' }))
    expect(await screen.findByText(/Gedaan · \+15 XP/)).toBeTruthy()
    expect(toastStore.get().map((t) => t.title)).toContain('Dagopdracht gedaan')
    // andere opdracht kan niet meer als je hem gedaan hebt
    expect(screen.queryByRole('button', { name: 'Andere opdracht' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Toch niet' }))
    expect(await screen.findByRole('button', { name: 'Gedaan' })).toBeTruthy()
  })

  it('andere opdracht: één keer per dag', async () => {
    const user = userEvent.setup()
    show()
    await waitFor(async () => expect((await loadChallenges())[TODAY]).toBeTruthy())
    const first = await current()
    await user.click(await screen.findByRole('button', { name: 'Andere opdracht' }))
    await waitFor(async () => expect((await current()).id).not.toBe(first.id))
    expect(await screen.findByText((await current()).text)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Andere opdracht' })).toBeNull()
  })

  it('kiest pas als je tricks geladen zijn: met een ollie kan het een ollie-opdracht worden', async () => {
    for (const t of ['rechtuit', 'heelside-stop', 'gekoppelde-bochten', 'switch', 'ollie']) await setTrickStatus(t, 'geland')
    show()
    await waitFor(async () => expect((await loadChallenges())[TODAY]).toBeTruthy())
    const c = await current()
    // het niveau past bij wie al ollies landt, niet bij een beginner
    expect(c.level).toBeGreaterThanOrEqual(2)
    expect(await screen.findByText(c.text)).toBeTruthy()
  })

  it('crew: wie vandaag ook een opdracht deed, met welke', async () => {
    api.crewChallenges.mockResolvedValue([{ user_id: 'daan', challenge: 'tien-bochten' }])
    api.riderProfiles.mockResolvedValue({ daan: { userId: 'daan', name: 'Daan', profile: {}, stats: {} } })
    show()
    const row = await screen.findByRole('link', { name: /Daan: gedaan/ })
    expect(row.textContent).toContain(CHALLENGE_BY_ID.get('tien-bochten')!.text)
    expect(row.getAttribute('href')).toBe('/rider/daan')
  })
})

describe('xp en badge', () => {
  const base: ProgressInput = {
    sessions: [],
    tricks: [],
    goals: [],
    media: [],
    gear: [],
    trips: [],
    quizBest: 0,
    quizCorrect: 0,
    inCrew: false,
  }
  it('15 XP per opdracht, badge bij 10', () => {
    expect(totalXP({ ...base, challengesDone: 2 }) - totalXP(base)).toBe(30)
    expect(unlockedBadges({ ...base, challengesDone: 9 }).some((b) => b.id === 'dagopdracht-10')).toBe(false)
    expect(unlockedBadges({ ...base, challengesDone: 10 }).some((b) => b.id === 'dagopdracht-10')).toBe(true)
  })
})
