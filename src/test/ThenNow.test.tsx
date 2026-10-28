import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Vault from '../pages/Vault'
import TrickDetail from '../pages/TrickDetail'
import { ThenNowCard } from '../components/ThenNow'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { create, setTrickStatus } from '../lib/repo'
import { thenAndNow } from '../lib/thenNow'
import type { MediaMeta } from '../lib/types'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 11, 1, 12)

async function clip(trickId: string, day: number, type: 'video' | 'image' = 'video') {
  const m = await create('media', {
    type,
    mime: type === 'video' ? 'video/mp4' : 'image/jpeg',
    trickId,
    thumb: 'data:image/png;base64,AAAA',
  })
  const rec = { ...m, createdAt: T0 + day * DAY }
  await db.records.put(rec)
  await db.blobs.put({ id: m.id, blob: new Blob(['x'], { type: m.mime }) })
  return rec as MediaMeta
}

beforeEach(async () => {
  await db.records.clear()
  await db.blobs.clear()
  setCurrentUserId('me')
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('toen en nu', () => {
  it('kaart met toen en nu; vergelijken toont beide met datum, en samen afspelen start ze allebei vanaf het begin', async () => {
    const user = userEvent.setup()
    const a = await clip('ollie', 0)
    const b = await clip('ollie', 45)
    const tn = thenAndNow([a, b], 'ollie')!
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    render(<ThenNowCard tn={tn} />)
    const card = screen.getByRole('button', { name: /Toen en nu: Ollie, 6 weken later/ })
    expect(within(card).getByText('Toen')).toBeTruthy()
    expect(within(card).getByText('Nu')).toBeTruthy()
    expect(within(card).getByText('Toen 1 dec, nu 6 weken later')).toBeTruthy()
    await user.click(card)
    const view = screen.getByRole('dialog', { name: 'Toen en nu: Ollie' })
    const then = await within(view).findByLabelText(/^Toen · 1 dec/)
    const now = await within(view).findByLabelText(/^Nu · 15 jan/)
    ;(then as HTMLVideoElement).currentTime = 3
    await user.click(within(view).getByRole('button', { name: /Samen afspelen/ }))
    expect(play).toHaveBeenCalledTimes(2)
    expect((then as HTMLVideoElement).currentTime).toBe(0)
    expect(now.tagName).toBe('VIDEO')
    await user.click(within(view).getByRole('button', { name: 'Sluiten' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("twee foto's: geen afspeelknop", async () => {
    const user = userEvent.setup()
    const tn = thenAndNow([await clip('shifty', 0, 'image'), await clip('shifty', 3, 'image')], 'shifty')!
    render(<ThenNowCard tn={tn} />)
    await user.click(screen.getByRole('button', { name: /Toen en nu: Shifty/ }))
    const view = screen.getByRole('dialog')
    expect(await within(view).findByRole('img', { name: /^Toen/ })).toBeTruthy()
    expect(within(view).queryByRole('button', { name: /Samen afspelen/ })).toBeNull()
  })

  it('kluis: rij met toen en nu, alleen voor tricks met twee of meer clips', async () => {
    await setTrickStatus('ollie', 'geland')
    await setTrickStatus('nollie', 'geland')
    await clip('ollie', 0)
    await clip('ollie', 30)
    await clip('nollie', 2)
    render(
      <MemoryRouter>
        <Vault />
      </MemoryRouter>,
    )
    const sec = (await screen.findByRole('heading', { name: 'Toen en nu' })).closest('section') as HTMLElement
    await waitFor(() => expect(within(sec).getAllByRole('button')).toHaveLength(1))
    expect(within(sec).getByRole('button', { name: /Ollie, 4 weken later/ })).toBeTruthy()
  })

  it('kluis zonder dubbele clips: geen lege rij', async () => {
    await setTrickStatus('ollie', 'geland')
    await clip('ollie', 0)
    render(
      <MemoryRouter>
        <Vault />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/van \d+ tricks geland/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Toen en nu' })).toBeNull()
  })

  it('trickpagina: toen en nu boven je clips zodra er twee zijn', async () => {
    await clip('ollie', 0)
    await clip('ollie', 10)
    render(
      <MemoryRouter initialEntries={['/tricks/ollie']}>
        <Routes>
          <Route path="/tricks/:id" element={<TrickDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: /Toen en nu: Ollie, 10 dagen later/ })).toBeTruthy()
  })
})
