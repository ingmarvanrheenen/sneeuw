// Eerste keer openen: "Zo begin je" op Home. Stappen vinken zichzelf af uit je data, de lijst verdwijnt als
// alles af is of als je hem verbergt, en zonder server is er geen crew-stap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const backend = vi.hoisted(() => ({ on: true }))
vi.mock('../lib/supabase', () => ({
  supabase: null,
  get hasBackend() {
    return backend.on
  },
  backendInfo: {},
  MEDIA_BUCKET: 'media',
}))

import { StartSteps } from '../components/StartSteps'
import { startSteps, startHidden } from '../lib/onboarding'
import { create } from '../lib/repo'
import { saveProfile, getProfile } from '../lib/auth'
import { db, kvSet } from '../lib/db'
import { EMPTY_DRAFT } from '../lib/sessions'

describe('stappen', () => {
  const base = { hasPass: false, days: 0, tricks: 0, crews: 0, backend: true }
  it('vier stappen, elk af door wat je echt deed', () => {
    expect(startSteps(base).map((s) => [s.id, s.done])).toEqual([
      ['pas', false],
      ['dag', false],
      ['trick', false],
      ['crew', false],
    ])
    expect(startSteps({ hasPass: true, days: 2, tricks: 1, crews: 1, backend: true }).every((s) => s.done)).toBe(true)
    expect(startSteps(base).map((s) => s.to)).toEqual(['/rider/ik', '/log/nieuw', '/tricks', '/crew'])
  })

  it('zonder server geen crew-stap', () => {
    expect(startSteps({ ...base, backend: false }).map((s) => s.id)).toEqual(['pas', 'dag', 'trick'])
  })
})

describe('zo begin je op Home', () => {
  beforeEach(async () => {
    await db.records.clear()
    await db.kv.clear()
    startHidden.set(false)
    backend.on = true
  })
  afterEach(() => cleanup())
  const show = () =>
    render(
      <MemoryRouter>
        <StartSteps />
      </MemoryRouter>,
    )

  it('nieuw: alle stappen als links, en wat je al deed staat afgevinkt', async () => {
    await create('session', { ...EMPTY_DRAFT, date: '2027-01-10' })
    show()
    const box = await screen.findByRole('region', { name: 'Zo begin je' })
    expect(
      within(box)
        .getByRole('link', { name: /Maak je skipas/ })
        .getAttribute('href'),
    ).toBe('/rider/ik')
    expect(within(box).queryByRole('link', { name: /Log je eerste dag/ })).toBeNull()
    expect(within(box).getByText('Gedaan')).toBeTruthy()
    expect(within(box).getByText('1 van 4 gedaan')).toBeTruthy()
  })

  it('alles af: weg', async () => {
    await saveProfile({ ...(await getProfile()), displayName: 'Sam' })
    await create('session', { ...EMPTY_DRAFT, date: '2027-01-10' })
    await create('trick', { trickId: 'ollie', status: 'bezig', mediaIds: [] })
    await kvSet('crews', [{ id: 'c1', name: 'Shred' }])
    show()
    // wacht tot de data er is: dan blijft hij leeg
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('region', { name: 'Zo begin je' })).toBeNull()
  })

  it('verbergen blijft verborgen, ook na opnieuw openen', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Verberg' }))
    expect(screen.queryByRole('region', { name: 'Zo begin je' })).toBeNull()
    cleanup()
    startHidden.set(false)
    show()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('region', { name: 'Zo begin je' })).toBeNull()
  })

  it('zonder server: drie stappen', async () => {
    backend.on = false
    show()
    await waitFor(() => expect(screen.getByText('0 van 3 gedaan')).toBeTruthy())
    expect(screen.queryByText('Join je crew')).toBeNull()
  })
})
