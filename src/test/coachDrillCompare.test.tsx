// Coach op Home (drill van de dag) en in toen-en-nu (voor en na). De coach-calls zijn gemockt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({ askDrill: vi.fn(), cachedDrill: vi.fn(), compareClips: vi.fn(), toCoachImage: vi.fn() }))
vi.mock('../lib/coach', async (orig) => ({ ...(await orig<typeof import('../lib/coach')>()), ...api }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))
vi.mock('../lib/ids', async (orig) => ({ ...(await orig<typeof import('../lib/ids')>()), todayISO: () => '2027-01-16' }))

import { DailyDrill } from '../components/DailyDrill'
import { CompareViewer } from '../components/ThenNow'
import { CoachError } from '../lib/coach'
import { authStore } from '../lib/auth'
import { db } from '../lib/db'
import { listKind } from '../lib/repo'
import type { User } from '@supabase/supabase-js'
import type { MediaMeta } from '../lib/types'

const drill = {
  titel: 'Garlands op tempo',
  waarom: 'Je viel veel op de toeside.',
  stappen: ['Rustig', 'Sneller'],
  minuten: 15,
  trickId: 'ollie',
  date: '2027-01-16',
  createdAt: 1,
}
const show = () =>
  render(
    <MemoryRouter>
      <DailyDrill />
    </MemoryRouter>,
  )

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  authStore.set({ user: { id: 'me' } as User, ready: true })
  api.cachedDrill.mockResolvedValue(null)
  api.askDrill.mockResolvedValue(drill)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('drill van de dag', () => {
  it('eerst een knop; daarna de oefening met stappen, minuten-stempel en "Zet als doel"', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: /Geef me een drill/ }))
    expect(api.askDrill).toHaveBeenCalledWith('2027-01-16')
    expect(await screen.findByRole('heading', { name: 'Garlands op tempo' })).toBeTruthy()
    expect(screen.getByText('15 min').className).toContain('slap')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1Rustig', '2Sneller'])
    expect(screen.getByRole('link', { name: /Ollie/ }).getAttribute('href')).toBe('/tricks/ollie')
    await user.click(screen.getByRole('button', { name: /Zet als doel/ }))
    await waitFor(async () => expect((await listKind('goal')).map((g) => g.trickId)).toEqual(['ollie']))
    expect(await screen.findByText('Staat bij je doelen')).toBeTruthy()
  })

  it('al opgehaald vandaag: meteen zichtbaar, geen nieuwe call', async () => {
    api.cachedDrill.mockResolvedValue(drill)
    show()
    expect(await screen.findByRole('heading', { name: 'Garlands op tempo' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Geef me een drill/ })).toBeNull()
    expect(api.askDrill).not.toHaveBeenCalled()
  })

  it('fout van de coach: uitleg en de knop blijft', async () => {
    const user = userEvent.setup()
    api.askDrill.mockRejectedValue(new CoachError('Het Anthropic-tegoed van de coach is op.'))
    show()
    await user.click(await screen.findByRole('button', { name: /Geef me een drill/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('tegoed')
    expect(screen.getByRole('button', { name: /Geef me een drill/ })).toBeTruthy()
  })

  it('niet ingelogd en nog geen drill: niks tonen', async () => {
    authStore.set({ user: null, ready: true })
    const { container } = show()
    await waitFor(() => expect(api.cachedDrill).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
})

describe('voor en na', () => {
  const media = (id: string, createdAt: number) =>
    ({ id, kind: 'media', type: 'image', mime: 'image/jpeg', trickId: 'ollie', createdAt, updatedAt: 0, userId: 'me' }) as MediaMeta
  const tn = { trickId: 'ollie', then: media('a', 0), now: media('b', 1), days: 40, count: 2 }
  const pic = { mediaType: 'image/jpeg' as const, data: 'x' }
  beforeEach(async () => {
    await db.blobs.clear()
    await db.blobs.bulkPut([
      { id: 'a', blob: new Blob(['x'], { type: 'image/jpeg' }) },
      { id: 'b', blob: new Blob(['x'], { type: 'image/jpeg' }) },
    ])
    let n = 0
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} }))
  })

  it('de coach vergelijkt de twee beelden; de uitslag blijft bewaard', async () => {
    const user = userEvent.setup()
    api.toCoachImage.mockReturnValue(pic)
    api.compareClips.mockResolvedValue({ beter: 'Knieën lager.', nogWerk: 'Blik omhoog.', drill: 'Garlands.' })
    // geladen foto's doen alsof ze een maat hebben
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(800)
    const { unmount } = render(<CompareViewer tn={tn} name="Ollie" onClose={() => {}} />)
    await screen.findAllByRole('img')
    await user.click(await screen.findByRole('button', { name: /Laat de coach vergelijken/ }))
    await waitFor(() => expect(api.compareClips).toHaveBeenCalledWith('ollie', pic, pic, 40))
    const result = await screen.findByRole('region', { name: 'Coach: voor en na' })
    expect(result.textContent).toContain('Knieën lager.')
    unmount()
    render(<CompareViewer tn={tn} name="Ollie" onClose={() => {}} />)
    expect((await screen.findByRole('region', { name: 'Coach: voor en na' })).textContent).toContain('Blik omhoog.')
    expect(screen.queryByRole('button', { name: /Laat de coach vergelijken/ })).toBeNull()
  })

  it('clips nog niet geladen: nette melding, geen call', async () => {
    const user = userEvent.setup()
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)
    render(<CompareViewer tn={tn} name="Ollie" onClose={() => {}} />)
    await screen.findAllByRole('img')
    await user.click(await screen.findByRole('button', { name: /Laat de coach vergelijken/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('nog niet geladen')
    expect(api.compareClips).not.toHaveBeenCalled()
  })
})
