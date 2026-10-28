import { describe, expect, it } from 'vitest'
import { seasonOf, seasonsWithData, wrapped } from '../lib/wrapped'
import type { ProgressInput } from '../lib/progress'
import type { Session } from '../lib/types'
import { EMPTY_DRAFT } from '../lib/sessions'

const base: ProgressInput = {
  sessions: [],
  tricks: [],
  goals: [],
  media: [],
  gear: [],
  trips: [],
  quizBest: 0,
  quizCorrect: 0,
  inCrew: false,
}
const day = (date: string, over: Partial<Session> = {}): Session =>
  ({
    ...EMPTY_DRAFT,
    id: date + Math.random(),
    kind: 'session',
    createdAt: 0,
    updatedAt: 0,
    date,
    resortName: 'Tignes',
    hours: 5,
    falls: 2,
    mood: 3,
    ...over,
  }) as Session
const card = (cards: ReturnType<typeof wrapped>, id: string) => cards.find((c) => c.id === id)

describe('seizoenen', () => {
  it('juli t/m juni hoort bij één seizoen', () => {
    expect(seasonOf('2026-12-20')).toBe('26/27')
    expect(seasonOf('2027-04-02')).toBe('26/27')
    expect(seasonOf('2027-07-01')).toBe('27/28')
    expect(seasonOf('2026-06-30')).toBe('25/26')
  })

  it('seizoenen met data, nieuwste eerst; verwijderde dagen tellen niet', () => {
    expect(seasonsWithData([day('2025-12-01'), day('2027-01-05'), day('2026-12-20'), day('2028-01-01', { deleted: true })])).toEqual([
      '26/27',
      '25/26',
    ])
  })
})

describe('season wrapped', () => {
  const season = [
    day('2026-12-20', { hours: 6, falls: 9, mood: 3, pistes: ['blauw'], snow: 'groomed', buddies: ['Daan'], landed: ['ollie'] }),
    day('2026-12-21', {
      hours: 7.5,
      falls: 1,
      mood: 5,
      pistes: ['rood', 'zwart'],
      snow: 'poeder',
      buddies: ['Daan', 'Sem'],
      highlight: 'Eerste poederrun',
      landed: ['ollie', 'nollie'],
    }),
    day('2027-02-14', { hours: 4, falls: 22, mood: 4, pistes: ['rood'], snow: 'poeder', resortName: 'Ischgl', buddies: ['Daan'] }),
    // ander seizoen telt niet mee
    day('2025-12-01', { hours: 100, falls: 100 }),
  ]
  const cards = wrapped({ ...base, sessions: season }, '26/27')

  it('begint met het seizoen en eindigt met je level', () => {
    expect(cards[0]).toMatchObject({ id: 'intro', big: '26/27', body: '3 dagen op de plank, 2 resorts. Tik om door te gaan.' })
    expect(cards.at(-1)).toMatchObject({ id: 'outro', title: 'tot volgend seizoen' })
  })

  it('uren en valpartijen, met je langste en je zwaarste dag', () => {
    expect(card(cards, 'uren')).toMatchObject({ big: '17,5', body: 'Dat zijn 9 films. Je langste dag: 7,5 u in Tignes.' })
    expect(card(cards, 'vallen')).toMatchObject({ big: '32', body: 'Op 14 feb 22 keer in Ischgl. En je stond elke keer weer op.' })
  })

  it('tricks: elke trick één keer, met de eerste van het seizoen', () => {
    expect(card(cards, 'tricks')).toMatchObject({ big: '2', title: 'tricks geland', body: 'De eerste: Ollie, op 20 dec.' })
  })

  it('beste dag: hoogste mood, met je highlight', () => {
    expect(card(cards, 'beste-dag')).toMatchObject({ big: '21 dec', body: 'Tignes, 7,5 u, mood: Episch. "Eerste poederrun"' })
  })

  it('je kleur, je sneeuw, je maat en je berg', () => {
    expect(card(cards, 'piste')).toMatchObject({ big: 'Rood', body: '2 dagen op rode pistes. En 1 dag zwart.' })
    expect(card(cards, 'sneeuw')).toMatchObject({ big: 'Poeder', body: 'Je zocht de poeder op, en vond hem. 2 dagen.' })
    expect(card(cards, 'maat')).toMatchObject({ big: 'Daan', body: '3 dagen samen op de plank.' })
    expect(card(cards, 'berg')).toMatchObject({ big: 'Tignes', body: '2 dagen. Ook geweest: Ischgl.' })
  })

  it('wat er niet is, komt er niet in; nul keer vallen krijgt een plaagstoot', () => {
    const c = wrapped({ ...base, sessions: [day('2026-12-20', { falls: 0, pistes: [], buddies: [], snow: undefined })] }, '26/27')
    expect(c.map((x) => x.id)).toEqual(['intro', 'uren', 'vallen', 'beste-dag', 'berg', 'outro'])
    expect(card(c, 'vallen')?.body).toBe('Nul keer gevallen. Probeerde je wel iets nieuws?')
    expect(card(c, 'berg')?.body).toBe('1 dag, allemaal hier.')
    expect(card(c, 'intro')?.body).toBe('1 dag op de plank, 1 resort. Tik om door te gaan.')
  })

  it('leeg seizoen: geen kaarten', () => {
    expect(wrapped({ ...base, sessions: season }, '30/31')).toEqual([])
  })

  it('geen emoji in de teksten', () => {
    for (const c of cards) expect(`${c.big} ${c.title} ${c.body}`).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
