// GPS bij de run-teller: topsnelheid, hoogtemeters en afstand uit nep-fixes (ruis, sprongen, slechte fixes),
// en op de pagina: aanzetten, live tijdens de run, bewaard bij de run, en geen toestemming. Geolocatie is gemockt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { act } from 'react'

import Runs from '../pages/Runs'
import { addFix, dayGps, emptyGps, fmtDist, fmtKmh, meters, MAX_ACC, type Fix, type RunGps } from '../lib/runGps'
import { gpsPref, loadGpsPref, loadRunDay, resetRunDay, setGpsPref, setRunGps, startRun, stopRun, undoRun } from '../lib/runs'
import { db } from '../lib/db'

const LAT = 45.45
const LON = 6.98
const M_PER_DEG_LAT = 111_195
/** fix op `north` meter ten noorden van het startpunt */
const fix = (i: number, over: Partial<Fix> & { north?: number } = {}): Fix => {
  const { north = 0, ...rest } = over
  return { lat: LAT + north / M_PER_DEG_LAT, lon: LON, alt: 2000, altAcc: 5, acc: 5, speed: null, t: 1_000_000 + i * 1000, ...rest }
}
const run = (fixes: Fix[]) => fixes.reduce(addFix, emptyGps())

describe('GPS-rekenwerk', () => {
  it('afstand klopt (haversine)', () => {
    expect(meters({ lat: LAT, lon: LON }, { lat: LAT + 1000 / M_PER_DEG_LAT, lon: LON })).toBeCloseTo(1000, 0)
  })

  it('een afdaling: 10 m/s naar beneden met 2 m per seconde zakken', () => {
    const g = run(Array.from({ length: 31 }, (_, i) => fix(i, { north: i * 10, alt: 2000 - i * 2 })))
    expect(g.top).toBeCloseTo(36, 0)
    expect(g.dist).toBeGreaterThanOrEqual(295)
    expect(g.dist).toBeLessThanOrEqual(300)
    // gemiddelde van drie loopt één fix achter
    expect(g.drop).toBeGreaterThanOrEqual(56)
    expect(g.drop).toBeLessThanOrEqual(60)
    expect(g.fixes).toBe(31)
  })

  it('snelheid van het toestel telt, maar één uitschieter niet (de middelste van drie)', () => {
    const fixes = Array.from({ length: 20 }, (_, i) => fix(i, { north: i * 8, speed: i === 10 ? 30 : 8 }))
    expect(run(fixes).top).toBeCloseTo(28.8, 1)
  })

  it('stilstaan met ruis: geen afstand en bijna geen snelheid', () => {
    const jitter = [0, 2, -1, 3, -2, 1, 0, -3, 2, -1]
    const g = run(Array.from({ length: 60 }, (_, i) => fix(i, { north: jitter[i % 10], alt: 2000 + jitter[i % 10] })))
    expect(g.dist).toBe(0)
    expect(g.top).toBeLessThan(12)
    expect(g.drop).toBeLessThanOrEqual(3)
  })

  it('een GPS-sprong telt niet mee voor snelheid of afstand', () => {
    const fixes = Array.from({ length: 10 }, (_, i) => fix(i, { north: i * 10 }))
    fixes.splice(5, 0, fix(4.5, { north: 2000 }))
    const g = run(fixes)
    expect(g.top).toBeLessThan(40)
    expect(g.dist).toBeLessThanOrEqual(90)
  })

  it('slechte fixes overgeslagen; hoogte alleen met een goede hoogte-nauwkeurigheid', () => {
    expect(run([fix(0, { acc: MAX_ACC + 1 })]).fixes).toBe(0)
    const g = run(Array.from({ length: 10 }, (_, i) => fix(i, { north: i * 10, alt: 2000 - i * 10, altAcc: 50 })))
    expect(g.drop).toBe(0)
    expect(g.fixes).toBe(10)
    // geen hoogte (sommige toestellen) geeft ook geen hoogtemeters, wel snelheid
    expect(run(Array.from({ length: 5 }, (_, i) => fix(i, { north: i * 10, alt: null }))).top).toBeCloseTo(36, 0)
  })

  it('oude of dubbele fixes doen niets', () => {
    const a = run([fix(0), fix(1, { north: 10 })])
    expect(addFix(a, fix(1, { north: 20 }))).toBe(a)
    expect(addFix(a, fix(0, { north: 20 }))).toBe(a)
  })

  it('de dag: hoogste top, hoogtemeters en afstand opgeteld; zonder GPS niets', () => {
    const g = (top: number, drop: number, dist: number): RunGps => ({ ...emptyGps(), top, drop, dist, fixes: 5 })
    expect(dayGps([{ gps: g(40, 200, 1500) }, {}, { gps: g(55, 300, 2000) }])).toEqual({ top: 55, drop: 500, dist: 3500, runs: 2 })
    expect(dayGps([{}, { gps: emptyGps() }])).toBeNull()
    expect(fmtKmh(54.6)).toBe('55 km/u')
    expect(fmtDist(640)).toBe('640 m')
    expect(fmtDist(3450)).toBe('3,5 km')
  })
})

