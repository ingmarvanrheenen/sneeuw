// Warming-up: de routine (5 minuten, geldige animaties), de klok (pauze, overslaan) en de pagina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import Warmup from '../pages/Warmup'
import { WARMUP, WARMUP_SECS } from '../content/warmup'
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

  it('elke animatie is geldig en de rider blijft op zijn plek, op de vlakte', () => {
    for (const e of WARMUP) {
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
          <Route path="/runs" element={<div>run-teller</div>} />
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
})
