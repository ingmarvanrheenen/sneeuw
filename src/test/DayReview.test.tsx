import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const coach = vi.hoisted(() => ({ reviewDay: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))
vi.mock('../lib/coach', async (orig) => ({ ...(await orig<typeof import('../lib/coach')>()), reviewDay: coach.reviewDay }))

import { DayReview } from '../components/DayReview'
import { CoachError } from '../lib/coach'
import { authStore } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { create, listKind, useRecord } from '../lib/repo'
import { EMPTY_DRAFT } from '../lib/sessions'
import { toastStore } from '../lib/toast'
import type { DayReview as Review, Session } from '../lib/types'
import type { User } from '@supabase/supabase-js'

const review = (over: Partial<Review> = {}): Review => ({
  goed: 'Lang volgehouden zonder pauze.',
  focus: 'Kijk de bocht in.',
  oefening: 'Garlands op een blauwe piste.',
  trickId: 'traverse',
  veiligheid: null,
  createdAt: 1,
  ...over,
})

// zoals in het dagdetail: de dag komt live uit de database
function Detail({ id }: { id: string }) {
  const s = useRecord('session', id)
  return s ? <DayReview session={s} /> : null
}
const show = (id: string) =>
  render(
    <MemoryRouter>
      <Detail id={id} />
    </MemoryRouter>,
  )

/** Review direct in de database zetten, zoals na een eerdere sync. */
async function withReview(r: Review) {
  const next: Session = { ...day, review: r }
  await db.records.put(next)
}

const login = () => authStore.set({ user: { id: 'me' } as User, ready: true })
const logout = () => authStore.set({ user: null, ready: true })

let day: Session
beforeEach(async () => {
  await db.records.clear()
  setCurrentUserId('me')
  login()
  toastStore.set([])
  coach.reviewDay.mockReset()
  day = (await create('session', { ...EMPTY_DRAFT, resortName: 'Tignes', tripId: 'trip1' })) as Session
})
afterEach(() => cleanup())

describe('dagreview', () => {
  it('niet ingelogd en nog geen review: niks tonen', async () => {
    logout()
    const { container } = show(day.id)
    await new Promise((r) => setTimeout(r, 50))
    expect(container.textContent).toBe('')
  })

  it('"Vraag" haalt een review op en bewaart hem bij de dag', async () => {
    const user = userEvent.setup()
    coach.reviewDay.mockResolvedValue(review())
    show(day.id)
    await user.click(await screen.findByRole('button', { name: 'Vraag' }))
    expect(await screen.findByText('Kijk de bocht in.')).toBeTruthy()
    expect(screen.getByText('Garlands op een blauwe piste.')).toBeTruthy()
    expect(screen.queryByText('Let op')).toBeNull()
    expect(((await db.records.get(day.id)) as Session).review?.focus).toBe('Kijk de bocht in.')
  })

  it('fout van de coach: duidelijke melding', async () => {
    const user = userEvent.setup()
    coach.reviewDay.mockRejectedValue(new CoachError('Daglimiet van 60 berichten bereikt. Morgen weer!'))
    show(day.id)
    await user.click(await screen.findByRole('button', { name: 'Vraag' }))
    await waitFor(() => expect(toastStore.get()[0]).toMatchObject({ title: 'Review lukte niet', body: expect.stringMatching(/Daglimiet/) }))
  })

  it('bestaande review blijft zichtbaar, ook uitgelogd (maar dan zonder "Opnieuw")', async () => {
    await withReview(review({ veiligheid: 'Laat je pols checken als het blijft zeuren.' }))
    logout()
    show(day.id)
    expect(await screen.findByText('Kijk de bocht in.')).toBeTruthy()
    expect(screen.getByText('Let op')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Opnieuw' })).toBeNull()
  })

  it('voorgestelde trick als doel zetten, daarna niet nog eens', async () => {
    const user = userEvent.setup()
    await withReview(review())
    show(day.id)
    await user.click(await screen.findByRole('button', { name: /Zet als doel/ }))
    expect(await screen.findByText('Staat al bij je doelen')).toBeTruthy()
    const goals = await listKind('goal')
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({ trickId: 'traverse', tripId: 'trip1', done: false })
  })

  it('geen passende trick: geen doel-knop', async () => {
    await withReview(review({ trickId: null }))
    show(day.id)
    await screen.findByText('Kijk de bocht in.')
    expect(screen.queryByRole('button', { name: /Zet als doel/ })).toBeNull()
  })
})
