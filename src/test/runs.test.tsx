// Run-teller: tikken, de stand (piste, lift, pauze), terugdraaien, en waar het in de app terugkomt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'

import Runs from '../pages/Runs'
import Home from '../pages/Home'
import LogDetail from '../pages/LogDetail'
import { dropRun, fmtClock, fmtSpan, loadRunDay, resetRunDay, runsForDay, runStats, startRun, stateOf, stopRun, undoRun } from '../lib/runs'
import { smartDraft, EMPTY_DRAFT } from '../lib/sessions'
import { create } from '../lib/repo'
import { db } from '../lib/db'
import { todayISO } from '../lib/ids'

const MIN = 60_000
let clock = Date.now()
beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  clock = new Date().setHours(10, 0, 0, 0)
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  await resetRunDay()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('run-logica', () => {
  const D = '2027-01-16'
  const t0 = new Date('2027-01-16T09:00:00').getTime()

  it('start, beneden, en de stand: piste, lift, pauze', async () => {
    let day = await startRun(t0, D)
    expect(stateOf(day, t0 + MIN)).toBe('piste')
    day = await stopRun(t0 + 5 * MIN, D)
    expect(stateOf(day, t0 + 10 * MIN)).toBe('lift')
    expect(stateOf(day, t0 + 60 * MIN)).toBe('pauze')
    expect(stateOf({ date: D, runs: [] })).toBe('klaar')
  })

  it('tijd op de piste, in de lift (gat < 45 min) en pauze; langste en gemiddeld', async () => {
    await startRun(t0, D)
    await stopRun(t0 + 4 * MIN, D) // run 1: 4 min
    await startRun(t0 + 14 * MIN, D) // 10 min lift
    await stopRun(t0 + 20 * MIN, D) // run 2: 6 min
    const day = await startRun(t0 + 80 * MIN, D) // 60 min pauze, run 3 loopt
    const s = runStats(day, t0 + 82 * MIN)
    expect(s).toMatchObject({
      runs: 2,
      pisteMs: 12 * MIN,
      liftMs: 10 * MIN,
      pauseMs: 60 * MIN,
      longestMs: 6 * MIN,
      averageMs: 5 * MIN,
      dayMs: 82 * MIN,
      currentMs: 2 * MIN,
    })
    // nu in de lift: het huidige gat telt mee
    const after = await stopRun(t0 + 85 * MIN, D)
    expect(runStats(after, t0 + 88 * MIN)).toMatchObject({ runs: 3, liftMs: 13 * MIN, currentMs: 3 * MIN })
  })

  it('start terwijl er nog een loopt sluit die eerst af; beneden zonder run doet niks', async () => {
    await startRun(t0, D)
    const day = await startRun(t0 + 3 * MIN, D)
    expect(day.runs).toEqual([{ start: t0, end: t0 + 3 * MIN }, { start: t0 + 3 * MIN }])
    await stopRun(t0 + 5 * MIN, D)
    expect((await stopRun(t0 + 9 * MIN, D)).runs.at(-1)?.end).toBe(t0 + 5 * MIN)
  })

  it('oeps terug: Beneden weer open, dan Start weg; vergeten: weggooien', async () => {
    await startRun(t0, D)
    await stopRun(t0 + 3 * MIN, D)
    expect((await undoRun(D)).runs).toEqual([{ start: t0 }])
    expect((await undoRun(D)).runs).toEqual([])
    await startRun(t0, D)
    expect((await dropRun(D)).runs).toEqual([])
  })

  it('bewaard per dag, ook na herladen', async () => {
    await startRun(t0, D)
    await stopRun(t0 + 2 * MIN, D)
    expect((await loadRunDay(D)).runs).toHaveLength(1)
    expect((await loadRunDay('2027-01-17')).runs).toHaveLength(0)
  })

  it('tijden netjes', () => {
    expect(fmtClock(65_000)).toBe('1:05')
    expect(fmtClock(3_725_000)).toBe('1:02:05')
    expect(fmtSpan(42 * MIN)).toBe('42 min')
    expect(fmtSpan(72 * MIN)).toBe('1 u 12')
    expect(fmtSpan(120 * MIN)).toBe('2 u')
  })

  it('voor je dag: runs en uren op de berg (op een half uur); je dag neemt het over', async () => {
    expect(await runsForDay(D)).toBeNull()
    await startRun(t0, D)
    await stopRun(t0 + 5 * MIN, D)
    await startRun(t0 + 200 * MIN, D)
    await stopRun(t0 + 205 * MIN, D)
    expect(await runsForDay(D)).toEqual({ runs: 2, hours: 3.5 })
    const d = await smartDraft(D)
    expect(d).toMatchObject({ runs: 2, hours: 3.5 })
  })
})

