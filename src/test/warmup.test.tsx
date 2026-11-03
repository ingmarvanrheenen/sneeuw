// Warming-up en cooling-down: de routines (3, 5, 10 minuten en rekken, geldige animaties), de klok (pauze,
// overslaan) en de pagina's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import Warmup from '../pages/Warmup'
import { ALL_EXERCISES, ROUTINES, WARMUP, WARMUP_CHOICES, WARMUP_SECS, routineSecs } from '../content/warmup'
import { validateAnim } from '../anim/engine'
import { elapsed, fmtSecs, pause, position, resume, skip, startClock } from '../lib/warmup'

const S = 1000

describe('routine', () => {
  it('precies 5 minuten, unieke oefeningen met uitleg', () => {
    expect(WARMUP_SECS).toBe(300)
    expect(new Set(WARMUP.map((e) => e.id)).size).toBe(WARMUP.length)
    for (const e of WARMUP) {
      expect(e.how.length).toBeGreaterThan(20)
      expect(e.secs).toBeGreaterThanOrEqual(20)
    }
  })

  it('3, 5 en 10 minuten, en een cooling-down van 5 minuten met andere oefeningen', () => {
    expect(WARMUP_CHOICES.map((id) => routineSecs(ROUTINES[id]))).toEqual([180, 300, 600])
    expect(routineSecs(ROUTINES.cooldown)).toBe(300)
    const warmIds = new Set(WARMUP_CHOICES.flatMap((id) => ROUTINES[id].exercises.map((e) => e.id)))
    expect(ROUTINES.cooldown.exercises.some((e) => warmIds.has(e.id))).toBe(false)
    for (const r of Object.values(ROUTINES)) {
      expect(new Set(r.exercises.map((e) => e.id)).size, r.id).toBe(r.exercises.length)
      for (const e of r.exercises) {
        expect(e.how.length).toBeGreaterThan(20)
        expect(e.secs).toBeGreaterThanOrEqual(20)
      }
    }
    // de korte begint ook met de knieën en eindigt met uitschudden
    expect(ROUTINES.kort.exercises[0].id).toBe('knieen')
    expect(ROUTINES.kort.exercises.at(-1)!.id).toBe('adem')
  })

  it('elke animatie is geldig en de rider blijft op zijn plek, op de vlakte', () => {
    for (const e of ALL_EXERCISES) {
      expect(validateAnim(e.anim)).toEqual([])
      expect(e.anim.slope).toBe(0)
      expect(e.anim.keys.every((k) => k.x === 0)).toBe(true)
    }
  })
})

describe('klok', () => {
  it('waar je bent: oefening, tijd over, en klaar na de laatste', () => {
    expect(position(WARMUP, 0)).toMatchObject({ index: 0, left: 40 * S, part: 0, done: false })
    expect(position(WARMUP, 39.5 * S)).toMatchObject({ index: 0, left: 0.5 * S })
    expect(position(WARMUP, 40 * S)).toMatchObject({ index: 1, left: 30 * S })
    expect(position(WARMUP, 150 * S).total).toBe(0.5)
    expect(position(WARMUP, 300 * S)).toMatchObject({ done: true, total: 1 })
  })

  it('pauze telt niet mee; overslaan springt naar de volgende', () => {
    let c = startClock(0)
    expect(elapsed(c, 10 * S)).toBe(10 * S)
    c = pause(c, 10 * S)
    expect(elapsed(c, 60 * S)).toBe(10 * S)
    expect(pause(c, 70 * S)).toBe(c)
    c = resume(c, 60 * S)
    expect(elapsed(c, 65 * S)).toBe(15 * S)
    c = skip(c, WARMUP, 65 * S)
    expect(position(WARMUP, elapsed(c, 65 * S))).toMatchObject({ index: 1, left: 30 * S })
  })

  it('tijd als m:ss, naar boven afgerond', () => {
    expect(fmtSecs(40 * S)).toBe('0:40')
    expect(fmtSecs(2100)).toBe('0:03')
    expect(fmtSecs(75 * S)).toBe('1:15')
    expect(fmtSecs(-5)).toBe('0:00')
  })
})

