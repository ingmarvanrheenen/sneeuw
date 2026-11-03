// Programma's volgen: welk programma loopt, en welke dagen je deed (met datum). Alleen op dit toestel
// (kv: programs), net als je andere oefendata zonder XP. `programStore` houdt Home en de pagina's gelijk.
// Programma's die de coach voor je maakte staan er ook in (`custom`), naast de kant-en-klare.
import { kvGet, kvSet } from './db'
import { createStore } from './store'
import { todayISO } from './ids'
import { PROGRAM_BY_ID, PROGRAMS, type Program } from '../content/programs'

export interface ProgramRun {
  startedAt: string
  /** per dag-index de datum waarop je hem deed */
  done: Record<number, string>
}

export interface ProgramState {
  active: string | null
  runs: Record<string, ProgramRun>
  /** door de coach gemaakt, nieuwste eerst */
  custom?: Program[]
}

const KEY = 'programs'
const EMPTY: ProgramState = { active: null, runs: {} }
export const programStore = createStore<ProgramState>(EMPTY)

export async function loadPrograms(): Promise<ProgramState> {
  const s = await kvGet<ProgramState>(KEY, EMPTY)
  programStore.set(s)
  return s
}

async function save(next: ProgramState) {
  await kvSet(KEY, next)
  programStore.set(next)
  return next
}

/** Starten (of opnieuw beginnen): wordt je actieve programma, vanaf dag 1. */
export async function startProgram(id: string, today = todayISO()) {
  const s = await kvGet<ProgramState>(KEY, EMPTY)
  return save({ ...s, active: id, runs: { ...s.runs, [id]: { startedAt: today, done: {} } } })
}

export async function stopProgram() {
  const s = await kvGet<ProgramState>(KEY, EMPTY)
  return save({ ...s, active: null })
}

/** Dag gedaan (of weer open). */
export async function setDayDone(id: string, day: number, done: boolean, today = todayISO()) {
  const s = await kvGet<ProgramState>(KEY, EMPTY)
  const run = s.runs[id] ?? { startedAt: today, done: {} }
  const nextDone = { ...run.done }
  if (done) nextDone[day] = today
  else delete nextDone[day]
  const next = { ...s, runs: { ...s.runs, [id]: { ...run, done: nextDone } } }
  // laatste dag af: klaar, dan is er geen actief programma meer
  const p = programById(s, id)
  if (p && Object.keys(nextDone).length >= p.days.length && s.active === id) next.active = null
  return save(next)
}

/** De eerste dag die je nog niet deed; null = alles af. */
export function nextDay(p: Program, run: ProgramRun | undefined): number | null {
  for (let i = 0; i < p.days.length; i++) if (!run?.done[i]) return i
  return null
}

export const doneCount = (run: ProgramRun | undefined) => Object.keys(run?.done ?? {}).length
export const isComplete = (p: Program, run: ProgramRun | undefined) => doneCount(run) >= p.days.length

/** Een programma op id: kant-en-klaar of van de coach. */
export function programById(s: ProgramState, id: string): Program | undefined {
  return PROGRAM_BY_ID.get(id) ?? s.custom?.find((p) => p.id === id)
}

/** Alle programma's: eerst die van de coach (nieuwste eerst), dan de kant-en-klare. */
export const allPrograms = (s: ProgramState): Program[] => [...(s.custom ?? []), ...PROGRAMS]

export const MAX_CUSTOM = 10

/** Bewaart een programma van de coach (bovenaan; de oudste valt eraf boven de 10, tenzij hij loopt). */
export async function addCustomProgram(p: Program) {
  const s = await kvGet<ProgramState>(KEY, EMPTY)
  const custom = [p, ...(s.custom ?? []).filter((x) => x.id !== p.id)]
  while (custom.length > MAX_CUSTOM) {
    const i = custom.map((x) => x.id !== s.active).lastIndexOf(true)
    if (i < 0) break
    custom.splice(i, 1)
  }
  return save({ ...s, custom })
}

/** Programma van de coach weghalen (met je voortgang erin). Kant-en-klare blijven altijd. */
export async function removeCustomProgram(id: string) {
  const s = await kvGet<ProgramState>(KEY, EMPTY)
  const runs = { ...s.runs }
  delete runs[id]
  return save({ active: s.active === id ? null : s.active, runs, custom: (s.custom ?? []).filter((x) => x.id !== id) })
}
