import { beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof import('./fakeSupabase').fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true }
})

import {
  SnowConflict,
  cachedGames,
  isOut,
  lettersText,
  listGames,
  playTurn,
  snowState,
  startGame,
  undoLast,
  type SnowGame,
  type SnowMove,
} from '../lib/snow'
import { db } from '../lib/db'

const P = ['ik', 'daan', 'sem']
let seq = 0
const set = (player: string, trick: string, landed: boolean): SnowMove => ({
  game_id: 'g',
  seq: seq++,
  kind: 'set',
  player,
  trick_id: trick,
  landed,
})
const match = (player: string, trick: string, landed: boolean): SnowMove => ({
  game_id: 'g',
  seq: seq++,
  kind: 'match',
  player,
  trick_id: trick,
  landed,
})

beforeEach(() => {
  seq = 0
})

describe('spelregels', () => {
  it('begin: de eerste speler zet, niemand heeft letters', () => {
    const s = snowState(P, [])
    expect(s.turn).toEqual({ kind: 'set', player: 'ik' })
    expect(s.letters).toEqual({ ik: 0, daan: 0, sem: 0 })
    expect(s.nextSeq).toBe(0)
  })

  it('zetter landt: de rest doet hem na in volgorde, wie mist krijgt een letter, de zetter blijft zetten', () => {
    const moves = [set('ik', 'ollie', true), match('daan', 'ollie', false)]
    let s = snowState(P, moves)
    expect(s.letters.daan).toBe(1)
    expect(s.turn).toEqual({ kind: 'match', player: 'sem', trickId: 'ollie', setter: 'ik' })
    s = snowState(P, [...moves, match('sem', 'ollie', true)])
    expect(s.turn).toEqual({ kind: 'set', player: 'ik' })
    expect(s.used).toEqual(['ollie'])
  })

  it('zetter mist: geen letters, de volgende mag zetten', () => {
    const s = snowState(P, [set('ik', 'shifty', false)])
    expect(s.turn).toEqual({ kind: 'set', player: 'daan' })
    expect(s.letters).toEqual({ ik: 0, daan: 0, sem: 0 })
    // een gemiste trick mag later wel weer
    expect(s.used).toEqual([])
  })

  it('nadoen begint bij de speler na de zetter en loopt rond', () => {
    const s = snowState(P, [set('ik', 'shifty', false), set('daan', 'nollie', true)])
    expect(s.turn).toMatchObject({ kind: 'match', player: 'sem' })
    const t = snowState(P, [set('ik', 'shifty', false), set('daan', 'nollie', true), match('sem', 'nollie', true)])
    expect(t.turn).toMatchObject({ kind: 'match', player: 'ik' })
  })

  it('bij W lig je eruit en sla je beurten over; de laatste die over is wint', () => {
    const moves: SnowMove[] = []
    // ik zet vier tricks, daan mist ze allemaal, sem landt ze
    for (const t of ['ollie', 'nollie', 'shifty', 'butter']) moves.push(set('ik', t, true), match('daan', t, false), match('sem', t, true))
    let s = snowState(P, moves)
    expect(s.letters.daan).toBe(4)
    expect(isOut(s, 'daan')).toBe(true)
    expect(s.winner).toBeNull()
    // ik mist: beurt slaat daan over en gaat naar sem
    moves.push(set('ik', 'press', false))
    s = snowState(P, moves)
    expect(s.turn).toEqual({ kind: 'set', player: 'sem' })
    // sem zet, ik mis vier keer
    for (const t of ['revert', 'tail-press', 'nose-press', 'flat-180']) moves.push(set('sem', t, true), match('ik', t, false))
    s = snowState(P, moves)
    expect(s.winner).toBe('sem')
    expect(s.turn).toBeNull()
    expect(lettersText(s.letters.ik)).toBe('S.N.O.W')
  })

  it('wat niet past telt niet: verkeerde speler, dubbele trick, andere trick bij nadoen, na de winst', () => {
    const s = snowState(
      ['ik', 'daan'],
      [
        set('daan', 'ollie', true), // niet aan de beurt
        set('ik', 'ollie', true),
        match('daan', 'nollie', false), // verkeerde trick
        match('daan', 'ollie', true),
        set('ik', 'ollie', true), // al geweest
        set('ik', 'nollie', true),
      ],
    )
    expect(s.moves.map((m) => m.seq)).toEqual([1, 3, 5])
    expect(s.turn).toEqual({ kind: 'match', player: 'daan', trickId: 'nollie', setter: 'ik' })
    // volgnummer loopt door na de laatste zet, ook als die niet telde
    expect(s.nextSeq).toBe(6)
  })

  it('zetten in willekeurige volgorde geven dezelfde stand', () => {
    const moves = [set('ik', 'ollie', true), match('daan', 'ollie', false), match('sem', 'ollie', false)]
    expect(snowState(P, [...moves].reverse())).toEqual(snowState(P, moves))
  })
})

describe('data', () => {
  const game: SnowGame = { id: 'g', crew_id: 'c1', players: P, created_by: 'ik', created_at: 'x' }

  beforeEach(async () => {
    sb.ref!.reset()
    await db.kv.clear()
  })

  it('potjes van de crew met hun zetten, en lokaal bewaard voor offline', async () => {
    sb.ref!.respond((c) =>
      c.table === 'snow_games'
        ? { data: [game] }
        : { data: [{ game_id: 'g', seq: 0, kind: 'set', player: 'ik', trick_id: 'ollie', landed: true }] },
    )
    const list = await listGames('c1')
    expect(list).toHaveLength(1)
    expect(list[0].moves).toHaveLength(1)
    expect(sb.ref!.calls[0].filters).toContainEqual(['eq', 'crew_id', 'c1'])
    expect(sb.ref!.calls[1].filters).toContainEqual(['in', 'game_id', ['g']])
    expect(await cachedGames('c1')).toEqual(list)
  })

  it('poging invullen: volgende volgnummer, wie aan de beurt is, de trick van de zet', async () => {
    const s = snowState(P, [set('ik', 'ollie', true)])
    const m = await playTurn(game, s, false)
    expect(m).toEqual({ game_id: 'g', seq: 1, kind: 'match', player: 'daan', trick_id: 'ollie', landed: false })
    expect(sb.ref!.calls[0]).toMatchObject({ table: 'snow_moves', op: 'insert', payload: m })
  })

  it('zetten zonder trick of met een al gelande trick kan niet', async () => {
    const s = snowState(P, [set('ik', 'ollie', true), match('daan', 'ollie', true), match('sem', 'ollie', true)])
    await expect(playTurn(game, s, true)).rejects.toThrow('Kies eerst een trick')
    await expect(playTurn(game, s, true, 'ollie')).rejects.toThrow('al geweest')
    expect(sb.ref!.calls).toEqual([])
  })

  it('iemand anders was je voor: een nette melding in plaats van een databasefout', async () => {
    sb.ref!.respond(() => ({ error: { code: '23505', message: 'duplicate key' } }))
    await expect(playTurn(game, snowState(P, []), true, 'ollie')).rejects.toBeInstanceOf(SnowConflict)
  })

  it('starten met te weinig spelers kan niet; ongedaan maken haalt precies die zet weg', async () => {
    await expect(startGame('c1', ['ik'])).rejects.toThrow('2 tot 8')
    await undoLast('g', 4)
    expect(sb.ref!.calls[0]).toMatchObject({ table: 'snow_moves', op: 'delete' })
    expect(sb.ref!.calls[0].filters).toEqual([
      ['eq', 'game_id', 'g'],
      ['eq', 'seq', 4],
    ])
  })
})