const at = (path: string, el: ReactElement, route = path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={el} />
        <Route path="/log/nieuw" element={<div>nieuwe dag</div>} />
        <Route path="/runs" element={<Runs />} />
      </Routes>
    </MemoryRouter>,
  )

describe('run-pagina', () => {
  it('tikken: Start, Beneden, en de stand loopt mee', async () => {
    const user = userEvent.setup()
    at('/runs', <Runs />)
    const now = await screen.findByRole('group', { name: 'Nu' })
    expect(within(now).getByText('Klaar?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Start run 1' }))
    expect(await within(now).findByText('Run 1')).toBeTruthy()
    clock += 4 * MIN + 7000
    await user.click(screen.getByRole('button', { name: 'Beneden' }))
    expect(await within(now).findByText('In de lift')).toBeTruthy()
    expect(within(now).getByText('1 run erin')).toBeTruthy()
    clock += 9 * MIN
    await user.click(screen.getByRole('button', { name: 'Start run 2' }))
    clock += 3 * MIN
    await user.click(screen.getByRole('button', { name: 'Beneden' }))
    await waitFor(() => expect(screen.getByText('Langste run 4:07 · gemiddeld 3:33', { exact: false })).toBeTruthy())
    expect(screen.getByText('9 min')).toBeTruthy() // in de lift
    const rows = within(screen.getByRole('heading', { name: 'Runs' }).closest('section')!).getAllByText(/^\d+:\d{2}$/)
    // per run: starttijd en lengte, nieuwste boven
    expect(rows.map((r) => r.textContent)).toEqual(['10:13', '3:00', '10:00', '4:07'])
  })

  it('mis getikt: oeps terug', async () => {
    const user = userEvent.setup()
    at('/runs', <Runs />)
    await user.click(await screen.findByRole('button', { name: 'Start run 1' }))
    await user.click(screen.getByRole('button', { name: 'Oeps, terug' }))
    expect(await screen.findByRole('button', { name: 'Start run 1' })).toBeTruthy()
  })

  it('vergeten op Beneden te tikken: weggooien of nu stoppen', async () => {
    const user = userEvent.setup()
    at('/runs', <Runs />)
    await user.click(await screen.findByRole('button', { name: 'Start run 1' }))
    clock += 50 * MIN
    expect((await screen.findByRole('alert', {}, { timeout: 2000 })).textContent).toMatch(/Vergeten op Beneden/)
    await user.click(screen.getByRole('button', { name: 'Gooi hem weg' }))
    expect(await screen.findByRole('button', { name: 'Start run 1' })).toBeTruthy()
  })

  it('in je dag: bestaande dag krijgt de runs; zonder dag naar loggen', async () => {
    const user = userEvent.setup()
    await startRun(clock - 10 * MIN)
    await stopRun(clock - 5 * MIN)
    at('/runs', <Runs />)
    await user.click(await screen.findByRole('button', { name: 'Log je dag' }))
    expect(await screen.findByText('nieuwe dag')).toBeTruthy()
    cleanup()
    const s = await create('session', { ...EMPTY_DRAFT, date: todayISO(), resortName: 'Tignes' })
    at('/runs', <Runs />)
    await user.click(await screen.findByRole('button', { name: 'Zet in je dag' }))
    await waitFor(async () => expect((await db.records.get(s.id)) as { runs?: number }).toMatchObject({ runs: 1 }))
  })
})

describe('run-teller in de app', () => {
  it('home: een rij als je niet telt, een live blok als je telt', async () => {
    at('/', <Home />)
    expect(await screen.findByText('Tel je runs en je tijd in de lift')).toBeTruthy()
    cleanup()
    await startRun(clock - 2 * MIN)
    at('/', <Home />)
    const card = await screen.findByRole('button', { name: 'Run-teller' })
    expect(within(card).getByText('Run 1')).toBeTruthy()
    expect(within(card).getByText('2:00')).toBeTruthy()
  })

  it('je dag laat de runs zien', async () => {
    const s = await create('session', { ...EMPTY_DRAFT, date: '2027-01-10', runs: 14 } as typeof EMPTY_DRAFT & { runs: number })
    at(`/log/${s.id}`, <LogDetail />, '/log/:id')
    expect(await screen.findByText('14 runs')).toBeTruthy()
  })
})
