// Wekker voor de eerste lift: wektijd uitrekenen, de standaard per land, het agenda-item met melding, wat
// onthouden wordt (lifttijd per resort), en de pagina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import Alarm from '../pages/Alarm'
import Home from '../pages/Home'
import { alarmDate, alarmIcs, defaultLift, DEFAULT_PLAN, loadPlan, savePlan, totalMin, wakeTime } from '../lib/alarm'
import { create } from '../lib/repo'
import { db } from '../lib/db'

describe('wektijd', () => {
  it('eerste lift min reizen, klaarmaken en warming-up', () => {
    expect(wakeTime(DEFAULT_PLAN)).toBe('07:25')
    expect(totalMin(DEFAULT_PLAN)).toBe(65)
    expect(wakeTime({ ...DEFAULT_PLAN, warmup: false })).toBe('07:30')
    expect(wakeTime({ lift: '00:20', travel: 10, ready: 30, warmup: false })).toBe('23:40')
    expect(wakeTime({ ...DEFAULT_PLAN, lift: 'kwart over' })).toBeNull()
  })

  it('standaard eerste lift: Oostenrijk 8:30, Frankrijk 9:00, indoor 10:00', () => {
    expect(defaultLift({ country: 'AT' })).toBe('08:30')
    expect(defaultLift({ country: 'FR' })).toBe('09:00')
    expect(defaultLift({ country: 'NL', indoor: true })).toBe('10:00')
    expect(defaultLift()).toBe('08:30')
  })

  it('voor morgen, behalve midden in de nacht', () => {
    expect(alarmDate(new Date('2027-01-16T21:00:00'))).toBe('2027-01-17')
    expect(alarmDate(new Date('2027-01-16T02:30:00'))).toBe('2027-01-16')
    expect(alarmDate(new Date('2027-01-31T22:00:00'))).toBe('2027-02-01')
  })
})

describe('agenda-item', () => {
  it('op je wektijd, tien minuten, met een melding en uitleg', () => {
    const ics = alarmIcs('2027-01-17', DEFAULT_PLAN, 'Tignes')!
    const lines = ics.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('DTSTART:20270117T072500')
    expect(lines).toContain('DTEND:20270117T073500')
    expect(lines).toContain('SUMMARY:Opstaan: eerste lift om 08:30 in Tignes')
    expect(lines).toContain('TRIGGER:PT0M')
    expect(lines).toContain('BEGIN:VALARM')
    expect(ics).toContain('45 min ontbijt en aankleden\\, 15 min naar de lift\\, 5 min warming-up.')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('komma en puntkomma in een naam worden ge-escaped; ongeldige tijd geeft niks', () => {
    expect(alarmIcs('2027-01-17', DEFAULT_PLAN, 'Val; Thorens, boven')).toContain('in Val\\; Thorens\\, boven')
    expect(alarmIcs('2027-01-17', { ...DEFAULT_PLAN, lift: '' })).toBeNull()
  })
})

describe('onthouden', () => {
  beforeEach(async () => {
    await db.kv.clear()
  })
  it('lifttijd per resort, de rest voor alles', async () => {
    expect(await loadPlan({ id: 'tignes', country: 'FR' })).toEqual({ ...DEFAULT_PLAN, lift: '09:00' })
    await savePlan({ lift: '08:45', travel: 25, ready: 40, warmup: false }, 'tignes')
    expect(await loadPlan({ id: 'tignes', country: 'FR' })).toEqual({ lift: '08:45', travel: 25, ready: 40, warmup: false })
    // ander resort: eigen standaard lifttijd, maar wel jouw reistijd en klaarmaken
    expect(await loadPlan({ id: 'ischgl', country: 'AT' })).toEqual({ lift: '08:30', travel: 25, ready: 40, warmup: false })
  })
})

describe('wekker-pagina', () => {
  beforeEach(async () => {
    await db.kv.clear()
    await db.records.clear()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })
  const page = () =>
    render(
      <MemoryRouter>
        <Alarm />
      </MemoryRouter>,
    )

  it('met een trip morgen: resort en de lifttijd van dat land; aanpassen schuift de wektijd mee', async () => {
    const user = userEvent.setup()
    const d = alarmDate()
    await create('trip', { name: 'Tignes', resortId: 'tignes', resortName: 'Tignes', startDate: d, endDate: d, packing: [] })
    page()
    const poster = await screen.findByRole('group', { name: 'Opstaan' })
    await waitFor(() => expect(within(poster).getByText('07:55')).toBeTruthy())
    expect(screen.getByText(/in Tignes/)).toBeTruthy()
    await user.click(within(screen.getByRole('group', { name: 'Naar de lift' })).getByRole('button', { name: 'Meer' }))
    expect(within(poster).getByText('07:50')).toBeTruthy()
    await user.click(screen.getByRole('switch', { name: /Warming-up/ }))
    expect(within(poster).getByText('07:55')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Eerste lift'), { target: { value: '08:15' } })
    expect(within(poster).getByText('07:10')).toBeTruthy()
    // onthouden voor dit resort
    await waitFor(async () => expect((await loadPlan({ id: 'tignes', country: 'FR' })).lift).toBe('08:15'))
  })

  it('in je agenda: een .ics-bestand op je wektijd', async () => {
    const user = userEvent.setup()
    let saved: Blob | null = null
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => ((saved = b as Blob), 'blob:x'))
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    page()
    await user.click(await screen.findByRole('button', { name: 'Zet in je agenda' }))
    expect(click).toHaveBeenCalled()
    expect(saved!.type).toBe('text/calendar')
    expect(await saved!.text()).toContain('DTSTART:')
    expect(screen.getByText(/geen wekker zetten/)).toBeTruthy()
  })

  it('home: een rij naar de wekker als je morgen op trip bent', async () => {
    const d = alarmDate()
    await create('trip', { name: 'Tignes', resortId: 'tignes', startDate: d, endDate: d, packing: [] })
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    expect((await screen.findByRole('link', { name: /Wekker voor morgen/ })).getAttribute('href')).toBe('/wekker')
  })
})
