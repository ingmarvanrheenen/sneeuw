// Programma samen met je crew: welke dagen jij en je crewgenoten van een programma deden. Je deelt een programma
// met één crew (onthouden op dit toestel); je eigen voortgang blijft ook lokaal staan (src/lib/programs.ts).
// Tabel en regels: migratie 20261121000000_crew_program_days.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'

export interface CrewDay {
  user_id: string
  day: number
  done_on: string
}

function need() {
  if (!supabase) throw new Error('Samen volgen werkt alleen met een gekoppelde server.')
  return supabase
}

const key = (programId: string) => `programCrew:${programId}`
/** Met welke crew je dit programma volgt (of null). */
export const sharedCrew = (programId: string) => kvGet<string | null>(key(programId), null)
export const setSharedCrew = (programId: string, crewId: string | null) => kvSet(key(programId), crewId)

export async function crewDays(crewId: string, programId: string): Promise<CrewDay[]> {
  const { data, error } = await need()
    .from('crew_program_days')
    .select('user_id, day, done_on')
    .eq('crew_id', crewId)
    .eq('program_id', programId)
  if (error) throw error
  return (data ?? []) as CrewDay[]
}

/** Jouw dag gedaan (of weer open) bij je crew. */
export async function setCrewDay(crewId: string, programId: string, day: number, done: boolean, doneOn?: string) {
  const sb = need()
  if (done) {
    const { error } = await sb
      .from('crew_program_days')
      .upsert({ crew_id: crewId, program_id: programId, day, ...(doneOn ? { done_on: doneOn } : {}) }, { ignoreDuplicates: true })
    if (error) throw error
  } else {
    const { error } = await sb.from('crew_program_days').delete().eq('crew_id', crewId).eq('program_id', programId).eq('day', day)
    if (error) throw error
  }
}

/** Per crewgenoot: welke dagen gedaan, en hoeveel. Wie het meest deed eerst; jij bij gelijkspel bovenaan. */
export function crewBoard(rows: CrewDay[], members: { user_id: string; display_name: string }[], me: string, days: number) {
  return members
    .map((m) => {
      const done = new Set(rows.filter((r) => r.user_id === m.user_id && r.day < days).map((r) => r.day))
      return { userId: m.user_id, name: m.user_id === me ? 'Jij' : m.display_name, done, count: done.size }
    })
    .filter((x) => x.count > 0 || x.userId === me)
    .sort((a, b) => b.count - a.count || Number(b.userId === me) - Number(a.userId === me) || a.name.localeCompare(b.name))
}
