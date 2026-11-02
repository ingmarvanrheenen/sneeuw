// Programma's: de content klopt (bestaande tricks, echte oefeningen), de voortgang, en de pagina's.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import Programs from '../pages/Programs'
import Home from '../pages/Home'
import { PROGRAM_BY_ID, PROGRAMS } from '../content/programs'
import { TRICK_BY_ID } from '../content/tricks'
import { PISTES } from '../content/logOptions'
import { doneCount, isComplete, loadPrograms, nextDay, setDayDone, startProgram, stopProgram } from '../lib/programs'
import { db } from '../lib/db'

beforeEach(async () => {
  await db.kv.clear()
  await db.records.clear()
  await loadPrograms()
})
afterEach(() => cleanup())

describe('programma-content', () => {
  it('unieke programma’s van 3 tot 5 dagen, elke dag met doel, oefeningen en bestaande tricks', () => {
    expect(new Set(PROGRAMS.map((p) => p.id)).size).toBe(PROGRAMS.length)
    for (const p of PROGRAMS) {
      expect(p.days.length).toBeGreaterThanOrEqual(3)
      expect(p.days.length).toBeLessThanOrEqual(5)
      for (const d of p.days) {
        expect(d.title && d.goal).toBeTruthy()
        expect(d.tasks.length).toBeGreaterThanOrEqual(2)
        expect(d.tricks.length).toBeGreaterThan(0)
        for (const t of d.tricks) expect(TRICK_BY_ID.has(t), `${p.id}: ${t}`).toBe(true)
        if (d.piste) expect(PISTES.some((x) => x.id === d.piste)).toBe(true)
      }
    }
  })

  it('van groen naar rood eindigt echt op rood', () => {
    expect(PROGRAM_BY_ID.get('groen-naar-rood')!.days.at(-1)!.piste).toBe('rood')
  })
})

describe('voortgang', () => {
  const p = PROGRAM_BY_ID.get('carven')!

  it('starten, dagen afvinken met datum, de laatste maakt hem af', async () => {
    let s = await startProgram(p.id, '2027-01-10')
    expect(s.active).toBe(p.id)
    expect(nextDay(p, s.runs[p.id])).toBe(0)
    s = await setDayDone(p.id, 0, true, '2027-01-10')
    s = await setDayDone(p.id, 1, true, '2027-01-11')
    expect(s.runs[p.id].done).toEqual({ 0: '2027-01-10', 1: '2027-01-11' })
    expect(nextDay(p, s.runs[p.id])).toBe(2)
    s = await setDayDone(p.id, 1, false)
    expect(nextDay(p, s.runs[p.id])).toBe(1)
    s = await setDayDone(p.id, 1, true, '2027-01-12')
    s = await setDayDone(p.id, 2, true, '2027-01-13')
    expect(isComplete(p, s.runs[p.id])).toBe(true)
    expect(s.active).toBeNull()
    expect(nextDay(p, s.runs[p.id])).toBeNull()
  })

  it('opnieuw beginnen wist de dagen; stoppen laat ze staan', async () => {
    await startProgram(p.id)
    await setDayDone(p.id, 0, true)
    let s = await stopProgram()
    expect(s.active).toBeNull()
    expect(doneCount(s.runs[p.id])).toBe(1)
    s = await startProgram(p.id)
    expect(doneCount(s.runs[p.id])).toBe(0)
  })
})

describe('programma-pagina’s', () => {
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/programmas" element={<Programs />} />
          <Route path="/programmas/:id" element={<Programs />} />
          <Route path="/tricks/:id" element={<div>trickpagina</div>} />
        </Routes>
      </MemoryRouter>,
    )

  it('starten, de dag van vandaag met oefeningen en tricks, dag gedaan, en op Home de volgende', async () => {
    const user = userEvent.setup()
    at('/programmas')
    await user.click(await screen.findByRole('link', { name: /Van groen naar rood/ }))
    await user.click(screen.getByRole('button', { name: 'Start' }))
    const day1 = await screen.findByRole('button', { name: /Bochten op blauw/ })
    expect(day1.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Drie afdalingen blauw zonder te stoppen')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Gekoppelde bochten' }).getAttribute('href')).toBe('/tricks/gekoppelde-bochten')
    await user.click(screen.getByRole('button', { name: 'Dag gedaan' }))
    expect((await screen.findByRole('button', { name: /Dynamisch/ })).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /Bochten op blauw/ }).textContent).toMatch(/Gedaan op/)
    cleanup()
    at('/')
    expect(await screen.findByRole('link', { name: /Dag 2: Dynamisch/ })).toBeTruthy()
  })

  it('alle dagen af: poster, en opnieuw beginnen kan', async () => {
    const user = userEvent.setup()
    const p = PROGRAM_BY_ID.get('carven')!
    await startProgram(p.id)
    for (let i = 0; i < p.days.length; i++) await setDayDone(p.id, i, true)
    at('/programmas/carven')
    const done = await screen.findByRole('group', { name: 'Programma af' })
    expect(within(done).getByText('Af')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Opnieuw beginnen' }))
    expect(screen.queryByRole('group', { name: 'Programma af' })).toBeNull()
  })

  it('onbekend programma: niet gevonden', async () => {
    at('/programmas/bestaat-niet')
    expect((await screen.findAllByText('Niet gevonden')).length).toBeGreaterThan(0)
  })
})
