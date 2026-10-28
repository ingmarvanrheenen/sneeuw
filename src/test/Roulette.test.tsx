import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Tricks from '../pages/Tricks'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { listKind, setTrickStatus } from '../lib/repo'
import { rouletteCandidates } from '../lib/roulette'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'

const open = (url = '/tricks') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/tricks" element={<Tricks />} />
        <Route path="/tricks/:id" element={<div>trickpagina</div>} />
      </Routes>
    </MemoryRouter>,
  )

/** naam die nu in de roulette staat */
const current = (sheet: HTMLElement) => sheet.querySelector('.display')?.textContent ?? ''

beforeEach(async () => {
  await db.records.clear()
  setCurrentUserId('me')
  // minder beweging: meteen het resultaat, zodat de test niet hoeft te wachten
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('trick-roulette', () => {
  it('vanuit de bijbel: een trick binnen je bereik, met animatie-link', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: /Roulette/ }))
    const sheet = screen.getByRole('dialog', { name: 'Trick-roulette' })
    await waitFor(() => expect(current(sheet)).not.toBe(''))
    const trick = TRICKS.find((t) => t.name === current(sheet))!
    // beginner: niveau 1 zonder voorkennis
    expect(trick.level).toBe(1)
    expect(within(sheet).getByText(trick.summary)).toBeTruthy()
    await user.click(within(sheet).getByRole('link', { name: /Bekijk de animatie/ }))
    expect(await screen.findByText('trickpagina')).toBeTruthy()
  })

  it('nog een keer: een andere trick', async () => {
    const user = userEvent.setup()
    open('/tricks?roulette=1')
    const sheet = await screen.findByRole('dialog', { name: 'Trick-roulette' })
    await waitFor(() => expect(current(sheet)).not.toBe(''))
    const first = current(sheet)
    await user.click(within(sheet).getByRole('button', { name: /Nog een keer/ }))
    await waitFor(() => expect(current(sheet)).not.toBe(first))
  })

  it('zet als doel: doel erbij en de trick op "wil leren"', async () => {
    const user = userEvent.setup()
    open('/tricks?roulette=1')
    const sheet = await screen.findByRole('dialog', { name: 'Trick-roulette' })
    await waitFor(() => expect(current(sheet)).not.toBe(''))
    const trick = TRICKS.find((t) => t.name === current(sheet))!
    await user.click(within(sheet).getByRole('button', { name: 'Zet als doel' }))
    expect(await within(sheet).findByText('Staat in je doelen')).toBeTruthy()
    const goals = await listKind('goal')
    expect(goals.map((g) => [g.title, g.trickId])).toEqual([[`${trick.name} leren`, trick.id]])
    expect((await listKind('trick')).find((p) => p.trickId === trick.id)?.status).toBe('wil')
  })

  it('per track: alleen tricks uit die track', async () => {
    const user = userEvent.setup()
    for (const t of TRICKS.filter((t) => t.level <= 2)) await setTrickStatus(t.id, 'geland')
    open('/tricks?roulette=1')
    const sheet = await screen.findByRole('dialog', { name: 'Trick-roulette' })
    await user.click(within(sheet).getByRole('button', { name: 'Flatland' }))
    await waitFor(() => expect(TRICKS.find((t) => t.name === current(sheet))?.track).toBe('flat'))
    const n = rouletteCandidates(new Map(TRICKS.filter((t) => t.level <= 2).map((t) => [t.id, 'geland'])), 'flat').length
    expect(within(sheet).getByText(`${n} tricks binnen je bereik`)).toBeTruthy()
  })

  it('alles geland: een compliment in plaats van een trick', async () => {
    for (const t of TRICKS) await setTrickStatus(t.id, 'geland')
    open('/tricks?roulette=1')
    const sheet = await screen.findByRole('dialog', { name: 'Trick-roulette' })
    expect(await within(sheet).findByText('Alles binnen bereik is geland. Respect.')).toBeTruthy()
    expect(within(sheet).queryByRole('button', { name: /Nog een keer/ })).toBeNull()
  })

  it('met beweging: eerst rollen langs namen, dan stoppen op een trick', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    open('/tricks?roulette=1')
    const sheet = await screen.findByRole('dialog', { name: 'Trick-roulette' })
    await waitFor(() => expect(sheet.querySelector('[aria-busy="true"]')).toBeTruthy())
    await waitFor(() => expect(sheet.querySelector('[aria-busy="false"]')).toBeTruthy(), { timeout: 3000 })
    expect(TRICK_BY_ID.has(TRICKS.find((t) => t.name === current(sheet))?.id ?? '')).toBe(true)
  })
})
