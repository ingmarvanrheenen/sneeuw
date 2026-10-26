import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { create, getTrickProgress, listKind, remove, setTrickStatus } from '../lib/repo'

beforeEach(async () => {
  await db.records.clear()
})

describe('lokale opslag', () => {
  it('markeert nieuwe records als nog-te-syncen', async () => {
    const g = await create('goal', { title: 'Ollie leren', done: false })
    expect(g.dirty).toBe(1)
    expect(await db.records.where('dirty').equals(1).count()).toBe(1)
  })

  it('verwijdert zacht zodat de sync het kan doorgeven', async () => {
    const g = await create('goal', { title: 'x', done: false })
    await remove(g)
    expect(await listKind('goal')).toHaveLength(0)
    expect((await db.records.get(g.id))?.deleted).toBe(true)
  })

  it('onthoudt de eerste landing van een trick', async () => {
    await setTrickStatus('ollie', 'bezig')
    expect((await getTrickProgress('ollie'))?.firstLandedAt).toBeUndefined()
    await setTrickStatus('ollie', 'geland')
    const first = (await getTrickProgress('ollie'))?.firstLandedAt
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await setTrickStatus('ollie', 'beheerst')
    expect((await getTrickProgress('ollie'))?.firstLandedAt).toBe(first)
    expect(await listKind('trick')).toHaveLength(1)
  })
})