describe('GPS bewaren bij de run', () => {
  beforeEach(async () => {
    await db.kv.clear()
  })

  it('op starttijd; blijft staan na Beneden en na Oeps terug; onbekende run doet niets', async () => {
    const D = '2027-01-16'
    const t0 = new Date('2027-01-16T09:00:00').getTime()
    await startRun(t0, D)
    const g = { ...emptyGps(), top: 50, drop: 120, dist: 900, fixes: 40 }
    await setRunGps(t0, g, D)
    let day = await stopRun(t0 + 300_000, D)
    expect(day.runs[0].gps?.top).toBe(50)
    day = await undoRun(D)
    expect(day.runs[0]).toMatchObject({ start: t0, gps: { top: 50 } })
    expect(day.runs[0].end).toBeUndefined()
    day = await setRunGps(123, g, D)
    expect(day.runs).toHaveLength(1)
  })

  it('voorkeur: standaard uit, onthouden op dit toestel', async () => {
    expect(await loadGpsPref()).toBe(false)
    await setGpsPref(true)
    gpsPref.set(false)
    expect(await loadGpsPref()).toBe(true)
  })
})

describe('run-pagina met GPS', () => {
  let onFix: ((p: GeolocationPosition) => void) | null
  let onErr: ((e: GeolocationPositionError) => void) | null
  const watch = vi.fn()
  const clear = vi.fn()
  beforeEach(async () => {
    await db.kv.clear()
    await db.records.clear()
    await resetRunDay()
    await loadGpsPref()
    onFix = onErr = null
    watch.mockReset().mockImplementation((ok, err) => {
      onFix = ok
      onErr = err
      return 7
    })
    clear.mockReset()
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: clear } })
  })
  afterEach(() => cleanup())

  const pos = (f: Fix) =>
    ({
      timestamp: f.t,
      coords: { latitude: f.lat, longitude: f.lon, altitude: f.alt, altitudeAccuracy: f.altAcc, accuracy: f.acc, speed: f.speed },
    }) as unknown as GeolocationPosition
  const page = () =>
    render(
      <MemoryRouter>
        <Runs />
      </MemoryRouter>,
    )

  it('uit: geen locatie gevraagd', async () => {
    const user = userEvent.setup()
    page()
    await user.click(await screen.findByRole('button', { name: /Start run 1/ }))
    expect(screen.getByRole('switch', { name: /GPS tijdens je run/ }).getAttribute('aria-checked')).toBe('false')
    expect(watch).not.toHaveBeenCalled()
  })

  it('aan: live top en hoogtemeters, na Beneden bewaard en in de stats en de lijst', async () => {
    const user = userEvent.setup()
    page()
    await user.click(await screen.findByRole('switch', { name: /GPS tijdens je run/ }))
    await user.click(screen.getByRole('button', { name: /Start run 1/ }))
    expect(await screen.findByText('GPS zoeken…')).toBeTruthy()
    expect(watch.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true })
    act(() => {
      for (let i = 0; i < 21; i++) onFix!(pos(fix(i, { north: i * 15, alt: 2000 - i * 5 })))
    })
    expect(await screen.findByText(/54 km\/u top · \d+ m omlaag/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Beneden/ }))
    await waitFor(() => expect(clear).toHaveBeenCalledWith(7))
    expect(await screen.findByText('km/u top')).toBeTruthy()
    expect(screen.getByText('54')).toBeTruthy()
    expect(screen.getByText('m omlaag')).toBeTruthy()
    expect(screen.getByText('300 m')).toBeTruthy() // afstand
    await waitFor(async () => expect((await loadRunDay()).runs[0].gps?.fixes).toBe(21))
    expect(screen.getByText(/· 54 km\/u · \d+ m/)).toBeTruthy()
  })

  it('geen toestemming: uitleg, en GPS gaat weer uit', async () => {
    const user = userEvent.setup()
    await setGpsPref(true)
    page()
    await user.click(await screen.findByRole('button', { name: /Start run 1/ }))
    await waitFor(() => expect(onErr).toBeTruthy())
    act(() => onErr!({ code: 1 } as GeolocationPositionError))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Geen toestemming/)
    await waitFor(() => expect(gpsPref.get()).toBe(false))
  })
})