describe('warming-up-pagina', () => {
  let clock = 0
  const release = vi.fn(async () => {})
  beforeEach(() => {
    clock = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: vi.fn(async () => ({ release })) } })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })
  const page = () =>
    render(
      <MemoryRouter initialEntries={['/warming-up']}>
        <Routes>
          <Route path="/warming-up" element={<Warmup />} />
          <Route path="/cooling-down" element={<Warmup cool />} />
          <Route path="/runs" element={<div>run-teller</div>} />
          <Route path="/log/nieuw" element={<div>nieuwe dag</div>} />
        </Routes>
      </MemoryRouter>,
    )
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/warming-up" element={<Warmup />} />
          <Route path="/cooling-down" element={<Warmup cool />} />
          <Route path="/log/nieuw" element={<div>nieuwe dag</div>} />
        </Routes>
      </MemoryRouter>,
    )

  it('starten, de oefeningen volgen, pauze, volgende, en klaar', async () => {
    const user = userEvent.setup()
    page()
    expect(screen.getAllByText(/ s$/)).toHaveLength(WARMUP.length)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('heading', { name: 'Knieën los' })).toBeTruthy()
    expect(screen.getByLabelText('Nog 0:40')).toBeTruthy()
    expect(screen.getByText('Hierna: Armen zwaaien')).toBeTruthy()
    expect((navigator as unknown as { wakeLock: { request: ReturnType<typeof vi.fn> } }).wakeLock.request).toHaveBeenCalledWith('screen')

    clock += 41 * S
    expect(await screen.findByRole('heading', { name: 'Armen zwaaien' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Pauze' }))
    const frozen = screen.getByLabelText(/^Nog /).getAttribute('aria-label')
    clock += 20 * S
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.getByLabelText(/^Nog /).getAttribute('aria-label')).toBe(frozen)
    await user.click(screen.getByRole('button', { name: 'Door' }))

    await user.click(screen.getByRole('button', { name: 'Volgende' }))
    expect(screen.getByRole('heading', { name: 'Opwinden' })).toBeTruthy()
    expect(screen.getByText('3 van 8')).toBeTruthy()

    clock += 300 * S
    expect(await screen.findByText('Warm')).toBeTruthy()
    expect(release).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Naar de run-teller' }))
    expect(screen.getByText('run-teller')).toBeTruthy()
  })

  it('stoppen brengt je terug naar het overzicht', async () => {
    const user = userEvent.setup()
    page()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(screen.getByRole('button', { name: 'Stoppen' }))
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('korter of langer kiezen: de lijst en de klok passen zich aan', async () => {
    const user = userEvent.setup()
    page()
    expect(screen.getByText('5 minuten, met je board aan')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: '3 min' }))
    expect(screen.getByText('3 minuten, met je board aan')).toBeTruthy()
    expect(screen.getAllByText(/ s$/)).toHaveLength(ROUTINES.kort.exercises.length)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByLabelText('Nog 0:30')).toBeTruthy()
    expect(screen.getByText('1 van 6')).toBeTruthy()
    clock += 181 * S
    expect(await screen.findByText('3 minuten')).toBeTruthy()
    cleanup()
    page()
    await user.click(screen.getByRole('tab', { name: '10 min' }))
    expect(screen.getByText('10 minuten, met je board aan')).toBeTruthy()
    // een minuut of langer als m:ss
    expect(screen.getAllByText('1:15').length).toBe(4)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByLabelText('Nog 1:15')).toBeTruthy()
  })

  it('cooling-down: rekken, en na afloop naar je dag', async () => {
    const user = userEvent.setup()
    at('/cooling-down')
    expect(screen.getByText('5 minuten rekken na je laatste run')).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('heading', { name: 'Kuiten en enkels' })).toBeTruthy()
    clock += 301 * S
    expect(await screen.findByText('Uitgerekt')).toBeTruthy()
    expect(screen.getByText('Goed gereden')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Log je dag' }))
    expect(screen.getByText('nieuwe dag')).toBeTruthy()
  })
})
