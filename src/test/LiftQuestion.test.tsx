import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LiftQuestion } from '../components/LiftQuestion'
import Quiz from '../pages/Quiz'
import { db, kvGet, kvSet } from '../lib/db'
import { factFor, questionFor } from '../lib/liftpraat'

const TODAY = '2027-01-16'
vi.mock('../lib/ids', async (orig) => ({ ...(await orig<typeof import('../lib/ids')>()), todayISO: () => TODAY }))

const q = questionFor(TODAY)
const answers = () => screen.getByRole('group', { name: 'Antwoorden' })

beforeEach(async () => {
  await db.kv.clear()
})
afterEach(() => cleanup())

describe('liftpraat', () => {
  it('goed antwoord: groen, uitleg, weetje, en je streak begint', async () => {
    const user = userEvent.setup()
    render(<LiftQuestion />)
    expect(await screen.findByText(q.prompt)).toBeTruthy()
    expect(screen.queryByText(/op rij/)).toBeNull()
    await user.click(within(answers()).getByRole('button', { name: q.answer }))
    expect(await screen.findByText('Goed.')).toBeTruthy()
    expect(screen.getByText(factFor(TODAY))).toBeTruthy()
    expect(screen.getByText('1 dag op rij')).toBeTruthy()
    // daarna niet nog eens te kiezen
    for (const b of within(answers()).getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(await kvGet('quizCorrect', 0)).toBe(1)
  })

  it('fout antwoord: je keuze rood, het goede antwoord groen, en het blijft staan na herladen', async () => {
    const user = userEvent.setup()
    const wrong = q.options.find((o) => o !== q.answer)!
    const { unmount } = render(<LiftQuestion />)
    await user.click(await within(await screen.findByRole('group', { name: 'Antwoorden' })).findByRole('button', { name: wrong }))
    expect(await screen.findByText('Bijna.')).toBeTruthy()
    expect(within(answers()).getByRole('button', { name: wrong }).getAttribute('aria-pressed')).toBe('true')
    unmount()
    render(<LiftQuestion />)
    expect(await screen.findByText('Bijna.')).toBeTruthy()
  })

  it('streak loopt door van gisteren, en je record staat erbij', async () => {
    const user = userEvent.setup()
    const a = { chosen: 'x', correct: true }
    // record van 5 dagen in december, en gisteren + eergisteren
    await kvSet('liftpraat', {
      '2026-12-01': a,
      '2026-12-02': a,
      '2026-12-03': a,
      '2026-12-04': a,
      '2026-12-05': a,
      '2027-01-14': a,
      '2027-01-15': a,
    })
    render(<LiftQuestion />)
    expect(await screen.findByText('2 dagen op rij')).toBeTruthy()
    await user.click(within(answers()).getByRole('button', { name: q.answer }))
    expect(await screen.findByText('3 dagen op rij')).toBeTruthy()
    expect(screen.getByText(/Je record: 5 dagen op rij/)).toBeTruthy()
  })
})

describe('quiz (zelfde vragen)', () => {
  it('een vraag met vier antwoorden; goed antwoorden telt mee', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Quiz />
      </MemoryRouter>,
    )
    expect(screen.getByText('Vraag 1 van 10')).toBeTruthy()
    const options = screen.getAllByRole('button').filter((b) => b.className.includes('card'))
    expect(options).toHaveLength(4)
    await user.click(options[0])
    expect(screen.getByRole('button', { name: /Volgende/ })).toBeTruthy()
  })
})
