// Noodkaart: nummers per land, je eigen gegevens (alleen op dit toestel), je plek, en de kaart voor hulpverleners.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import Emergency from '../pages/Emergency'
import { ACCIDENT_STEPS, COUNTRY_BY_ID, EMERGENCY_COUNTRIES } from '../content/emergency'
import { RESORTS } from '../content/resorts'
import { cleanCard, fmtCoords, hasMedical, loadCard, locError, pickCountry, saveCard, saveCountry, telHref } from '../lib/emergency'
import { create } from '../lib/repo'
import { db, kvGet } from '../lib/db'

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('noodnummers', () => {
  it('elk land: uniek, alleen cijfers, en het hoofdnummer staat in de lijst', () => {
    expect(new Set(EMERGENCY_COUNTRIES.map((c) => c.id)).size).toBe(EMERGENCY_COUNTRIES.length)
    for (const c of EMERGENCY_COUNTRIES) {
      expect(c.numbers.some((n) => n.nr === c.main)).toBe(true)
      for (const n of c.numbers) expect(n.nr).toMatch(/^\d{2,4}$/)
    }
  })

  it('elk land van onze skigebieden heeft een noodkaart; Europa belt 112', () => {
    for (const r of RESORTS) expect(COUNTRY_BY_ID.has(r.country)).toBe(true)
    for (const id of ['FR', 'AT', 'CH', 'IT', 'DE', 'NL', 'ES', 'SE']) expect(COUNTRY_BY_ID.get(id)!.main).toBe('112')
    expect(COUNTRY_BY_ID.get('AT')!.numbers.find((n) => n.nr === '140')?.label).toMatch(/Bergredding/)
    expect(COUNTRY_BY_ID.get('CH')!.numbers.find((n) => n.nr === '1414')?.label).toMatch(/Rega/)
    expect(ACCIDENT_STEPS.length).toBeGreaterThanOrEqual(4)
  })
})

describe('noodkaart-logica', () => {
  it('gegevens: getrimd, ingekort, lege velden weg', () => {
    expect(cleanCard({ name: '  Sam ', allergies: '', blood: 'x'.repeat(50) })).toEqual({ name: 'Sam', blood: 'x'.repeat(10) })
    expect(hasMedical({ name: 'Sam' })).toBe(false)
    expect(hasMedical({ meds: 'Ventolin' })).toBe(true)
  })

  it('bellen, coördinaten en locatiefouten', () => {
    expect(telHref('+31 6 1234-5678')).toBe('tel:+31612345678')
    expect(telHref('112')).toBe('tel:112')
    expect(fmtCoords({ latitude: 45.298123, longitude: 6.580341, altitude: 2301.6 })).toBe('45.29812, 6.58034 · 2302 m')
    expect(fmtCoords({ latitude: 45.3, longitude: 6.58, altitude: null })).toBe('45.30000, 6.58000')
    expect(locError({ code: 1 })).toMatch(/Locatievoorzieningen/)
  })

  it('land: zelf gekozen, anders de trip van nu of de volgende, anders Frankrijk', async () => {
    expect(await pickCountry('2027-01-10')).toBe('FR')
    await create('trip', {
      name: 'Ischgl',
      resortId: RESORTS.find((r) => r.country === 'AT')!.id,
      startDate: '2027-02-01',
      endDate: '2027-02-08',
      packing: [],
    } as never)
    expect(await pickCountry('2027-01-10')).toBe('AT')
    await saveCountry('CH')
    expect(await pickCountry('2027-01-10')).toBe('CH')
  })

  it('alleen op dit toestel: niet in je profiel, niet als record (dus nooit gesynct)', async () => {
    await saveCard({ name: 'Sam', allergies: 'Penicilline' })
    expect(await loadCard()).toEqual({ name: 'Sam', allergies: 'Penicilline' })
    expect(await kvGet('profile', null)).toBeNull()
    expect(await db.records.count()).toBe(0)
  })
})

const page = () =>
  render(
    <MemoryRouter>
      <Emergency />
    </MemoryRouter>,
  )

describe('noodkaart-pagina', () => {
  it('bel met één tik; ander land kiezen laat die nummers zien en wordt onthouden', async () => {
    const user = userEvent.setup()
    page()
    expect((await screen.findByRole('link', { name: 'Bel 112' })).getAttribute('href')).toBe('tel:112')
    expect(screen.getByRole('link', { name: 'Bel Ambulance (SAMU): 15' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Ander land' }))
    await user.click(within(screen.getByRole('group', { name: 'Land' })).getByRole('button', { name: 'Oostenrijk' }))
    expect((await screen.findByRole('link', { name: 'Bel Bergredding (Bergrettung): 140' })).getAttribute('href')).toBe('tel:140')
    expect(await pickCountry()).toBe('AT')
  })

  it('gegevens invullen, pistedienst bovenaan, en tonen aan hulp in het Engels', async () => {
    const user = userEvent.setup()
    page()
    await user.click(await screen.findByRole('button', { name: 'Invullen' }))
    const sheet = screen.getByRole('dialog', { name: 'Mijn gegevens' })
    await user.type(within(sheet).getByLabelText('Naam'), 'Sam de Vries')
    await user.type(within(sheet).getByLabelText('Allergieën'), 'Penicilline')
    await user.type(within(sheet).getByLabelText('Telefoon'), '+31 6 12345678')
    await user.type(within(sheet).getByLabelText('Pistedienst hier'), '04 79 00 00 00')
    await user.click(within(sheet).getByRole('button', { name: 'Bewaar' }))
    await waitFor(async () => expect((await loadCard()).allergies).toBe('Penicilline'))

    expect(screen.getByRole('link', { name: /Bel Pistedienst:/ }).getAttribute('href')).toBe('tel:0479000000')
    await user.click(screen.getByRole('button', { name: 'Laat zien aan hulp' }))
    const show = screen.getByRole('dialog', { name: 'Noodkaart voor hulpverleners' })
    expect(within(show).getByText('Let op · Important')).toBeTruthy()
    expect(within(show).getByText('Allergies · Allergieën')).toBeTruthy()
    expect(within(show).getByText('Penicilline')).toBeTruthy()
    expect(within(show).getByRole('link', { name: '+31 6 12345678' }).getAttribute('href')).toBe('tel:+31612345678')
    expect(within(show).queryByText(/Ski patrol/)).toBeNull()
    await user.click(within(show).getByRole('button', { name: 'Sluit' }))
    expect(screen.queryByRole('dialog', { name: 'Noodkaart voor hulpverleners' })).toBeNull()
  })

  it('zoek mijn plek: coördinaten om voor te lezen, of uitleg als het niet mag', async () => {
    const user = userEvent.setup()
    let ok = true
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (res: PositionCallback, rej: PositionErrorCallback) =>
          ok
            ? res({ coords: { latitude: 45.29812, longitude: 6.58034, altitude: 2300 } } as GeolocationPosition)
            : rej({ code: 1 } as GeolocationPositionError),
      },
    })
    page()
    await user.click(await screen.findByRole('button', { name: 'Zoek mijn plek' }))
    expect(await screen.findByText('45.29812, 6.58034 · 2300 m')).toBeTruthy()
    cleanup()
    ok = false
    page()
    await user.click(await screen.findByRole('button', { name: 'Zoek mijn plek' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Geen toegang tot je locatie/)
  })
})
