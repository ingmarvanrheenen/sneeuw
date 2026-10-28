import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Call } from './fakeSupabase'

// Nep-server in het geheugen: potjes en zetten, met dezelfde regel voor volgnummers als de database.
const server = vi.hoisted(() => ({
  games: [] as Record<string, unknown>[],
  moves: [] as Record<string, unknown>[],
  /** zet die "iemand anders" net invult voordat onze insert aankomt */
  sneak: null as Record<string, unknown> | null,
}))
const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof import('./fakeSupabase').fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true }
})
const crew = vi.hoisted(() => ({ crewMembers: vi.fn() }))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), ...crew }))

import Snow from '../pages/Snow'
import { SnowGames } from '../components/SnowParts'
import { authStore } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { toastStore } from '../lib/toast'
import type { User } from '@supabase/supabase-js'

const MEMBERS = [
  { user_id: 'me', display_name: 'Ingmar', role: 'owner', stats: {} },
  { user_id: 'daan', display_name: 'Daan', role: 'member', stats: {} },
  { user_id: 'sem', display_name: 'Sem', role: 'member', stats: {} },
]
const toasts = () => toastStore.get().map((t) => t.title)
const val = (c: Call, col: string) => c.filters.find((f) => f[1] === col)?.[2]

function respond(c: Call) {
  if (c.table === 'snow_games') {
    if (c.op === 'insert') {
      const g = { id: `g${server.games.length + 1}`, created_by: 'me', created_at: `t${server.games.length}`, ...(c.payload as object) }
      server.games.push(g)
      return { data: g }
    }
    const id = val(c, 'id')
    if (id) return { data: server.games.find((g) => g.id === id) ?? null }
    return { data: [...server.games].filter((g) => g.crew_id === val(c, 'crew_id')).reverse() }
  }
  if (c.table === 'snow_moves') {
    if (c.op === 'insert') {
      if (server.sneak) {
        server.moves.push(server.sneak)
        server.sneak = null
      }
      const m = c.payload as { game_id: string; seq: number }
      const next = server.moves.filter((x) => x.game_id === m.game_id).length
      if (m.seq !== next) return { error: { code: '23505', message: 'duplicate key' } }
      server.moves.push(m as Record<string, unknown>)
      return { data: null }
    }
    if (c.op === 'delete') {
      server.moves = server.moves.filter((x) => !(x.game_id === val(c, 'game_id') && x.seq === val(c, 'seq')))
      return { data: null }
    }
    const ids = (val(c, 'in') as string[]) ?? c.filters.filter((f) => f[0] === 'in').map((f) => f[2])[0] ?? [val(c, 'game_id')]
    return {
      data: server.moves.filter((x) => (ids as unknown[]).includes(x.game_id)).sort((a, b) => (a.seq as number) - (b.seq as number)),
    }
  }
  return { data: [] }
}

