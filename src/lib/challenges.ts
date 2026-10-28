// Dagopdracht: elke dag één challenge die bij je niveau past. Je niveau = de hoogste trick die je geland hebt.
// De opdracht van vandaag ligt vast zodra je hem ziet (ook als je die dag een nieuwe trick landt); één keer
// per dag mag je een andere vragen. Je lijst staat lokaal (werkt offline); gedaan gaat ook naar
// `daily_challenges`, zodat je crew ziet wie hem vandaag deed. Lukt dat niet (geen bereik), dan later opnieuw.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { getCurrentUserId } from './auth-state'
import { seeded, pick } from './random'
import { CHALLENGES, type Challenge } from '../content/challenges'
import { TRICK_BY_ID } from '../content/tricks'

export interface DayChallenge {
  id: string
  rerolled: boolean
  /** wanneer je hem afvinkte */
  done?: number
  /** staat het vinkje ook op de server */
  synced?: boolean
}

export type ChallengeLog = Record<string, DayChallenge>

const KEY = 'dagopdracht'
export const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]))

/** Je niveau: de hoogste trick die je geland hebt (1 als je nog niks landde). */
export function skillLevel(landed: Iterable<string>): number {
  let top = 1
  for (const id of landed) top = Math.max(top, TRICK_BY_ID.get(id)?.level ?? 1)
  return top
}

/** Opdrachten die bij je passen: rond je niveau, en alleen met tricks die je al kunt. */
export function challengePool(landed: Set<string>): Challenge[] {
  const lvl = skillLevel(landed)
  const fits = CHALLENGES.filter((c) => c.level >= lvl - 1 && c.level <= lvl + 1 && (c.needs ?? []).every((t) => landed.has(t)))
  return fits.length ? fits : CHALLENGES.filter((c) => c.level === 1 && !c.needs)
}

/** De opdracht voor een dag; `avoid` voor "Andere opdracht". Zelfde dag + speler = zelfde keuze. */
export function pickChallenge(date: string, userId: string, landed: Set<string>, avoid?: string): Challenge {
  const pool = challengePool(landed)
  const options = pool.length > 1 ? pool.filter((c) => c.id !== avoid) : pool
  return pick(options, 1, seeded(`${date}:${userId}:${avoid ?? ''}`))[0]
}

export const loadChallenges = () => kvGet<ChallengeLog>(KEY, {})
const save = (log: ChallengeLog) => kvSet(KEY, log)

/** Opdracht van vandaag: de vastgelegde, of een nieuwe die we nu vastleggen. */
export async function todayChallenge(date: string, landed: Set<string>): Promise<{ log: ChallengeLog; today: DayChallenge }> {
  const log = await loadChallenges()
  if (log[date] && CHALLENGE_BY_ID.has(log[date].id)) return { log, today: log[date] }
  const today = { id: pickChallenge(date, getCurrentUserId() ?? 'lokaal', landed).id, rerolled: false }
  const next = { ...log, [date]: today }
  await save(next)
  return { log: next, today }
}

/** Eén keer per dag een andere opdracht, zolang je hem nog niet gedaan hebt. */
export async function rerollChallenge(date: string, landed: Set<string>): Promise<ChallengeLog> {
  const log = await loadChallenges()
  const cur = log[date]
  if (!cur || cur.rerolled || cur.done) return log
  const next = { ...log, [date]: { id: pickChallenge(date, getCurrentUserId() ?? 'lokaal', landed, cur.id).id, rerolled: true } }
  await save(next)
  return next
}

async function pushDone(date: string, c: DayChallenge): Promise<boolean> {
  if (!supabase || !getCurrentUserId() || !navigator.onLine) return false
  const me = getCurrentUserId()!
  if (!c.done) {
    const { error } = await supabase.from('daily_challenges').delete().eq('date', date).eq('user_id', me)
    return !error
  }
  // geen upsert: de datum mag je niet aanpassen, dus bij een bestaande rij alleen de opdracht bijwerken
  const { error } = await supabase.from('daily_challenges').insert({ date, challenge: c.id })
  if (!error) return true
  if ((error as { code?: string }).code !== '23505') return false
  const res = await supabase.from('daily_challenges').update({ challenge: c.id }).eq('date', date).eq('user_id', me)
  return !res.error
}

/** Afvinken (of weer uit). Lokaal meteen; naar de crew zodra het kan. */
export async function setChallengeDone(date: string, done: boolean): Promise<ChallengeLog> {
  const log = await loadChallenges()
  const cur = log[date]
  if (!cur) return log
  const next: DayChallenge = { ...cur, done: done ? Date.now() : undefined, synced: false }
  let out = { ...log, [date]: next }
  await save(out)
  if (await pushDone(date, next)) {
    out = { ...out, [date]: { ...next, synced: true } }
    await save(out)
  }
  return out
}

/** Vinkjes die nog niet bij de server zijn (bijv. offline afgevinkt), van de laatste week. */
export async function flushChallenges(today: string): Promise<void> {
  const log = await loadChallenges()
  const weekAgo = new Date(Date.parse(today + 'T12:00:00Z') - 7 * 864e5).toISOString().slice(0, 10)
  let changed = false
  for (const [date, c] of Object.entries(log)) {
    if (c.synced !== false || date < weekAgo) continue
    if (await pushDone(date, c)) {
      log[date] = { ...c, synced: true }
      changed = true
    }
  }
  if (changed) await save(log)
}

/** Aantal opdrachten dat je ooit gedaan hebt (voor XP en de badge). */
export const challengesDone = (log: ChallengeLog) => Object.values(log).filter((c) => c.done).length

export interface CrewChallenge {
  user_id: string
  challenge: string
}

/** Wie van je crew vandaag ook een opdracht deed (RLS: alleen jezelf en crewgenoten). */
export async function crewChallenges(date: string): Promise<CrewChallenge[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('daily_challenges').select('user_id, challenge').eq('date', date)
  if (error) throw error
  const me = getCurrentUserId()
  return ((data ?? []) as CrewChallenge[]).filter((r) => r.user_id !== me)
}
