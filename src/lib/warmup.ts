// Warming-up: de klok van de routine. Op tijdstempels (niet op losse tikken), zodat pauze, overslaan en een
// scherm dat even uit ging allemaal blijven kloppen.
import type { Exercise } from '../content/warmup'

export interface WarmupClock {
  startedAt: number
  /** gezet tijdens pauze */
  pausedAt: number | null
  /** totale tijd in pauze (afgerond) */
  pausedMs: number
  /** overgeslagen tijd */
  skippedMs: number
}

export const startClock = (now: number): WarmupClock => ({ startedAt: now, pausedAt: null, pausedMs: 0, skippedMs: 0 })

/** Hoeveel van de routine erop zit, in ms. */
export const elapsed = (c: WarmupClock, now: number) => (c.pausedAt ?? now) - c.startedAt - c.pausedMs + c.skippedMs

export const pause = (c: WarmupClock, now: number): WarmupClock => (c.pausedAt === null ? { ...c, pausedAt: now } : c)
export const resume = (c: WarmupClock, now: number): WarmupClock =>
  c.pausedAt === null ? c : { ...c, pausedAt: null, pausedMs: c.pausedMs + (now - c.pausedAt) }

export interface Position {
  index: number
  /** ms over in deze oefening */
  left: number
  /** 0..1 door deze oefening */
  part: number
  /** 0..1 door de hele routine */
  total: number
  done: boolean
}

export function position(list: Exercise[], ms: number): Position {
  const all = list.reduce((n, e) => n + e.secs * 1000, 0)
  let at = 0
  for (let i = 0; i < list.length; i++) {
    const len = list[i].secs * 1000
    if (ms < at + len) {
      const into = Math.max(0, ms - at)
      return { index: i, left: len - into, part: into / len, total: Math.max(0, ms) / all, done: false }
    }
    at += len
  }
  return { index: list.length - 1, left: 0, part: 1, total: 1, done: true }
}

/** Naar de volgende oefening: de rest van deze telt als gedaan. */
export function skip(c: WarmupClock, list: Exercise[], now: number): WarmupClock {
  const p = position(list, elapsed(c, now))
  return p.done ? c : { ...c, skippedMs: c.skippedMs + p.left }
}

/** "0:40" */
export const fmtSecs = (ms: number) => {
  const s = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Scherm aan houden tijdens de routine (Safari 16.4+); geeft een functie om los te laten. */
export async function keepAwake(): Promise<() => void> {
  try {
    const lock = await (
      navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    ).wakeLock?.request('screen')
    return () => void lock?.release().catch(() => {})
  } catch {
    return () => {}
  }
}
