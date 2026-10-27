import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: { user: { id: string } } | null) => Promise<void>),
  scheduleSync: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  hasBackend: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (fn: typeof h.listener) => {
        h.listener = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
    },
  },
}))
vi.mock('../lib/sync', () => ({ scheduleSync: h.scheduleSync }))

import { authStore, initAuth } from '../lib/auth'
import { getCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { create } from '../lib/repo'

beforeEach(async () => {
  await db.records.clear()
  h.scheduleSync.mockReset()
  await initAuth()
})

describe('inloggen', () => {
  it('start meteen een sync, zodat je data er op een nieuw toestel direct is', async () => {
    await h.listener!('SIGNED_IN', { user: { id: 'u1' } })
    expect(getCurrentUserId()).toBe('u1')
    expect(authStore.get().user?.id).toBe('u1')
    expect(h.scheduleSync).toHaveBeenCalledOnce()
  })

  it('geen extra sync bij een token-verversing van dezelfde gebruiker', async () => {
    await h.listener!('SIGNED_IN', { user: { id: 'u1' } })
    await h.listener!('TOKEN_REFRESHED', { user: { id: 'u1' } })
    expect(h.scheduleSync).toHaveBeenCalledOnce()
  })

  it('wat je zonder account logde, wordt van jou', async () => {
    await h.listener!('SIGNED_OUT', null)
    const r = await create('goal', { title: 'Ollie leren', done: false })
    expect(r.userId).toBeNull()
    await h.listener!('SIGNED_IN', { user: { id: 'u2' } })
    expect((await db.records.get(r.id))?.userId).toBe('u2')
  })
})
