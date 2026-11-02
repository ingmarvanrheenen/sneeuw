// Trip-toernooi: de beste clips van de trip in een bracket (max 8), de crew stemt per duel.
// De bracket (welke clips, in welke volgorde) ligt vast in `crew_trip_brackets`; wie doorgaat rekent de app uit
// de stemmen: meeste stemmen wint, gelijk = de eerste. Een duel is beslist als minstens de helft van de crew
// stemde; dan pas staat de winnaar in het volgende duel. Een lege plek (minder dan 4 of 8 clips) is een bye.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { seeded, shuffle } from './random'
import type { MediaMeta } from './types'

export interface Bracket {
  trip_id: string
  crew_id: string
  entries: string[]
  created_by: string
  created_at: string
}

export interface BracketVote {
  round: number
  match: number
  voter: string
  pick: string
}

export interface Match {
  round: number
  match: number
  /** clip-id, null = lege plek (bye), undefined = nog niet bekend (vorige duel nog niet beslist) */
  a: string | null | undefined
  b: string | null | undefined
  votesA: number
  votesB: number
  winner: string | null
  decided: boolean
  /** beide clips bekend en nog niet beslist: hier kun je stemmen */
  open: boolean
}

export const MAX_ENTRIES = 8

/** Welke clips meedoen: video's eerst, in een vaste maar gehusselde volgorde per trip. */
export function pickEntries(media: Pick<MediaMeta, 'id' | 'type'>[], seed: string, max = MAX_ENTRIES): string[] {
  const rng = seeded(`toernooi:${seed}`)
  const videos = shuffle(
    media.filter((m) => m.type === 'video'),
    rng,
  )
  const photos = shuffle(
    media.filter((m) => m.type === 'image'),
    rng,
  )
  return [...videos, ...photos].slice(0, max).map((m) => m.id)
}

export const quorum = (crewSize: number) => Math.max(1, Math.ceil(crewSize / 2))

/** De hele bracket met stand en winnaars, ronde voor ronde. */
export function layout(entries: string[], votes: BracketVote[], crewSize: number): { rounds: Match[][]; champion: string | null } {
  const size = entries.length <= 2 ? 2 : entries.length <= 4 ? 4 : 8
  let slots: (string | null | undefined)[] = Array.from({ length: size }, (_, i) => entries[i] ?? null)
  const need = quorum(crewSize)
  const rounds: Match[][] = []
  for (let round = 0; slots.length > 1; round++) {
    const matches: Match[] = []
    for (let m = 0; m < slots.length / 2; m++) {
      const a = slots[m * 2]
      const b = slots[m * 2 + 1]
      const here = votes.filter((v) => v.round === round && v.match === m)
      const votesA = a ? here.filter((v) => v.pick === a).length : 0
      const votesB = b ? here.filter((v) => v.pick === b).length : 0
      let winner: string | null = null
      let decided = false
      if (a === undefined || b === undefined) {
        // wacht op het vorige duel
      } else if (a && !b) {
        winner = a
        decided = true
      } else if (!a && b) {
        winner = b
        decided = true
      } else if (a && b && votesA + votesB > 0) {
        winner = votesB > votesA ? b : a
        decided = votesA + votesB >= need
      }
      matches.push({ round, match: m, a, b, votesA, votesB, winner, decided, open: !!a && !!b && !decided })
    }
    rounds.push(matches)
    // alleen een beslist duel levert een clip voor de volgende ronde; twee lege plekken blijven leeg
    slots = matches.map((x) => (x.decided ? x.winner : x.a === null && x.b === null ? null : undefined))
  }
  const final = rounds.at(-1)![0]
  return { rounds, champion: final.decided ? final.winner : null }
}

/** "Finale", "Halve finale", "Kwartfinale" (vanaf het eind geteld). */
export function roundName(round: number, total: number): string {
  return ['Finale', 'Halve finale', 'Kwartfinale'][total - 1 - round] ?? `Ronde ${round + 1}`
}

// ── Data ──────────────────────────────────────────────────────────────────────

function need() {
  if (!supabase) throw new Error('Crew-trips werken alleen met een gekoppelde server.')
  return supabase
}

const key = (tripId: string) => `bracket:${tripId}`
export const cachedBracket = (tripId: string) => kvGet<{ bracket: Bracket | null; votes: BracketVote[] } | null>(key(tripId), null)

export async function loadBracket(tripId: string): Promise<{ bracket: Bracket | null; votes: BracketVote[] }> {
  const sb = need()
  const [b, v] = await Promise.all([
    sb.from('crew_trip_brackets').select('trip_id, crew_id, entries, created_by, created_at').eq('trip_id', tripId).maybeSingle(),
    sb.from('crew_trip_bracket_votes').select('round, match, voter, pick').eq('trip_id', tripId),
  ])
  if (b.error) throw b.error
  if (v.error) throw v.error
  const out = { bracket: (b.data as Bracket | null) ?? null, votes: (v.data ?? []) as BracketVote[] }
  await kvSet(key(tripId), out)
  return out
}

export async function startBracket(crewId: string, tripId: string, entries: string[]) {
  const { error } = await need().from('crew_trip_brackets').insert({ trip_id: tripId, crew_id: crewId, entries })
  if (error) throw (error as { code?: string }).code === '23505' ? new Error('Iemand anders startte het toernooi net.') : error
}

export async function resetBracket(tripId: string) {
  const { error } = await need().from('crew_trip_brackets').delete().eq('trip_id', tripId)
  if (error) throw error
}

/** Stemmen (of je stem omzetten) in een duel. */
export async function voteBracket(tripId: string, round: number, match: number, pick: string, voter: string) {
  const sb = need()
  const { error } = await sb.from('crew_trip_bracket_votes').insert({ trip_id: tripId, round, match, pick })
  if (!error) return
  if ((error as { code?: string }).code !== '23505') throw error
  const res = await sb
    .from('crew_trip_bracket_votes')
    .update({ pick })
    .eq('trip_id', tripId)
    .eq('round', round)
    .eq('match', match)
    .eq('voter', voter)
  if (res.error) throw res.error
}
