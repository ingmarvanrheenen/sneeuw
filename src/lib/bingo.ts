// Trip-bingo: per trip een bingokaart per crewlid. De kaart volgt uit trip en speler (iedereen ziet dezelfde
// kaart van jou, zonder dat hij opgeslagen wordt); alleen de afgevinkte vakjes staan in `crew_trip_bingo`.
// Wie bingo heeft en wie als eerste een rij vol had, rekenen we hier uit.
// Online-first zoals crew-doelen: de laatst bekende vinkjes staan lokaal.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { BINGO_SIZE, BINGO_SQUARES, type BingoSquare } from '../content/bingo'
import { seeded, shuffle } from './random'

// ── Kaart en lijnen (puur) ───────────────────────────────────────────────────

/** De kaart van één speler voor één trip: 16 vakjes, rij voor rij. */
export function bingoCard(tripId: string, userId: string): BingoSquare[] {
  return shuffle(BINGO_SQUARES, seeded(`${tripId}:${userId}`)).slice(0, BINGO_SIZE * BINGO_SIZE)
}

/** Alle lijnen als posities op de kaart: rijen, kolommen en de twee diagonalen. */
export const LINES: number[][] = (() => {
  const n = BINGO_SIZE
  const idx = [...Array(n).keys()]
  return [
    ...idx.map((r) => idx.map((c) => r * n + c)),
    ...idx.map((c) => idx.map((r) => r * n + c)),
    idx.map((i) => i * n + i),
    idx.map((i) => i * n + (n - 1 - i)),
  ]
})()

export interface BingoTick {
  user_id: string
  square: string
  created_at: string
}

export interface BingoPlayer {
  userId: string
  card: BingoSquare[]
  ticked: Set<string>
  /** posities die in een volle lijn liggen */
  lineCells: Set<number>
  /** moment waarop de eerste lijn vol was, of null */
  bingoAt: string | null
  full: boolean
}

export function bingoPlayer(tripId: string, userId: string, ticks: BingoTick[]): BingoPlayer {
  const card = bingoCard(tripId, userId)
  const mine = ticks.filter((t) => t.user_id === userId && card.some((s) => s.id === t.square))
  const when = new Map(mine.map((t) => [t.square, t.created_at]))
  const ticked = new Set(when.keys())
  const lineCells = new Set<number>()
  let bingoAt: string | null = null
  for (const line of LINES) {
    if (!line.every((i) => ticked.has(card[i].id))) continue
    line.forEach((i) => lineCells.add(i))
    // de lijn was vol op het moment van het laatste vinkje erin
    const done = line
      .map((i) => when.get(card[i].id)!)
      .sort()
      .at(-1)!
    if (!bingoAt || done < bingoAt) bingoAt = done
  }
  return { userId, card, ticked, lineCells, bingoAt, full: ticked.size === card.length }
}

/** Iedereen met een kaart, en wie als eerste bingo had. */
export function bingoStand(tripId: string, userIds: string[], ticks: BingoTick[]) {
  const players = userIds.map((u) => bingoPlayer(tripId, u, ticks))
  const withBingo = players.filter((p) => p.bingoAt).sort((a, b) => a.bingoAt!.localeCompare(b.bingoAt!))
  return { players, first: withBingo[0]?.userId ?? null }
}

// ── Data ─────────────────────────────────────────────────────────────────

function need() {
  if (!supabase) throw new Error('Trip-bingo werkt alleen met een gekoppelde server.')
  return supabase
}

const key = (tripId: string) => `tripBingo:${tripId}`

export function cachedTicks(tripId: string): Promise<BingoTick[]> {
  return kvGet<BingoTick[]>(key(tripId), [])
}

export async function listTicks(tripId: string): Promise<BingoTick[]> {
  const { data, error } = await need().from('crew_trip_bingo').select('user_id, square, created_at').eq('trip_id', tripId)
  if (error) throw error
  const list = (data ?? []) as BingoTick[]
  await kvSet(key(tripId), list)
  return list
}

export async function setTick(crewId: string, tripId: string, square: string, on: boolean, me: string) {
  const sb = need()
  const { error } = on
    ? await sb.from('crew_trip_bingo').insert({ trip_id: tripId, crew_id: crewId, square })
    : await sb.from('crew_trip_bingo').delete().eq('trip_id', tripId).eq('user_id', me).eq('square', square)
  // al afgevinkt (op een andere telefoon) is prima
  if (error && (error as { code?: string }).code !== '23505') throw error
}
