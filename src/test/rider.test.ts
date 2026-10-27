import { describe, expect, it } from 'vitest'
import {
  BOARD_SLOTS,
  barcode,
  boardStickers,
  nextSticker,
  passNumber,
  riderStats,
  seasonFor,
  stickerBook,
  stickerSlot,
  trickPiste,
} from '../lib/rider'
import { computeProgress } from '../lib/useProgress'
import { TRICKS } from '../content/tricks'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { ProgressInput } from '../lib/progress'
import type { Session, TrickProgress } from '../lib/types'

const day = (date: string, over: Partial<Session>): Session =>
  ({ ...EMPTY_DRAFT, id: date, kind: 'session', createdAt: 0, updatedAt: 0, userId: null, date, ...over }) as Session
const trick = (trickId: string, status: TrickProgress['status']): TrickProgress =>
  ({ id: trickId, kind: 'trick', trickId, status, mediaIds: [], createdAt: 0, updatedAt: 0, userId: null }) as unknown as TrickProgress

const input = (over: Partial<ProgressInput>): ProgressInput => ({
  sessions: [],
  tricks: [],
  goals: [],
  media: [],
  gear: [],
  trips: [],
  quizBest: 0,
  quizCorrect: 0,
  inCrew: false,
  ...over,
})

describe('riderStats', () => {
  it('telt de eerlijke stats uit je logboek', () => {
    const s = riderStats(
      computeProgress(
        input({
          sessions: [
            day('2027-01-17', { hours: 6, falls: 3, pistes: ['blauw', 'rood'] }),
            day('2027-01-16', { hours: 4, falls: 12, pistes: ['rood'] }),
            day('2027-01-15', { hours: 2, falls: 1, pistes: ['groen'] }),
          ],
          tricks: [trick('ollie', 'geland'), trick('shifty', 'beheerst'), trick('butter', 'bezig'), trick('ollie', 'geland')],
        }),
      ),
    )
    expect(s).toMatchObject({ days: 3, hours: 12, falls: 16, bestDay: 6, worstFalls: 12, firstRed: '2027-01-16', tricksLanded: 3 })
    expect(s.landed.sort()).toEqual(['ollie', 'shifty'])
    expect(s.badgeIds.length).toBe(s.badges)
    expect(s.levelName).toBeTruthy()
  })

  it('leeg logboek: alles nul, geen rode piste', () => {
    const s = riderStats(computeProgress(input({})))
    expect(s).toMatchObject({ days: 0, bestDay: 0, worstFalls: 0, landed: [], levelName: 'Groentje' })
    expect(s.firstRed).toBeUndefined()
  })
})

describe('skipas', () => {
  it('seizoen loopt van juli tot juni, geldig t/m 30 april', () => {
    expect(seasonFor(new Date(2026, 9, 27))).toEqual({ label: '26/27', until: '2027-04-30' })
    expect(seasonFor(new Date(2027, 1, 3))).toEqual({ label: '26/27', until: '2027-04-30' })
    expect(seasonFor(new Date(2027, 6, 1))).toEqual({ label: '27/28', until: '2028-04-30' })
  })

  it('pasnummer uit je user-id, of lokaal zonder account', () => {
    expect(passNumber('a1b2c3d4-0000-4000-8000-000000000000')).toBe('A1B2 C3D4')
    expect(passNumber(null)).toBe('LOKAAL')
  })

  it('streepjescode is vast per pas en verschilt per rider', () => {
    expect(barcode('a')).toEqual(barcode('a'))
    expect(barcode('a')).not.toEqual(barcode('b'))
    expect(barcode('a').every((w) => w >= 1 && w <= 3)).toBe(true)
  })
})

describe('stickerboek', () => {
  it('alle tricks per track, met wat je verdiend hebt', () => {
    const book = stickerBook(['ollie', 'shifty', 'bestaat-niet'])
    expect(book.total).toBe(TRICKS.length)
    expect(book.landed).toBe(2)
    expect(book.tracks.reduce((n, t) => n + t.stickers.length, 0)).toBe(TRICKS.length)
    const flat = book.tracks.flatMap((t) => t.stickers)
    expect(flat.find((s) => s.trick.id === 'ollie')?.landed).toBe(true)
    expect(flat.filter((s) => s.landed)).toHaveLength(2)
  })

  it('board: moeilijkste eerst; vol = laatste plek wordt "+N"', () => {
    const ids = TRICKS.map((t) => t.id)
    const few = boardStickers(['ollie', ids[0]])
    expect(few.more).toBe(0)
    expect(few.shown[0].level).toBeGreaterThanOrEqual(few.shown[1].level)
    const full = boardStickers(ids.slice(0, BOARD_SLOTS.length))
    expect(full).toMatchObject({ more: 0 })
    expect(full.shown).toHaveLength(BOARD_SLOTS.length)
    const over = boardStickers(ids)
    expect(over.shown).toHaveLength(BOARD_SLOTS.length - 1)
    expect(over.more).toBe(ids.length - (BOARD_SLOTS.length - 1))
    expect(over.shown.every((t, i, a) => i === 0 || a[i - 1].level >= t.level)).toBe(true)
  })

  it('stickers zitten vast per trick, binnen het board, licht scheef', () => {
    expect(stickerSlot(2, 'ollie')).toEqual(stickerSlot(2, 'ollie'))
    for (let i = 0; i < BOARD_SLOTS.length; i++)
      for (const id of ['ollie', 'shifty', '+']) {
        const s = stickerSlot(i, id)
        expect(s.x).toBeGreaterThan(14)
        expect(s.x).toBeLessThan(87)
        expect(s.y).toBeGreaterThan(18)
        expect(s.y).toBeLessThan(82)
        expect(Math.abs(s.rotate)).toBeLessThanOrEqual(10)
      }
  })

  it('volgende sticker: de makkelijkste die je nog niet hebt; alles binnen = geen', () => {
    const [basis] = stickerBook([]).tracks
    const next = nextSticker(basis)!
    expect(next.level).toBe(Math.min(...basis.stickers.map((s) => s.trick.level)))
    const full = stickerBook(basis.stickers.map((s) => s.trick.id)).tracks[0]
    expect(nextSticker(full)).toBeUndefined()
  })

  it('moeilijkheid als pistekleur', () => {
    expect([1, 2, 3, 4, 5].map((l) => trickPiste(l as 1))).toEqual(['groen', 'blauw', 'rood', 'zwart', 'zwart'])
  })
})
