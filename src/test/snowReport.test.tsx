// Sneeuw en lawines: elk resort buiten heeft een officieel lawinebericht, de gevarenschaal, sneeuwhoogte in het dal
// en bovenop (Open-Meteo, nagedaan), offline de laatste stand, en het blok op de trippagina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SnowReport } from '../components/SnowReport'
import { bulletinFor, DANGER_LEVELS } from '../content/avalanche'
import { RESORTS } from '../content/resorts'
import { age, cachedSnowpack, loadSnowpack, toCm } from '../lib/snowpack'
import { db, kvSet } from '../lib/db'

const tignes = RESORTS.find((r) => r.id === 'tignes')!
const ischgl = RESORTS.find((r) => r.id === 'ischgl')!
const indoor = RESORTS.find((r) => r.indoor)!

describe('lawinebericht en de schaal', () => {
  it('elk resort buiten heeft een officieel bericht; indoor niet', () => {
    for (const r of RESORTS.filter((x) => !x.indoor)) {
      const b = bulletinFor(r)
      expect(b, r.id).toBeTruthy()
      expect(b!.url).toMatch(/^https:\/\//)
    }
    expect(bulletinFor(indoor)).toBeNull()
    expect(bulletinFor(tignes)!.name).toMatch(/Météo-France/)
    expect(bulletinFor(ischgl)!.url).toBe('https://lawinen.report')
  })

  it('vijf niveaus, elk met uitleg', () => {
    expect(DANGER_LEVELS.map((d) => d.level)).toEqual([1, 2, 3, 4, 5])
    for (const d of DANGER_LEVELS) expect(d.meaning.length).toBeGreaterThan(20)
  })
})

describe('sneeuwhoogte', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(async () => {
    await db.kv.clear()
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => [{ current: { snow_depth: 0.42 } }, { current: { snow_depth: 1.874 } }] }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('in het dal en bovenop: op de hoogte van de onderste en bovenste lift, in cm, en onthouden', async () => {
    const p = await loadSnowpack(tignes)
    expect(p).toMatchObject({ base: 42, top: 187 })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('elevation')).toBe(`${tignes.base},${tignes.top}`)
    expect(url.searchParams.get('current')).toBe('snow_depth')
    expect((await cachedSnowpack('tignes'))?.top).toBe(187)
    expect(await loadSnowpack(indoor)).toBeNull()
  })

  it('omrekenen en hoe oud', () => {
    expect(toCm(0.425)).toBe(43)
    expect(toCm(null)).toBe(0)
    expect(toCm(-1)).toBe(0)
    const now = Date.parse('2027-01-17T12:00:00Z')
    expect(age(now - 10 * 60_000, now)).toBe('net')
    expect(age(now - 3 * 3600_000, now)).toBe('3 uur geleden')
    expect(age(now - 30 * 3600_000, now)).toBe('gisteren')
    expect(age(now - 72 * 3600_000, now)).toBe('3 dagen geleden')
  })

  it('op de trippagina: dal en boven, het bericht, en de schaal open en dicht', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    render(<SnowReport resort={tignes} />)
    const box = screen.getByRole('region', { name: 'Sneeuw en lawines' })
    expect(await within(box).findByText('187 cm')).toBeTruthy()
    expect(within(box).getByText('42 cm')).toBeTruthy()
    expect(within(box).getByText(/Schatting van het weermodel, net/)).toBeTruthy()
    expect(
      within(box)
        .getByRole('link', { name: /Lawinebericht van vandaag/ })
        .getAttribute('href'),
    ).toBe('https://meteofrance.com/meteo-montagne')
    expect(within(box).queryByText('Aanzienlijk')).toBeNull()
    await user.click(within(box).getByRole('button', { name: /Wat betekent het niveau/ }))
    expect(within(box).getByText('Aanzienlijk')).toBeTruthy()
  })

  it('offline: de laatste stand met hoe oud die is, zonder op te halen', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    await kvSet('snowpack:ischgl', { base: 30, top: 120, at: Date.now() - 5 * 3600_000 })
    render(<SnowReport resort={ischgl} />)
    expect(await screen.findByText('120 cm')).toBeTruthy()
    expect(screen.getByText(/5 uur geleden/)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('indoor: geen blok', () => {
    const { container } = render(<SnowReport resort={indoor} />)
    expect(container.innerHTML).toBe('')
  })
})
