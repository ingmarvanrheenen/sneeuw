// Deelkaarten: wat erop staat (het tekenen zelf gebeurt op canvas en checken we met screenshots).
import { describe, expect, it } from 'vitest'
import { dayCardContent, wrappedColors } from '../lib/shareCard'
import { stickerSvg } from '../design/Stickers'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { Session } from '../lib/types'

const day = (over: Partial<Session> = {}) =>
  ({ ...EMPTY_DRAFT, id: 'd', kind: 'session', createdAt: 0, updatedAt: 0, date: '2027-01-17', mediaIds: [], ...over }) as Session

describe('dagkaart', () => {
  it('resort, uren met een komma, tricks en slams (slams in het oranje vak), en je stemming', () => {
    const k = dayCardContent(day({ resortName: 'Val Thorens', hours: 5.5, falls: 7, mood: 5, landed: ['ollie', 'shifty'] }))
    expect(k.title).toBe('Val Thorens')
    expect(k.stats).toEqual([
      { label: 'uur', value: '5,5', hot: false },
      { label: 'tricks', value: '2', hot: false },
      { label: 'slams', value: '7', hot: true },
    ])
    expect(k.mood).toBe(5)
    expect(k.moodLabel).toBe('Episch')
    expect(k.tricks).toEqual(['Ollie', 'Shifty'])
  })

  it('zonder resort een standaardtitel; één trick is enkelvoud; lange highlight wordt afgekapt', () => {
    const k = dayCardContent(day({ resortName: '', landed: ['ollie'], highlight: 'x'.repeat(200) }))
    expect(k.title).toBe('Dag op de plank')
    expect(k.stats[1].label).toBe('trick')
    expect(k.highlight).toHaveLength(90)
    expect(k.highlight.endsWith('…')).toBe(true)
  })

  it('max 6 tricks, de rest als +n; stemming buiten 1-5 wordt afgerond', () => {
    const k = dayCardContent(day({ landed: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], mood: 9 }))
    expect(k.tricks).toHaveLength(6)
    expect(k.moreTricks).toBe(2)
    expect(k.mood).toBe(5)
  })
})

describe('wrapped-kaart', () => {
  it('om en om zwart en lime; de sticker in de andere kleur', () => {
    expect(wrappedColors(0)).toMatchObject({ bg: '#0d0d0f', fg: '#f5f5ef', sticker: '#d7ff3c' })
    expect(wrappedColors(1)).toMatchObject({ bg: '#d7ff3c', fg: '#0d0d0f', sticker: '#ff5b22' })
    expect(wrappedColors(2).bg).toBe('#0d0d0f')
  })
})

describe('sticker als losse svg', () => {
  it('stemming en reactie als svg-tekst; onbekend is leeg', () => {
    expect(stickerSvg(5, 100)).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 64 64" width="100" height="100"/)
    expect(stickerSvg('goat')).toContain('<svg')
    expect(stickerSvg(1)).not.toBe(stickerSvg(5))
    expect(stickerSvg('bestaat-niet')).toBe('')
  })
})
