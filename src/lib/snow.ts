// S.N.O.W.: zoals S.K.A.T.E., maar op de piste. Wie aan de beurt is zet een trick neer; landt hij hem,
// dan moet de rest hem nadoen en wie mist krijgt een letter. Mist de zetter, dan gaat de beurt door.
// Bij S-N-O-W lig je eruit, de laatste die over is wint. Een gelande trick mag niet nog een keer.
//
// De database bewaart alleen de zetten; de stand rekenen we hier uit (zoals XP in progress.ts).
// Online-first: de laatst bekende stand staat lokaal, zodat je hem zonder bereik nog kunt zien.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'

export const WORD = ['S', 'N', 'O', 'W'] as const
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

export interface SnowGame {
  id: string
  crew_id: string
  players: string[]
  created_by: string
  created_at: string
}

export interface SnowMove {
  game_id: string
  seq: number
  kind: 'set' | 'match'
  player: string
  trick_id: string
  landed: boolean
}

export type Turn = { kind: 'set'; player: string } | { kind: 'match'; player: string; trickId: string; setter: string }

export interface SnowState {
  /** aantal letters per speler (0 t/m 4) */
  letters: Record<string, number>
  turn: Turn | null
  winner: string | null
  /** tricks die al geland zijn als zet, mogen niet nog een keer */
  used: string[]
  /** zetten die meetellen, in volgorde */
  moves: SnowMove[]
  /** volgnummer voor de volgende zet */
  nextSeq: number
}

export const isOut = (s: SnowState, p: string) => s.letters[p] >= WORD.length

/** Rekent de stand uit. Zetten die niet passen (verkeerde speler, dubbele trick) tellen niet mee. */
export function snowState(players: string[], all: SnowMove[]): SnowState {
  const letters: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]))
  const active = (p: string) => letters[p] < WORD.length
  const after = (p: string) => {
    const i = players.indexOf(p)
    for (let k = 1; k <= players.length; k++) {
      const q = players[(i + k) % players.length]
      if (active(q)) return q
    }
    return p
  }
  const sorted = [...all].sort((a, b) => a.seq - b.seq)
  const used: string[] = []
  const moves: SnowMove[] = []
  let setter = players[0]
  let match: { trickId: string; setter: string; queue: string[] } | null = null
  let winner: string | null = null

  for (const m of sorted) {
    if (winner || !setter) break
    if (!match) {
      if (m.kind !== 'set' || m.player !== setter || used.includes(m.trick_id)) continue
      moves.push(m)
      if (m.landed) {
        used.push(m.trick_id)
        // de anderen in speelvolgorde, beginnend na de zetter
        const i = players.indexOf(setter)
        const queue = [...players.slice(i + 1), ...players.slice(0, i)].filter(active)
        match = { trickId: m.trick_id, setter, queue }
      } else setter = after(setter)
    } else {
      if (m.kind !== 'match' || m.player !== match.queue[0] || m.trick_id !== match.trickId) continue
      moves.push(m)
      if (!m.landed) letters[m.player]++
      match.queue.shift()
      // wie de laatste letter krijgt valt af; de zetter blijft zetten tot hij mist
      if (!match.queue.length) match = null
    }
    const left = players.filter(active)
    if (left.length === 1) winner = left[0]
  }

  const turn: Turn | null = winner
    ? null
    : match
      ? { kind: 'match', player: match.queue[0], trickId: match.trickId, setter: match.setter }
      : { kind: 'set', player: setter }
  const nextSeq = sorted.length ? sorted[sorted.length - 1].seq + 1 : 0
  return { letters, turn, winner, used, moves, nextSeq }
}

/** "S N" voor 2 letters, "" voor geen. */
export const lettersText = (n: number) => WORD.slice(0, n).join('.')

// ── Data ─────────────────────────────────────────────────────────────────

export interface GameWithMoves {
  game: SnowGame
  moves: SnowMove[]
}