const openGame = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/snow/${id}`]}>
      <Routes>
        <Route path="/snow/:id" element={<Snow />} />
        <Route path="/tricks/:id" element={<div>bijbel</div>} />
      </Routes>
    </MemoryRouter>,
  )

const game = (players = ['me', 'daan']) => {
  server.games.push({ id: 'g1', crew_id: 'c1', players, created_by: 'me', created_at: 't0' })
}
const move = (seq: number, kind: string, player: string, trick_id: string, landed: boolean) =>
  server.moves.push({ game_id: 'g1', seq, kind, player, trick_id, landed })

beforeEach(async () => {
  server.games = []
  server.moves = []
  server.sneak = null
  sb.ref!.reset()
  sb.ref!.respond(respond)
  await db.kv.clear()
  setCurrentUserId('me')
  authStore.set({ user: { id: 'me' } as User, ready: true })
  toastStore.set([])
  crew.crewMembers.mockResolvedValue(MEMBERS)
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
})
afterEach(() => cleanup())

describe('een potje spelen', () => {
  it('jij zet een trick neer, landt hem, en dan is Daan aan de beurt om hem na te doen', async () => {
    const user = userEvent.setup()
    game()
    openGame('g1')
    expect(await screen.findByRole('heading', { name: 'Jij zet een trick neer' })).toBeTruthy()
    // zonder trick kun je niks invullen
    expect((screen.getByRole('button', { name: 'Geland' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: /Kies een trick/ }))
    const picker = screen.getByRole('dialog', { name: 'Kies een trick' })
    await user.type(within(picker).getByRole('textbox', { name: 'Zoek een trick' }), 'oll')
    await user.click(within(picker).getByRole('button', { name: 'Ollie' }))
    expect(screen.getByRole('link', { name: /Bekijk hoe hij moet/ }).getAttribute('href')).toBe('/tricks/ollie')
    await user.click(screen.getByRole('button', { name: 'Geland' }))

    expect(await screen.findByRole('heading', { name: 'Daan doet de Ollie na' })).toBeTruthy()
    expect(server.moves).toEqual([{ game_id: 'g1', seq: 0, kind: 'set', player: 'me', trick_id: 'ollie', landed: true }])
    expect(screen.getByText('Jij zet de Ollie neer')).toBeTruthy()
  })

  it('Daan mist: hij krijgt de S, en het verloop laat het zien', async () => {
    const user = userEvent.setup()
    game()
    move(0, 'set', 'me', 'ollie', true)
    openGame('g1')
    await user.click(await screen.findByRole('button', { name: 'Mis' }))
    await waitFor(() => expect(toasts()).toContain('Daan krijgt de S'))
    expect(screen.getByText('Daan mist de Ollie')).toBeTruthy()
    const daan = screen.getByText('Daan').closest('div.flex')!
    expect(within(daan as HTMLElement).getByLabelText('Letters: S')).toBeTruthy()
  })

  it('al gelande tricks kun je niet nog een keer kiezen', async () => {
    const user = userEvent.setup()
    game()
    move(0, 'set', 'me', 'ollie', true)
    move(1, 'match', 'daan', 'ollie', true)
    openGame('g1')
    await user.click(await screen.findByRole('button', { name: /Kies een trick/ }))
    const picker = screen.getByRole('dialog', { name: 'Kies een trick' })
    await user.type(within(picker).getByRole('textbox'), 'ollie')
    expect(within(picker).queryByRole('button', { name: 'Ollie' })).toBeNull()
    expect(within(picker).getByText('Al geweest')).toBeTruthy()
  })

  it('laatste letter: winnaar in beeld, en revanche start een nieuw potje waarin de winnaar begint', async () => {
    const user = userEvent.setup()
    game()
    // ik mis mijn zet, daan zet drie tricks die ik mis, en zet dan de ollie
    let seq = 0
    move(seq++, 'set', 'me', 'shifty', false)
    for (const t of ['nose-press', 'tail-press', 'butter']) {
      move(seq++, 'set', 'daan', t, true)
      move(seq++, 'match', 'me', t, false)
    }
    move(seq++, 'set', 'daan', 'ollie', true)
    openGame('g1')
    expect(await screen.findByRole('heading', { name: 'Jij doet de Ollie na' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Mis' }))
    expect(await screen.findByRole('heading', { name: 'Daan wint' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Geland' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Nog een potje/ }))
    await waitFor(() => expect(server.games).toHaveLength(2))
    expect(server.games[1]).toMatchObject({ crew_id: 'c1', players: ['daan', 'me'] })
  })

  it('iemand anders was je net voor: melding, en de stand van de server komt in beeld', async () => {
    const user = userEvent.setup()
    game()
    move(0, 'set', 'me', 'ollie', true)
    openGame('g1')
    await screen.findByRole('heading', { name: 'Daan doet de Ollie na' })
    server.sneak = { game_id: 'g1', seq: 1, kind: 'match', player: 'daan', trick_id: 'ollie', landed: true }
    await user.click(screen.getByRole('button', { name: 'Mis' }))
    await waitFor(() => expect(toasts()).toContain('Net te laat'))
    expect(await screen.findByRole('heading', { name: 'Jij zet een trick neer' })).toBeTruthy()
    expect(screen.getByText('Daan doet de Ollie na')).toBeTruthy()
  })

  it('laatste zet ongedaan maken', async () => {
    const user = userEvent.setup()
    game()
    move(0, 'set', 'me', 'ollie', true)
    move(1, 'match', 'daan', 'ollie', false)
    openGame('g1')
    await screen.findByText('Daan mist de Ollie')
    await user.click(screen.getByRole('button', { name: 'Laatste ongedaan maken' }))
    expect(await screen.findByRole('heading', { name: 'Daan doet de Ollie na' })).toBeTruthy()
    expect(server.moves).toHaveLength(1)
  })

  it('onbekend potje', async () => {
    openGame('bestaat-niet')
    expect(await screen.findByText('Potje niet gevonden')).toBeTruthy()
  })
})

describe('potjes op de crew-pagina', () => {
  const list = () =>
    render(
      <MemoryRouter initialEntries={['/crew']}>
        <Routes>
          <Route path="/crew" element={<SnowGames crewId="c1" members={MEMBERS} me="me" />} />
          <Route path="/snow/:id" element={<div>potje open</div>} />
        </Routes>
      </MemoryRouter>,
    )

  it('leeg: de spelregels; nieuw potje met spelers in de volgorde waarin je tikt', async () => {
    const user = userEvent.setup()
    list()
    expect(await screen.findByText('Nog geen potjes')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Nieuw potje/ }))
    const sheet = screen.getByRole('dialog', { name: 'Nieuw potje' })
    // jij staat er al in
    expect((within(sheet).getByRole('button', { name: /Kies minstens 2 spelers/ }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(within(sheet).getByRole('button', { name: /Sem/ }))
    await user.click(within(sheet).getByRole('button', { name: /Daan/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Start met 3 spelers' }))
    expect(await screen.findByText('potje open')).toBeTruthy()
    expect(server.games[0]).toMatchObject({ crew_id: 'c1', players: ['me', 'sem', 'daan'] })
  })

  it('wie net de crew joinde staat er bij "Nieuw potje" meteen tussen', async () => {
    const user = userEvent.setup()
    // de pagina kent alleen jou en Daan; Sem joinde daarna
    render(
      <MemoryRouter>
        <SnowGames crewId="c1" members={MEMBERS.slice(0, 2)} me="me" />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /Nieuw potje/ }))
    const sheet = screen.getByRole('dialog', { name: 'Nieuw potje' })
    expect(await within(sheet).findByRole('button', { name: /Sem/ })).toBeTruthy()
    expect(crew.crewMembers).toHaveBeenCalledWith('c1')
  })

  it('lopende en gewonnen potjes met hoe het staat', async () => {
    game()
    move(0, 'set', 'me', 'ollie', true)
    server.games.push({ id: 'g2', crew_id: 'c1', players: ['daan', 'sem'], created_by: 'daan', created_at: 't1' })
    for (let i = 0; i < 4; i++) {
      const t = ['ollie', 'nollie', 'shifty', 'revert'][i]
      server.moves.push({ game_id: 'g2', seq: i * 2, kind: 'set', player: 'daan', trick_id: t, landed: true })
      server.moves.push({ game_id: 'g2', seq: i * 2 + 1, kind: 'match', player: 'sem', trick_id: t, landed: false })
    }
    list()
    expect(await screen.findByText('Daan won')).toBeTruthy()
    expect(screen.getByText('Daan doet de Ollie na')).toBeTruthy()
    expect(screen.getByText('Jij, Daan')).toBeTruthy()
  })
})
