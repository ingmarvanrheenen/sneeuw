import { beforeEach, describe, expect, it } from 'vitest'
import { db, kvSet } from '../lib/db'
import { create, getTrickProgress, listKind } from '../lib/repo'
import { EMPTY_DRAFT, saveSession, smartDraft } from '../lib/sessions'

const day = (date: string, resortName: string, hours = 3) =>
  create('session', {
    ...EMPTY_DRAFT,
    date,
    resortName,
    hours,
    pistes: [],
    practiced: [],
    landed: [],
    pains: [],
    buddies: [],
    mediaIds: [],
  })

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
})

describe('snel loggen', () => {
  it('neemt de plek en uren van je vorige dag over als die recent was', async () => {
    await day('2027-01-10', 'Tignes', 5)
    const d = await smartDraft('2027-01-12')
    expect(d.resortName).toBe('Tignes')
    expect(d.hours).toBe(5)
  })

  it('laat de plek leeg als je vorige dag lang geleden was', async () => {
    await day('2026-03-01', 'SnowWorld Zoetermeer')
    expect((await smartDraft('2027-01-12')).resortName).toBe('')
  })

  it('pakt de plek van je lopende trip', async () => {
    await day('2027-01-10', 'SnowWorld Zoetermeer')
    const trip = await create('trip', {
      name: 'Wintersport',
      resortId: 'val-thorens',
      resortName: 'Val Thorens',
      startDate: '2027-01-16',
      endDate: '2027-01-23',
      packing: [],
    })
    const d = await smartDraft('2027-01-18')
    expect(d.resortName).toBe('Val Thorens')
    expect(d.tripId).toBe(trip.id)
  })

  it('deelt alleen met je laatste crew als je daar nog in zit', async () => {
    await kvSet('crews', [{ id: 'c1', name: 'Shredheads', invite_code: 'ABC123', created_by: 'u' }])
    await kvSet('lastCrewId', 'c1')
    expect((await smartDraft()).crewId).toBe('c1')
    await kvSet('lastCrewId', 'weg')
    expect((await smartDraft()).crewId).toBeNull()
  })

  it('opslaan zet gelande tricks in je kluis en onthoudt de crew-keuze', async () => {
    const draft = { ...(await smartDraft('2027-01-18')), landed: ['ollie'], crewId: null }
    await saveSession({ id: 's1', draft })
    expect(await listKind('session')).toHaveLength(1)
    expect((await getTrickProgress('ollie'))?.status).toBe('geland')
    expect((await db.kv.get('lastCrewId'))?.value).toBeNull()
  })
})
