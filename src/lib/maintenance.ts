// Gear-onderhoud: wanneer je board weer wax of geslepen edges nodig heeft. Afgeleid uit je gelogde dagen
// (dagen op de plank, niet kalenderdagen) sinds de laatste keer. We weten niet op welk board je een dag reed,
// dus elke dag telt voor elk eigen board.
import type { Gear, Session } from './types'

export type Task = 'wax' | 'edges'

export const TASKS: { id: Task; label: string; done: string; every: number; why: string }[] = [
  { id: 'wax', label: 'Waxen', done: 'Gewaxt', every: 5, why: 'Droge base glijdt slecht en verbrandt sneller.' },
  { id: 'edges', label: 'Edges slijpen', done: 'Geslepen', every: 15, why: 'Botte edges pakken niet op hard en ijs.' },
]

export interface Due {
  task: Task
  label: string
  /** dagen op de plank sinds de laatste keer (of sinds je het board toevoegde) */
  days: number
  every: number
  due: boolean
  /** datum van de laatste keer, als je die afvinkte */
  last?: string
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Alleen je eigen boards hebben onderhoud nodig (geen huur, geen wishlist). */
export const needsCare = (g: Gear) => g.gearKind === 'board' && g.owned === 'eigen' && !g.deleted

/** Dagen op de plank na een datum (een dag met twee logs telt één keer). */
export function daysSince(sessions: Session[], since: string): number {
  return new Set(sessions.filter((s) => !s.deleted && s.date > since).map((s) => s.date)).size
}

export function dueFor(g: Gear, sessions: Session[]): Due[] {
  return TASKS.map((t) => {
    const last = g.care?.[t.id]
    const days = daysSince(sessions, last ?? iso(g.createdAt))
    return { task: t.id, label: t.label, days, every: t.every, due: days >= t.every, ...(last ? { last } : {}) }
  })
}

/** Wat er nu moet, over al je eigen boards: het eerst-nodige eerst. */
export function dueNow(gear: Gear[], sessions: Session[]): { gear: Gear; due: Due }[] {
  return gear
    .filter(needsCare)
    .flatMap((g) => dueFor(g, sessions).map((due) => ({ gear: g, due })))
    .filter((x) => x.due.due)
    .sort((a, b) => b.due.days / b.due.every - a.due.days / a.due.every)
}

export function dueText(d: Due): string {
  const ago = d.days === 1 ? '1 dag op de plank' : `${d.days} dagen op de plank`
  if (d.due) return `${ago} geleden, tijd ervoor`
  const left = d.every - d.days
  return `${ago} geleden, nog ${left} ${left === 1 ? 'dag' : 'dagen'}`
}
