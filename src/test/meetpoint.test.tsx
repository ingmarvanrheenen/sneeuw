// Verzamelpunt: richting en afstand, oud of vers, de link naar Kaarten, en het blok bij je crew (zetten op je
// plek, hoe ver, weghalen). Server en locatie nagedaan; de database-regels staan in supabase/tests/crew_meetpoints.sh.
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

import { CrewMeetPoint } from '../components/CrewMeetPoint'
import { bearing, compass, isCurrent, mapsHref, setMeetPoint, wayTo, type MeetPoint } from '../lib/meetpoint'
import { db } from '../lib/db'

const fake = () => sb.ref!
const LIFT = { lat: 45.45, lon: 6.98 }
const north = (m: number) => ({ lat: LIFT.lat + m / 111_195, lon: LIFT.lon })

describe('richting en afstand', () => {
  it('windrichting in acht stukken', () => {
    expect(compass(bearing(LIFT, north(500)))).toBe('noorden')
    expect(compass(bearing(LIFT, { lat: LIFT.lat, lon: LIFT.lon + 0.01 }))).toBe('oosten')
    expect(compass(bearing(LIFT, { lat: LIFT.lat - 0.01, lon: LIFT.lon - 0.01 }))).toBe('zuidwesten')
  })

  it('hoe ver: in meters op tien, in kilometers met een komma, en dichtbij: je bent er', () => {
    expect(wayTo(north(-450), LIFT)).toBe('450 m naar het noorden')
    expect(wayTo(north(-2300), LIFT)).toBe('2,3 km naar het noorden')
    expect(wayTo(north(-20), LIFT)).toBe('Je bent er')
  })

  it('een pin van meer dan 12 uur oud telt niet meer; de link naar Kaarten', () => {
    const now = Date.parse('2027-01-17T12:00:00Z')
    expect(isCurrent({ updated_at: '2027-01-17T08:00:00Z' }, now)).toBe(true)
    expect(isCurrent({ updated_at: '2027-01-16T20:00:00Z' }, now)).toBe(false)
    expect(mapsHref({ ...LIFT, label: 'Bovenaan de lift' })).toBe('https://maps.apple.com/?ll=45.450000,6.980000&q=Bovenaan%20de%20lift')
  })

  it('zetten: opgeschoond label, per crew één (upsert); leeg mag niet', async () => {
    fake().calls.length = 0
    await setMeetPoint('c1', 'me', { ...LIFT, label: '  Lunch ' })
    expect(fake().calls.at(-1)).toMatchObject({
      table: 'crew_meetpoints',
      op: 'upsert',
      payload: { crew_id: 'c1', label: 'Lunch', set_by: 'me', meet_at: null },
    })
    await expect(setMeetPoint('c1', 'me', { ...LIFT, label: '  ' })).rejects.toThrow(/Waar/)
  })
})

describe('verzamelpunt bij je crew', () => {
  let point: MeetPoint | null = null
  let here = north(-450)
  beforeEach(async () => {
    await db.kv.clear()
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    point = null
    here = north(-450)
    fake().calls.length = 0
    fake().respond((c) => {
      if (c.table !== 'crew_meetpoints') return { data: null }
      if (c.op === 'select') return { data: point }
      if (c.op === 'upsert') {
        const p = c.payload as MeetPoint
        point = { ...p, updated_at: new Date().toISOString() }
      }
      if (c.op === 'delete') point = null
      return { data: null }
    })
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: here.lat, longitude: here.lon } }),
      },
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })
  const members = [
    { user_id: 'me', display_name: 'Ingmar', role: 'member', stats: {} },
    { user_id: 'daan', display_name: 'Daan', role: 'member', stats: {} },
  ] as never[]
  const show = () => render(<CrewMeetPoint crewId="c1" members={members} me="me" />)

  it('zetten op je plek, met een label en een tijd', async () => {
    const user = userEvent.setup()
    here = LIFT
    show()
    await user.click(await screen.findByRole('button', { name: 'Zet een verzamelpunt' }))
    const sheet = screen.getByRole('dialog', { name: 'Verzamelpunt' })
    await user.click(within(sheet).getByRole('button', { name: 'Bovenaan de lift' }))
    await user.type(within(sheet).getByLabelText('Hoe laat'), '12:30')
    await user.click(within(sheet).getByRole('button', { name: 'Zet hier, op mijn plek' }))
    const card = await screen.findByRole('group', { name: 'Verzamelpunt' })
    expect(within(card).getByText('Bovenaan de lift')).toBeTruthy()
    expect(within(card).getByText('Om 12:30')).toBeTruthy()
    expect(within(card).getByText(/Gezet door jou/)).toBeTruthy()
    expect(within(card).getByText('Je bent er')).toBeTruthy()
    const up = fake().calls.find((c) => c.op === 'upsert')!.payload as MeetPoint
    expect([up.lat, up.lon]).toEqual([LIFT.lat, LIFT.lon])
  })

  it('pin van een crewgenoot: hoe ver vanaf waar jij staat, en weghalen', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', () => true)
    point = { crew_id: 'c1', ...LIFT, label: 'Lunch', meet_at: null, set_by: 'daan', updated_at: new Date().toISOString() }
    show()
    const card = await screen.findByRole('group', { name: 'Verzamelpunt' })
    expect(within(card).getByText(/Gezet door Daan/)).toBeTruthy()
    expect(
      within(card)
        .getByRole('link', { name: /Open in Kaarten/ })
        .getAttribute('href'),
    ).toContain('maps.apple.com')
    await user.click(within(card).getByRole('button', { name: 'Hoe ver is het?' }))
    expect(await within(card).findByText('450 m naar het noorden')).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: 'Weg' }))
    expect(await screen.findByRole('button', { name: 'Zet een verzamelpunt' })).toBeTruthy()
  })

  it('een oude pin (van gisteren) wordt niet getoond', async () => {
    point = {
      crew_id: 'c1',
      ...LIFT,
      label: 'Lunch',
      meet_at: null,
      set_by: 'daan',
      updated_at: new Date(Date.now() - 13 * 3600_000).toISOString(),
    }
    show()
    expect(await screen.findByRole('button', { name: 'Zet een verzamelpunt' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Verzamelpunt' })).toBeNull())
  })

  it('geen locatie: uitleg', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, err: (e: { code: number }) => void) => err({ code: 1 }) },
    })
    show()
    await user.click(await screen.findByRole('button', { name: 'Zet een verzamelpunt' }))
    await user.click(screen.getByRole('button', { name: 'Zet hier, op mijn plek' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Geen toegang tot je locatie/)
  })
})
