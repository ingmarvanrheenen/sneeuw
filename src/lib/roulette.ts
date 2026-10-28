// Trick-roulette: een willekeurige trick die binnen je bereik ligt, voor als je niet weet wat je moet oefenen.
// Binnen bereik = nog niet geland, alle voorkennis wel geland, en hooguit één niveau boven je hoogste gelande trick.
import { TRICKS, type Track, type Trick } from '../content/tricks'
import type { TrickStatus } from './types'

const DONE: TrickStatus[] = ['geland', 'beheerst']

export function rouletteCandidates(status: Map<string, TrickStatus | undefined>, track?: Track | null): Trick[] {
  const done = new Set([...status].filter(([, s]) => s && DONE.includes(s)).map(([id]) => id))
  const top = Math.max(0, ...TRICKS.filter((t) => done.has(t.id)).map((t) => t.level))
  return TRICKS.filter(
    (t) => !done.has(t.id) && t.prereqs.every((p) => done.has(p)) && t.level <= Math.max(1, top + 1) && (!track || t.track === track),
  )
}

/** Waar je mee bezig bent of wat je wilt leren komt vaker voorbij. */
const weight = (s?: TrickStatus) => (s === 'bezig' ? 3 : s === 'wil' ? 2 : 1)

/** Kiest er één. `avoid`: niet twee keer achter elkaar dezelfde, als er keus is. */
export function spin(
  candidates: Trick[],
  status: Map<string, TrickStatus | undefined>,
  rng: () => number = Math.random,
  avoid?: string,
): Trick | null {
  const pool = candidates.length > 1 ? candidates.filter((t) => t.id !== avoid) : candidates
  if (!pool.length) return null
  const total = pool.reduce((a, t) => a + weight(status.get(t.id)), 0)
  let r = rng() * total
  for (const t of pool) {
    r -= weight(status.get(t.id))
    if (r < 0) return t
  }
  return pool[pool.length - 1]
}
