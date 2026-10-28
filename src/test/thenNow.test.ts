import { describe, expect, it } from 'vitest'
import { allThenAndNow, gapText, thenAndNow } from '../lib/thenNow'
import type { MediaMeta } from '../lib/types'

const DAY = 86_400_000
const clip = (id: string, trickId: string | undefined, day: number, over: Partial<MediaMeta> = {}): MediaMeta => ({
  id,
  kind: 'media',
  type: 'video',
  mime: 'video/mp4',
  userId: 'me',
  trickId,
  createdAt: Date.UTC(2026, 11, 1) + day * DAY,
  updatedAt: 0,
  ...over,
})

describe('toen en nu', () => {
  it('oudste naast nieuwste, ongeacht de volgorde', () => {
    const r = thenAndNow([clip('b', 'ollie', 40), clip('a', 'ollie', 0), clip('c', 'ollie', 12), clip('x', 'nollie', 1)], 'ollie')
    expect(r).toMatchObject({ then: { id: 'a' }, now: { id: 'b' }, days: 40, count: 3 })
  })

  it('minder dan twee clips, of verwijderde clips: geen vergelijking', () => {
    expect(thenAndNow([clip('a', 'ollie', 0)], 'ollie')).toBeNull()
    expect(thenAndNow([clip('a', 'ollie', 0), clip('b', 'ollie', 5, { deleted: true })], 'ollie')).toBeNull()
  })

  it('alle tricks met een vergelijking, de grootste sprong eerst', () => {
    const list = allThenAndNow([
      clip('a', 'ollie', 0),
      clip('b', 'ollie', 3),
      clip('c', 'nollie', 0),
      clip('d', 'nollie', 90),
      clip('e', 'shifty', 2),
      clip('f', undefined, 0),
    ])
    expect(list.map((x) => x.trickId)).toEqual(['nollie', 'ollie'])
  })

  it('tijd ertussen in gewone taal', () => {
    expect(gapText(0)).toBe('dezelfde dag')
    expect(gapText(1)).toBe('1 dag later')
    expect(gapText(9)).toBe('9 dagen later')
    expect(gapText(21)).toBe('3 weken later')
    expect(gapText(95)).toBe('3 maanden later')
    expect(gapText(550)).toBe('1,5 jaar later')
  })
})
