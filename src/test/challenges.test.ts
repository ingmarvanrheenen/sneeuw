import { beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof import('./fakeSupabase').fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true }
})

import {
  challengePool,
  challengesDone,
  crewChallenges,
  flushChallenges,
  loadChallenges,
  pickChallenge,
  rerollChallenge,
  setChallengeDone,
  skillLevel,
  todayChallenge,
} from '../lib/challenges'
import { CHALLENGES } from '../content/challenges'
import { TRICK_BY_ID } from '../content/tricks'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'

const online = (on: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })
const D = '2027-01-16'

beforeEach(async () => {
  await db.kv.clear()
  sb.ref!.reset()
  setCurrentUserId('me')
  online(true)
})

describe('opdrachten', () => {
  it('content: unieke ids, tricks die bestaan, geen emoji', () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length)
    for (const c of CHALLENGES) {
      expect(c.id).toMatch(/^[a-z0-9-]{1,40}$/)
      for (const t of c.needs ?? []) expect(TRICK_BY_ID.has(t), `${c.id}: ${t}`).toBe(true)
      expect(c.text).not.toMatch(/\p{Extended_Pictographic}/u)
    }
    // voor elk niveau iets te doen
    for (const l of [1, 2, 3, 4, 5])
      expect(
        CHALLENGES.some((c) => c.level === l),
        `niveau ${l}`,
      ).toBe(true)
  })

  it('beginner: alleen opdrachten zonder tricks die je nog niet kunt', () => {
    const pool = challengePool(new Set())
    expect(pool.length).toBeGreaterThan(3)
    expect(pool.every((c) => (c.needs ?? []).length === 0 && c.level <= 2)).toBe(true)
  })

  it('je niveau is je hoogste gelande trick; opdrachten rond dat niveau en met tricks die je kunt', () => {
    const landed = new Set(['gekoppelde-bochten', 'switch', 'ollie'])
    expect(skillLevel(landed)).toBe(Math.max(...[...landed].map((t) => TRICK_BY_ID.get(t)!.level)))
    const pool = challengePool(landed)
    const lvl = skillLevel(landed)
    for (const c of pool) {
      expect(Math.abs(c.level - lvl)).toBeLessThanOrEqual(1)
      expect((c.needs ?? []).every((t) => landed.has(t))).toBe(true)
    }
    expect(pool.some((c) => c.id === 'ollie-bultje')).toBe(true)
  })

  it('zelfde dag en speler: zelfde opdracht; "andere" geeft echt een andere', () => {
    const landed = new Set<string>()
    const a = pickChallenge(D, 'me', landed)
    expect(pickChallenge(D, 'me', landed)).toEqual(a)
    expect(pickChallenge(D, 'me', landed, a.id).id).not.toBe(a.id)
  })
})

describe('je dagopdracht', () => {
  it('ligt vast zodra je hem ziet, ook als je die dag een nieuwe trick landt', async () => {
    const { today } = await todayChallenge(D, new Set())
    const again = await todayChallenge(D, new Set(['ollie', 'gekoppelde-bochten', 'switch']))
    expect(again.today.id).toBe(today.id)
  })

  it('één keer per dag een andere, en niet meer als je hem al gedaan hebt', async () => {
    const { today } = await todayChallenge(D, new Set())
    const log = await rerollChallenge(D, new Set())
    expect(log[D].id).not.toBe(today.id)
    expect(log[D].rerolled).toBe(true)
    expect((await rerollChallenge(D, new Set()))[D].id).toBe(log[D].id)
  })

  it('afvinken: lokaal en naar de server; weer uit haalt hem van de server', async () => {
    const { today } = await todayChallenge(D, new Set())
    const log = await setChallengeDone(D, true)
    expect(log[D].done).toBeTruthy()
    expect(log[D].synced).toBe(true)
    expect(sb.ref!.calls[0]).toMatchObject({ table: 'daily_challenges', op: 'insert', payload: { date: D, challenge: today.id } })
    expect(challengesDone(log)).toBe(1)
    await setChallengeDone(D, false)
    expect(sb.ref!.calls[1]).toMatchObject({ table: 'daily_challenges', op: 'delete' })
    expect(challengesDone(await loadChallenges())).toBe(0)
  })

  it('staat hij al op de server (andere telefoon): dan alleen de opdracht bijwerken, niet de datum', async () => {
    await todayChallenge(D, new Set())
    sb.ref!.respond((c) => (c.op === 'insert' ? { error: { code: '23505' } } : { data: null }))
    const log = await setChallengeDone(D, true)
    expect(log[D].synced).toBe(true)
    expect(sb.ref!.calls[1]).toMatchObject({ op: 'update', payload: { challenge: log[D].id } })
  })

  it('offline afgevinkt: later alsnog naar de server', async () => {
    await todayChallenge(D, new Set())
    online(false)
    expect((await setChallengeDone(D, true))[D].synced).toBe(false)
    expect(sb.ref!.calls).toEqual([])
    online(true)
    await flushChallenges(D)
    expect(sb.ref!.calls[0]).toMatchObject({ op: 'insert' })
    expect((await loadChallenges())[D].synced).toBe(true)
  })

  it('crew: wie vandaag ook een opdracht deed, zonder jezelf', async () => {
    sb.ref!.respond(() => ({
      data: [
        { user_id: 'me', challenge: 'x' },
        { user_id: 'daan', challenge: 'tien-bochten' },
      ],
    }))
    expect(await crewChallenges(D)).toEqual([{ user_id: 'daan', challenge: 'tien-bochten' }])
    expect(sb.ref!.calls[0].filters).toContainEqual(['eq', 'date', D])
  })
})
