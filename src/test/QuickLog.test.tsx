import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))

import { QuickLog } from '../components/QuickLog'
import { authStore } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db, kvSet } from '../lib/db'
import { create, getTrickProgress, listKind, setTrickStatus } from '../lib/repo'
import { EMPTY_DRAFT } from '../lib/sessions'
import { todayISO } from '../lib/ids'
import type { Session } from '../lib/types'
import type { User } from '@supabase/supabase-js'

function FullEditor() {
  const loc = useLocation()
  return <pre data-testid="draft">{JSON.stringify((loc.state as { draft?: unknown })?.draft ?? null)}</pre>
}

function setup() {
  const onClose = vi.fn()
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<QuickLog open onClose={onClose} />} />
        <Route path="/log/nieuw" element={<FullEditor />} />
      </Routes>
    </MemoryRouter>,
  )
  return { onClose, user: userEvent.setup() }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  setCurrentUserId('me')
  authStore.set({ user: { id: 'me' } as User, ready: true })
  await create('session', { ...EMPTY_DRAFT, date: daysAgo(2), resortName: 'Tignes', resortId: 'tignes', hours: 5 })
})
afterEach(() => cleanup())

const dialog = () => screen.getByRole('dialog')

describe('snel loggen', () => {
  it('staat al ingevuld met de plek en uren van je vorige dag; één tik bewaart', async () => {
    const { onClose, user } = setup()
    expect(await screen.findByText('Tignes')).toBeTruthy()
    expect(within(dialog()).getByText('5')).toBeTruthy()
    await user.click(within(dialog()).getByRole('button', { name: /Opslaan/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const today = (await listKind('session')).find((s) => s.date === todayISO()) as Session
    expect(today).toMatchObject({ resortName: 'Tignes', hours: 5, mood: 4, falls: 0 })
  })

  it('mood, uren en valpartijen met grote knoppen', async () => {
    const { user } = setup()
    await screen.findByText('Tignes')
    await user.click(within(dialog()).getByRole('button', { name: /Episch/ }))
    const [minder, meer] = [
      within(dialog()).getAllByRole('button', { name: 'Minder' }),
      within(dialog()).getAllByRole('button', { name: 'Meer' }),
    ]
    await user.click(minder[0]) // uren 5 -> 4.5
    await user.click(meer[1])
    await user.click(meer[1]) // 2x gevallen
    await user.click(within(dialog()).getByRole('button', { name: /Opslaan/ }))
    await waitFor(async () => expect((await listKind('session')).some((s) => s.date === todayISO())).toBe(true))
    const today = (await listKind('session')).find((s) => s.date === todayISO())!
    expect(today).toMatchObject({ mood: 5, hours: 4.5, falls: 2 })
  })

  it('tricks waar je mee bezig bent: één tik = vandaag geland', async () => {
    await setTrickStatus('ollie', 'bezig')
    const { user } = setup()
    await user.click(await within(dialog()).findByRole('button', { name: /Ollie/ }))
    await user.click(within(dialog()).getByRole('button', { name: /Opslaan/ }))
    await waitFor(async () => expect((await getTrickProgress('ollie'))?.status).toBe('geland'))
  })

  it('deelt standaard met je vorige crew, maar je kunt het uitzetten', async () => {
    await kvSet('crews', [{ id: 'c1', name: 'Shredheads', invite_code: 'ABC123', created_by: 'me' }])
    await kvSet('lastCrewId', 'c1')
    const { user } = setup()
    const sw = await within(dialog()).findByRole('switch', { name: /Delen met Shredheads/ })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await user.click(sw)
    await user.click(within(dialog()).getByRole('button', { name: /Opslaan/ }))
    await waitFor(async () => expect((await listKind('session')).some((s) => s.date === todayISO())).toBe(true))
    expect((await listKind('session')).find((s) => s.date === todayISO())?.crewId).toBeNull()
  })

  it('"Meer invullen" neemt wat je koos mee naar het volledige scherm', async () => {
    const { user } = setup()
    await screen.findByText('Tignes')
    await user.click(within(dialog()).getByRole('button', { name: /Episch/ }))
    await user.click(within(dialog()).getByRole('button', { name: /Meer invullen/ }))
    const draft = JSON.parse((await screen.findByTestId('draft')).textContent!)
    expect(draft).toMatchObject({ resortName: 'Tignes', mood: 5 })
  })

  it('plek wijzigen via de lijst met skigebieden', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Tignes/ }))
    await user.click(await screen.findByRole('button', { name: /Val Thorens/ }))
    expect(await within(dialog()).findByText('Val Thorens')).toBeTruthy()
  })
})
