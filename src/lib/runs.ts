// Run-teller: tik Start boven aan de piste en Beneden als je onder bent. De tijd ertussen is lift en wachten;
// een gat van meer dan 45 minuten is pauze (lunch, chalet). Alles op tijdstempels en alleen op je toestel
// (kv: runs:<datum>), dus het klopt ook als de app dicht was of je scherm uit stond, en werkt offline.
import { kvGet, kvSet } from './db'
import { createStore } from './store'
import { todayISO } from './ids'

export interface Run {
  start: number
  end?: number
}

export interface RunDay {
  date: string
  runs: Run[]
}

/** langer dan dit tussen twee runs = pauze, niet de lift */
export const PAUSE_MS = 45 * 60_000
/** een run die langer loopt: waarschijnlijk vergeten op Beneden te tikken */
export const LONG_RUN_MS = 40 * 60_000

export type RunState = 'klaar' | 'piste' | 'lift' | 'pauze'

const key = (date: string) => `runs:${date}`
const empty = (date: string): RunDay => ({ date, runs: [] })

/** De run-dag van vandaag, live voor Home en de run-pagina. */
export const runStore = createStore<RunDay>(empty(todayISO()))

export async function loadRunDay(date = todayISO()): Promise<RunDay> {
  const day = await kvGet<RunDay>(key(date), empty(date))
  if (date === todayISO()) runStore.set(day)
  return day
}

async function save(day: RunDay) {
  await kvSet(key(day.date), day)
  if (day.date === todayISO()) runStore.set(day)
  return day
}

export function stateOf(day: RunDay, now = Date.now()): RunState {
  const last = day.runs.at(-1)
  if (!last) return 'klaar'
  if (last.end === undefined) return 'piste'
  return now - last.end > PAUSE_MS ? 'pauze' : 'lift'
}

/** Start een run (als er nog een loopt: die eerst afsluiten). */
export async function startRun(now = Date.now(), date = todayISO()) {
  const day = await kvGet<RunDay>(key(date), empty(date))
  const runs = day.runs.map((r, i) => (i === day.runs.length - 1 && r.end === undefined ? { ...r, end: now } : r))
  return save({ date, runs: [...runs, { start: now }] })
}

/** Beneden: de lopende run afsluiten. */
export async function stopRun(now = Date.now(), date = todayISO()) {
  const day = await kvGet<RunDay>(key(date), empty(date))
  const last = day.runs.at(-1)
  if (!last || last.end !== undefined) return day
  return save({ date, runs: [...day.runs.slice(0, -1), { ...last, end: Math.max(now, last.start) }] })
}

/** Mis getikt: de laatste tik terugdraaien (Beneden weer open, of Start weg). */
export async function undoRun(date = todayISO()) {
  const day = await kvGet<RunDay>(key(date), empty(date))
  const last = day.runs.at(-1)
  if (!last) return day
  const runs = last.end !== undefined ? [...day.runs.slice(0, -1), { start: last.start }] : day.runs.slice(0, -1)
  return save({ date, runs })
}

/** Vergeten te stoppen: de lopende run weggooien. */
export async function dropRun(date = todayISO()) {
  const day = await kvGet<RunDay>(key(date), empty(date))
  if (day.runs.at(-1)?.end !== undefined) return day
  return save({ date, runs: day.runs.slice(0, -1) })
}

export async function resetRunDay(date = todayISO()) {
  return save(empty(date))
}

export interface RunStats {
  runs: number
  /** tijd op de piste (afgeronde runs plus de lopende) */
  pisteMs: number
  /** tijd in de lift en wachten (gaten korter dan 45 min, plus het huidige gat) */
  liftMs: number
  pauseMs: number
  longestMs: number
  averageMs: number
  /** van de eerste start tot de laatste tik (of nu) */
  dayMs: number
  /** de lopende run of het huidige gat */
  currentMs: number
}

export function runStats(day: RunDay, now = Date.now()): RunStats {
  const done = day.runs.filter((r) => r.end !== undefined) as Required<Run>[]
  const durations = done.map((r) => r.end - r.start)
  const last = day.runs.at(-1)
  const running = last && last.end === undefined ? now - last.start : 0
  let liftMs = 0
  let pauseMs = 0
  for (let i = 1; i < day.runs.length; i++) {
    const prevEnd = day.runs[i - 1].end
    if (prevEnd === undefined) continue
    const gap = day.runs[i].start - prevEnd
    if (gap > PAUSE_MS) pauseMs += gap
    else liftMs += Math.max(0, gap)
  }
  // nu in de lift: telt mee zolang het geen pauze is
  const gapNow = last?.end !== undefined ? now - last.end : 0
  if (gapNow && gapNow <= PAUSE_MS) liftMs += gapNow
  const pisteMs = durations.reduce((a, b) => a + b, 0) + running
  const first = day.runs[0]?.start
  const lastTick = last ? (last.end ?? now) : 0
  return {
    runs: done.length,
    pisteMs,
    liftMs,
    pauseMs,
    longestMs: Math.max(0, ...durations),
    averageMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    dayMs: first ? lastTick - first : 0,
    currentMs: running || gapNow,
  }
}

/** "4:07" (min:sec) voor een lopende run, "1 u 12" voor lange tijden */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function fmtSpan(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} u${min % 60 ? ` ${min % 60}` : ''}`
}

/** Voor je dag: aantal runs en uren op de berg (op een half uur), als de teller iets heeft. */
export async function runsForDay(date: string): Promise<{ runs: number; hours: number } | null> {
  const day = await kvGet<RunDay>(key(date), empty(date))
  const s = runStats(day, day.runs.at(-1)?.end ?? Date.now())
  if (!s.runs) return null
  return { runs: s.runs, hours: Math.max(0.5, Math.round((s.dayMs / 3_600_000) * 2) / 2) }
}
