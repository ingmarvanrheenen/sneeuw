import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<(typeof import('./fakeSupabase'))['fakeSupabase']> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true }
})
const sync = vi.hoisted(() => ({ scheduleSync: vi.fn() }))
vi.mock('../lib/sync', () => sync)

import {
  answerNickname,
  cachedRider,
  loadRider,
  makeAvatar,
  nicknameInbox,
  riderMedia,
  riderProfiles,
  suggestNickname,
} from '../lib/riders'
import { getProfile, saveProfile } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'

const fake = () => sb.ref!

beforeEach(async () => {
  fake().reset()
  await db.kv.clear()
  setCurrentUserId('me')
})
afterEach(() => vi.restoreAllMocks())

describe('profiel van een crewgenoot', () => {
  it('laadt naam, profiel en stats, en bewaart hem voor offline', async () => {
    fake().respond(() => ({ data: { user_id: 'daan', display_name: 'Daan', data: { motto: 'Send it' }, stats: { xp: 300 } } }))
    const r = await loadRider('daan')
    expect(r).toEqual({ userId: 'daan', name: 'Daan', profile: { motto: 'Send it' }, stats: { xp: 300 } })
    expect(fake().calls[0]).toMatchObject({ table: 'profiles', filters: [['eq', 'user_id', 'daan']] })
    expect(await cachedRider('daan')).toEqual(r)
  })

  it('niet in je crew (RLS geeft niks terug): null', async () => {
    fake().respond(() => ({ data: null }))
    expect(await loadRider('vreemd')).toBeNull()
  })

  it('profielen voor de feed in één query', async () => {
    fake().respond(() => ({ data: [{ user_id: 'daan', display_name: 'Daan', data: { photo: 'data:x' }, stats: {} }] }))
    const r = await riderProfiles(['daan', 'sem'])
    expect(r.daan.profile.photo).toBe('data:x')
    expect(fake().calls[0].filters).toEqual([['in', 'user_id', ['daan', 'sem']]])
    expect(await riderProfiles([])).toEqual({})
  })

  it('highlights: alleen wat met een crew gedeeld is', async () => {
    fake().respond(() => ({ data: [{ data: { id: 'm1', type: 'image' } }] }))
    expect(await riderMedia('daan')).toEqual([{ id: 'm1', type: 'image' }])
    expect(fake().calls[0].filters).toEqual([
      ['eq', 'user_id', 'daan'],
      ['eq', 'kind', 'media'],
      ['eq', 'deleted', false],
      ['not.is', 'crew_id', null],
    ])
  })
})

describe('bijnamen', () => {
  it('voorstellen: opgeschoond, met nette fouten', async () => {
    await suggestNickname('daan', '  Valkoning  ')
    expect(fake().calls[0]).toMatchObject({ table: 'nicknames', op: 'insert', payload: { to_user: 'daan', nickname: 'Valkoning' } })
    await expect(suggestNickname('daan', '   ')).rejects.toThrow('Typ een bijnaam')
    fake().respond(() => ({ error: { code: '23505', message: 'dup' } }))
    await expect(suggestNickname('daan', 'Valkoning')).rejects.toThrow('al voorgesteld')
    fake().respond(() => ({ error: { code: '42501', message: 'rls' } }))
    await expect(suggestNickname('daan', 'Nog een')).rejects.toThrow('max 3')
  })

  it('inbox: open voorstellen met de naam van wie het voorstelde', async () => {
    fake().respond((c) =>
      c.table === 'nicknames'
        ? { data: [{ id: 'n1', from_user: 'daan', nickname: 'Valkoning' }] }
        : { data: [{ user_id: 'daan', display_name: 'Daan', data: {}, stats: {} }] },
    )
    expect(await nicknameInbox()).toEqual([{ id: 'n1', from_user: 'daan', nickname: 'Valkoning', fromName: 'Daan' }])
    expect(fake().calls[0].filters).toEqual([
      ['eq', 'to_user', 'me'],
      ['eq', 'status', 'open'],
    ])
  })

  it('ja: wordt je bijnaam en synct mee; nee: profiel blijft zoals het was', async () => {
    await saveProfile({ ...(await getProfile()), displayName: 'Ingmar' })
    await answerNickname({ id: 'n1', nickname: 'Valkoning' }, true)
    expect(fake().calls[0]).toMatchObject({ table: 'nicknames', op: 'update', payload: { status: 'ok' }, filters: [['eq', 'id', 'n1']] })
    expect((await getProfile()).nickname).toBe('Valkoning')
    expect(sync.scheduleSync).toHaveBeenCalled()

    await answerNickname({ id: 'n2', nickname: 'Boef' }, false)
    expect(fake().calls[1].payload).toEqual({ status: 'nee' })
    expect((await getProfile()).nickname).toBe('Valkoning')
  })
})

describe('profielfoto', () => {
  it('snijdt vierkant uit het midden en maakt hem klein', async () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never)
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,abc')
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    // jsdom laadt geen plaatjes: doe alsof een 400x300 foto binnenkomt
    vi.spyOn(window, 'Image').mockImplementation(function (this: HTMLImageElement) {
      const img = document.createElement('img')
      Object.defineProperty(img, 'naturalWidth', { value: 400 })
      Object.defineProperty(img, 'naturalHeight', { value: 300 })
      queueMicrotask(() => img.onload?.(new Event('load')))
      return img
    } as never)
    expect(await makeAvatar(new Blob(['x']))).toBe('data:image/jpeg;base64,abc')
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 50, 0, 300, 300, 0, 0, 192, 192)
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8)
  })

  it('te groot bij elke kwaliteit: duidelijke fout', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('x'.repeat(70_000))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(window, 'Image').mockImplementation(function () {
      const img = document.createElement('img')
      queueMicrotask(() => img.onload?.(new Event('load')))
      return img
    } as never)
    await expect(makeAvatar(new Blob(['x']))).rejects.toThrow('te groot')
  })
})
