import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Badges from '../pages/Badges'
import { Medal } from '../design/Medal'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { create } from '../lib/repo'
import { EMPTY_DRAFT } from '../lib/sessions'
import { BADGES } from '../lib/progress'

const RARE = BADGES.filter((b) => b.rare)
const show = () =>
  render(
    <MemoryRouter>
      <Badges />
    </MemoryRouter>,
  )
const rareSection = async () => (await screen.findByRole('heading', { name: /^Zeldzaam/ })).closest('section') as HTMLElement

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  setCurrentUserId('me')
})
afterEach(() => cleanup())

describe('zeldzame stickers op de badgepagina', () => {
  it('nog niks gehaald: alleen hints, geen namen of uitleg', async () => {
    show()
    const sec = await rareSection()
    expect(within(sec).getByRole('heading').textContent).toBe(`Zeldzaam 0/${RARE.length}`)
    expect(within(sec).getAllByText('Geheim')).toHaveLength(RARE.length)
    expect(within(sec).getByText('Pauze is voor skiërs.')).toBeTruthy()
    for (const b of RARE) {
      expect(within(sec).queryByText(b.name)).toBeNull()
      expect(within(sec).queryByText(b.desc)).toBeNull()
    }
    // gewone badges tellen apart
    const normal = BADGES.length - RARE.length
    expect(screen.getByRole('heading', { name: `Badges 0/${normal}` })).toBeTruthy()
  })

  it('gehaald: naam en uitleg in beeld, de rest blijft geheim', async () => {
    await create('session', { ...EMPTY_DRAFT, date: '2026-12-20', resortName: 'Tignes', hours: 8, pistes: ['blauw'] })
    show()
    const sec = await rareSection()
    expect(await within(sec).findByText('Eerste tot laatste lift')).toBeTruthy()
    expect(within(sec).getByText('8 uur of meer op een dag')).toBeTruthy()
    expect(within(sec).queryByText('Pauze is voor skiërs.')).toBeNull()
    expect(within(sec).getAllByText('Geheim')).toHaveLength(RARE.length - 1)
    expect(within(sec).getByRole('heading').textContent).toBe(`Zeldzaam 1/${RARE.length}`)
  })
})

describe('medaille', () => {
  it('zeldzaam op slot: een vraagteken in plaats van het icoon; gehaald: met sterretje', () => {
    const { container, rerender } = render(<Medal icon="lift" unlocked={false} rare />)
    expect(container.querySelector('[data-rare="geheim"]')?.textContent).toBe('?')
    rerender(<Medal icon="lift" mark="8u" unlocked rare />)
    const m = container.querySelector('[data-rare="gehaald"]')!
    expect(m.textContent).toBe('8u')
    // icoon plus sterretje
    expect(m.querySelectorAll('svg').length).toBeGreaterThanOrEqual(3)
  })
})
