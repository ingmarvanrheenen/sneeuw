// Home in park-stijl: je level als poster met sticker, en je seizoen in drie cijfers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const day = vi.hoisted(() => ({ today: '2027-01-16' }))
vi.mock('../lib/ids', async (orig) => ({ ...(await orig<typeof import('../lib/ids')>()), todayISO: () => day.today }))

import Home from '../pages/Home'
import { Segments } from '../components/Poster'
import { create } from '../lib/repo'
import { db } from '../lib/db'
import { EMPTY_DRAFT } from '../lib/sessions'

const log = (date: string, over = {}) => create('session', { ...EMPTY_DRAFT, date, resortName: 'Tignes', mood: 4, ...over })
const home = () =>
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/stats" element={<div>statspagina</div>} />
        <Route path="/badges" element={<div>badgespagina</div>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
})
afterEach(() => cleanup())

describe('home', () => {
  it('level-poster met het seizoen, en de sticker met je level', async () => {
    await log('2027-01-10', { hours: 5, falls: 3 })
    home()
    const poster = await screen.findByRole('button', { name: /^Level \d+, .+, \d+ XP$/ })
    expect(within(poster).getByText('Seizoen 26/27')).toBeTruthy()
    expect(within(poster).getByText(/Level/).closest('.slap')).toBeTruthy()
    expect(within(poster).getByRole('progressbar')).toBeTruthy()
  })

  it('dit seizoen in cijfers: dagen, uren en slams; vorig seizoen telt niet mee', async () => {
    await log('2027-01-10', { hours: 5.5, falls: 3 })
    await log('2027-01-11', { hours: 4, falls: 7 })
    await log('2026-03-01', { hours: 6, falls: 20 }) // seizoen 25/26
    home()
    const cells = await screen.findByRole('button', { name: 'Je seizoen in cijfers' })
    expect(await within(cells).findByText('2')).toBeTruthy()
    expect(within(cells).getByText('9,5')).toBeTruthy()
    expect(within(cells).getByText('10')).toBeTruthy()
    expect(within(cells).getByText('slams').parentElement?.className).toContain('bg-hot')
  })

  it('tikken op de cijfers opent je stats, op de poster je badges', async () => {
    const user = userEvent.setup()
    home()
    await user.click(await screen.findByRole('button', { name: 'Je seizoen in cijfers' }))
    expect(screen.getByText('statspagina')).toBeTruthy()
    cleanup()
    home()
    await user.click(await screen.findByRole('button', { name: /^Level / }))
    expect(screen.getByText('badgespagina')).toBeTruthy()
  })
})

describe('segmentbalk', () => {
  it('vult het deel dat je gehaald hebt, afgerond op hele blokjes', () => {
    const { container } = render(<Segments value={0.62} count={12} />)
    expect(container.querySelectorAll('.grow')).toHaveLength(7)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('62')
  })
})