export class SnowConflict extends Error {
  constructor() {
    super('Iemand anders vulde deze beurt al in. De stand is bijgewerkt.')
  }
}

function need() {
  if (!supabase) throw new Error('S.N.O.W. werkt alleen met een gekoppelde server.')
  return supabase
}

const MOVE_COLS = 'game_id, seq, kind, player, trick_id, landed'
const GAME_COLS = 'id, crew_id, players, created_by, created_at'
const listKey = (crewId: string) => `snow:${crewId}`
const gameKey = (id: string) => `snowGame:${id}`

export function cachedGames(crewId: string): Promise<GameWithMoves[]> {
  return kvGet<GameWithMoves[]>(listKey(crewId), [])
}

export function cachedGame(id: string): Promise<GameWithMoves | null> {
  return kvGet<GameWithMoves | null>(gameKey(id), null)
}

/** De laatste potjes van een crew, met hun zetten. */
export async function listGames(crewId: string): Promise<GameWithMoves[]> {
  const sb = need()
  const { data: games, error } = await sb
    .from('snow_games')
    .select(GAME_COLS)
    .eq('crew_id', crewId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  const ids = (games ?? []).map((g) => g.id)
  let moves: SnowMove[] = []
  if (ids.length) {
    const res = await sb.from('snow_moves').select(MOVE_COLS).in('game_id', ids).order('seq')
    if (res.error) throw res.error
    moves = (res.data ?? []) as SnowMove[]
  }
  const list = ((games ?? []) as SnowGame[]).map((game) => ({ game, moves: moves.filter((m) => m.game_id === game.id) }))
  await kvSet(listKey(crewId), list)
  return list
}

export async function loadGame(id: string): Promise<GameWithMoves | null> {
  const sb = need()
  const { data: game, error } = await sb.from('snow_games').select(GAME_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!game) return null
  const res = await sb.from('snow_moves').select(MOVE_COLS).eq('game_id', id).order('seq')
  if (res.error) throw res.error
  const g = { game: game as SnowGame, moves: (res.data ?? []) as SnowMove[] }
  await kvSet(gameKey(id), g)
  return g
}

export async function startGame(crewId: string, players: string[]): Promise<SnowGame> {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`Kies ${MIN_PLAYERS} tot ${MAX_PLAYERS} spelers.`)
  const { data, error } = await need().from('snow_games').insert({ crew_id: crewId, players }).select(GAME_COLS).single()
  if (error) throw error
  return data as SnowGame
}

/** Vult de poging in voor wie er aan de beurt is. Bij een zet moet je de trick meegeven. */
export async function playTurn(game: SnowGame, state: SnowState, landed: boolean, trickId?: string): Promise<SnowMove> {
  const turn = state.turn
  if (!turn) throw new Error('Dit potje is al klaar.')
  const trick = turn.kind === 'match' ? turn.trickId : trickId
  if (!trick) throw new Error('Kies eerst een trick.')
  if (turn.kind === 'set' && state.used.includes(trick)) throw new Error('Die trick is al geweest. Kies een andere.')
  const move: SnowMove = { game_id: game.id, seq: state.nextSeq, kind: turn.kind, player: turn.player, trick_id: trick, landed }
  const { error } = await need().from('snow_moves').insert(move)
  // 23505: dubbel volgnummer, iemand anders was je voor; 42501: RLS, meestal om dezelfde reden
  if (error)
    throw (error as { code?: string }).code === '23505' || (error as { code?: string }).code === '42501' ? new SnowConflict() : error
  return move
}

export async function undoLast(gameId: string, seq: number) {
  const { error } = await need().from('snow_moves').delete().eq('game_id', gameId).eq('seq', seq)
  if (error) throw error
}

export async function deleteGame(id: string) {
  const { error } = await need().from('snow_games').delete().eq('id', id)
  if (error) throw error
}
