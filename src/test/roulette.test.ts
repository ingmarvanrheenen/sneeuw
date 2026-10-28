import { describe, expect, it } from 'vitest'
import { rouletteCandidates, spin } from '../lib/roulette'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import type { TrickStatus } from '../lib/types'

const st = (o: Record<string, TrickStatus>) => new Map<string, TrickStatus | undefined>(Object.entries(o))
// alle voorkennis van een trick, recursief
const chain = (id: string): string[] => TRICK_BY_ID.get(id)!.prereqs.flatMap((p) => [...chain(p), p])

describe('trick-roulette', () => {
  it('beginner: alleen niveau 1 zonder voorkennis', () => {
    const c = rouletteCandidates(st({}))
    expect(c.length).toBeGreaterThan(0)
    expect(c.every((t) => t.level === 1 && t.prereqs.length === 0)).toBe(true)
  })

  it('nooit iets wat je al geland hebt, en altijd met alle voorkennis geland', () => {
    const landed = Object.fromEntries(chain('ollie').map((id) => [id, 'geland' as TrickStatus]))
    const status = st(landed)
    const c = rouletteCandidates(status)
    expect(c.some((t) => t.id === 'ollie')).toBe(true)
    for (const t of c) {
      expect(landed[t.id]).toBeUndefined()
      expect(t.prereqs.every((p) => landed[p])).toBe(true)
    }
  })

  it('hooguit één niveau boven je hoogste gelande trick', () => {
    const landed = Object.fromEntries(TRICKS.filter((t) => t.level === 1).map((t) => [t.id, 'beheerst' as TrickStatus]))
    const c = rouletteCandidates(st(landed))
    expect(c.length).toBeGreaterThan(0)
    expect(Math.max(...c.map((t) => t.level))).toBeLessThanOrEqual(2)
  })

  it('per track te kiezen', () => {
    const landed = Object.fromEntries(TRICKS.filter((t) => t.level <= 2).map((t) => [t.id, 'geland' as TrickStatus]))
    const c = rouletteCandidates(st(landed), 'flat')
    expect(c.length).toBeGreaterThan(0)
    expect(c.every((t) => t.track === 'flat')).toBe(true)
  })

  it('alles geland: niks meer te draaien', () => {
    const all = Object.fromEntries(TRICKS.map((t) => [t.id, 'geland' as TrickStatus]))
    expect(rouletteCandidates(st(all))).toEqual([])
    expect(spin([], st(all))).toBeNull()
  })

  it('waar je mee bezig bent komt vaker voorbij, en nooit twee keer achter elkaar dezelfde', () => {
    const [a, b] = TRICKS
    const status = st({ [a.id]: 'bezig' })
    // gewicht: a = 3, b = 1, dus 0..0.75 is a, daarboven b
    expect(spin([a, b], status, () => 0.7)?.id).toBe(a.id)
    expect(spin([a, b], status, () => 0.8)?.id).toBe(b.id)
    expect(spin([a, b], status, () => 0.1, a.id)?.id).toBe(b.id)
    // geen keus: dan toch dezelfde
    expect(spin([a], status, () => 0.1, a.id)?.id).toBe(a.id)
  })
})
