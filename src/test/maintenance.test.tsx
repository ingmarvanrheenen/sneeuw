// Gear-onderhoud: dagen op de plank sinds je laatste wax of slijpbeurt, alleen voor je eigen boards, op de
// gear-pagina met "Gedaan", en een rij op Home als het tijd is.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import GearPage from '../pages/Gear'
import Home from '../pages/Home'
import { daysSince, dueFor, dueNow, dueText, needsCare } from '../lib/maintenance'
import { create, listKind } from '../lib/repo'
import { db } from '../lib/db'
import { EMPTY_DRAFT } from '../lib/sessions'
import { todayISO } from '../lib/ids'
import type { Gear, Session } from '../lib/types'

const day = (date: string, over: Partial<Session> = {}) =>
  ({ ...EMPTY_DRAFT, id: date + (over.id ?? ''), kind: 'session', date, createdAt: 0, updatedAt: 0, ...over }) as Session
const board = (over: Partial<Gear> = {}) =>
  ({
    id: 'b1',
    kind: 'gear',
    gearKind: 'board',
    name: 'Custom',
    brand: 'Burton',
    owned: 'eigen',
    createdAt: new Date('2027-01-01T08:00:00').getTime(),
    updatedAt: 0,
    ...over,
  }) as Gear

describe('onderhoud: logica', () => {
  const days = ['2027-01-02', '2027-01-03', '2027-01-03', '2027-01-05', '2027-01-06', '2027-01-08'].map((d, i) => day(d, { id: String(i) }))

  it('dagen op de plank na een datum; dubbel gelogd telt één keer, weggegooid niet', () => {
    expect(daysSince(days, '2027-01-01')).toBe(5)
    expect(daysSince(days, '2027-01-03')).toBe(3)
    expect(daysSince([...days, day('2027-01-09', { deleted: true })], '2027-01-01')).toBe(5)
  })

  it('vanaf het toevoegen van je board, of vanaf je laatste keer', () => {
    const [wax, edges] = dueFor(board(), days)
    expect(wax).toMatchObject({ task: 'wax', days: 5, every: 5, due: true })
    expect(edges).toMatchObject({ task: 'edges', days: 5, every: 15, due: false })
    const after = dueFor(board({ care: { wax: '2027-01-06' } }), days)
    expect(after[0]).toMatchObject({ days: 1, due: false, last: '2027-01-06' })
  })

  it('alleen eigen boards; wat het meest over tijd is eerst', () => {
    expect(needsCare(board())).toBe(true)
    expect(needsCare(board({ owned: 'huur' }))).toBe(false)
    expect(needsCare(board({ owned: 'wishlist' }))).toBe(false)
    expect(needsCare(board({ gearKind: 'boots' }))).toBe(false)
    expect(needsCare(board({ deleted: true }))).toBe(false)
    const many = Array.from({ length: 16 }, (_, i) => day(`2027-02-${String(i + 1).padStart(2, '0')}`))
    const now = dueNow(
      [
        board({ id: 'oud', care: { wax: '2027-02-14', edges: '2027-02-14' } }),
        board({ id: 'nieuw' }),
        board({ id: 'huur', owned: 'huur' }),
      ],
      many,
    )
    expect(now.map((x) => `${x.gear.id}:${x.due.task}`)).toEqual(['nieuw:wax', 'nieuw:edges'])
  })

  it('tekst: hoe lang geleden en wat er nog over is', () => {
    expect(dueText({ task: 'wax', label: 'Waxen', days: 6, every: 5, due: true })).toBe('6 dagen op de plank geleden, tijd ervoor')
    expect(dueText({ task: 'edges', label: 'Edges slijpen', days: 14, every: 15, due: false })).toBe(
      '14 dagen op de plank geleden, nog 1 dag',
    )
    expect(dueText({ task: 'wax', label: 'Waxen', days: 1, every: 5, due: false })).toBe('1 dag op de plank geleden, nog 4 dagen')
  })
})

describe('onderhoud in de app', () => {
  beforeEach(async () => {
    await db.records.clear()
    await db.kv.clear()
  })
  afterEach(() => cleanup())

  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/gear" element={<GearPage />} />
        </Routes>
      </MemoryRouter>,
    )
  /** een eigen board van een week geleden, en `n` dagen op de plank daarna */
  async function seed(n: number) {
    const start = Date.now() - 30 * 864e5
    await create('gear', { gearKind: 'board', name: 'Custom', brand: 'Burton', owned: 'eigen' })
    const [g] = await listKind('gear')
    await db.records.put({ ...g, createdAt: start })
    for (let i = 0; i < n; i++) await create('session', { ...EMPTY_DRAFT, date: todayISO(new Date(start + (i + 1) * 864e5)) })
  }

  it('gear-pagina: waxen is tijd, edges nog niet; gedaan zet de teller op nul', async () => {
    const user = userEvent.setup()
    await seed(6)
    at('/gear')
    const wax = await screen.findByRole('group', { name: 'Waxen Burton Custom' })
    expect(within(wax).getByText('6 dagen op de plank geleden, tijd ervoor')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Edges slijpen Burton Custom' })).getByText(/nog 9 dagen/)).toBeTruthy()
    await user.click(within(wax).getByRole('button', { name: 'Gedaan' }))
    await waitFor(async () => expect((await listKind('gear'))[0].care?.wax).toBe(todayISO()))
    expect(await within(screen.getByRole('group', { name: 'Waxen Burton Custom' })).findByText(/nog 5 dagen/)).toBeTruthy()
  })

  it('home: een rij als het tijd is, anders niet', async () => {
    await seed(6)
    at('/')
    const row = await screen.findByRole('link', { name: /Waxen: Burton Custom/ })
    expect(row.getAttribute('href')).toBe('/gear')
    cleanup()
    await db.records.clear()
    await seed(2)
    at('/')
    await screen.findByRole('link', { name: /Trick-roulette/ })
    expect(screen.queryByRole('link', { name: /Waxen/ })).toBeNull()
  })

  it('geen eigen board: geen onderhoud', async () => {
    await create('gear', { gearKind: 'board', name: 'Huurplank', owned: 'huur' })
    at('/gear')
    await screen.findByText('Huurplank')
    expect(screen.queryByText('Onderhoud')).toBeNull()
  })
})
