// Eigen programma van de coach: de server-check, de call vanuit de app (bewaard bij je programma's) en de
// pagina's (maken, volgen, op Home, weggooien). Netwerk is gemockt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), getAccessToken: async () => 'tok' }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))

import { checkProgram, checkProgramInput, programSchema, PROGRAM_DAYS } from '../../supabase/functions/coach/protocol'
import { askProgram } from '../lib/coach'
import {
  addCustomProgram,
  allPrograms,
  loadPrograms,
  MAX_CUSTOM,
  programById,
  programStore,
  removeCustomProgram,
  setDayDone,
  startProgram,
} from '../lib/programs'
import { PROGRAMS, type Program } from '../content/programs'
import Programs from '../pages/Programs'
import Home from '../pages/Home'
import { authStore } from '../lib/auth'
import { setTrickStatus } from '../lib/repo'
import { db } from '../lib/db'
import type { User } from '@supabase/supabase-js'

const ids = ['switch', 'ollie', 'nose-press', 'fs-180']
const rawDay = (n: number, over: Record<string, unknown> = {}) => ({
  titel: `Dag ${n}`,
  doel: 'Doel',
  piste: 'blauw',
  oefeningen: ['Een', 'Twee'],
  tricks: ['switch'],
  ...over,
})
const raw = (n: number) => ({
  naam: 'Switch in vijf dagen',
  blurb: 'Van regular naar switch op blauw.',
  start: 'Je rijdt gekoppelde bochten.',
  dagen: Array.from({ length: n }, (_, i) => rawDay(i + 1)),
})

describe('server: programma checken', () => {
  it('input: 2 tot 7 dagen, wens mag leeg', () => {
    expect(checkProgramInput({ days: 5, wish: '  switch  ' })).toEqual({ days: 5, wish: 'switch' })
    expect(checkProgramInput({ days: 3 })).toEqual({ days: 3, wish: '' })
    expect(checkProgramInput({ days: PROGRAM_DAYS.min - 1 })).toHaveProperty('error')
    expect(checkProgramInput({ days: PROGRAM_DAYS.max + 1 })).toHaveProperty('error')
    expect(checkProgramInput({ days: 'veel' })).toHaveProperty('error')
  })

  it('schema: precies zoveel dagen, alleen tricks uit de lijst en echte pistes', () => {
    const s = programSchema(ids, 4) as {
      required: string[]
      properties: {
        dagen: {
          description: string
          items: { properties: { tricks: { items: { enum: string[] } }; piste: { anyOf: { enum?: string[] }[] } } }
        }
      }
    }
    expect(s.required).toEqual(['naam', 'blurb', 'start', 'dagen'])
    expect(s.properties.dagen.description).toMatch(/Precies 4 dagen/)
    expect(s.properties.dagen.items.properties.tricks.items.enum).toEqual(ids)
    expect(s.properties.dagen.items.properties.piste.anyOf[0].enum).toEqual(['groen', 'blauw', 'rood', 'zwart'])
  })

  it('opschonen: verzonnen tricks en pistes eraf, max 4 oefeningen en 3 tricks, te veel dagen eraf', () => {
    const r = raw(6)
    r.dagen[0] = rawDay(1, {
      titel: '  Switch   staan ',
      piste: 'paars',
      oefeningen: ['a', '', 'b', 'c', 'd', 'e'],
      tricks: ['verzonnen', 'switch', 'switch', 'ollie', 'nose-press', 'fs-180'],
    })
    const p = checkProgram(r, ids, 5)!
    expect(p.dagen).toHaveLength(5)
    expect(p.dagen[0]).toEqual({
      titel: 'Switch staan',
      doel: 'Doel',
      piste: null,
      oefeningen: ['a', 'b', 'c', 'd'],
      tricks: ['switch', 'ollie', 'nose-press'],
    })
  })

  it('onbruikbaar: geen naam, te weinig dagen, of een dag zonder oefeningen of bestaande trick', () => {
    expect(checkProgram({ ...raw(3), naam: '' }, ids, 3)).toBeNull()
    expect(checkProgram(raw(2), ids, 3)).toBeNull()
    const noTricks = raw(3)
    noTricks.dagen[1] = rawDay(2, { tricks: ['verzonnen'] })
    expect(checkProgram(noTricks, ids, 3)).toBeNull()
    const noTasks = raw(3)
    noTasks.dagen[2] = rawDay(3, { oefeningen: [] })
    expect(checkProgram(noTasks, ids, 3)).toBeNull()
    expect(checkProgram(null, ids, 3)).toBeNull()
  })
})

const coachProgram = (id: string, over: Partial<Program> = {}): Program => ({
  id,
  name: `Programma ${id}`,
  blurb: 'Blurb',
  start: 'Start',
  days: [
    { title: 'Een', goal: 'G', tricks: ['switch'], tasks: ['a', 'b'] },
    { title: 'Twee', goal: 'G', tricks: ['switch'], tasks: ['a', 'b'] },
  ],
  coach: { wish: '', createdAt: 1 },
  ...over,
})

describe('programma’s van de coach bewaren', () => {
  beforeEach(async () => {
    await db.kv.clear()
    await loadPrograms()
  })

  it('bovenaan bij alle programma’s, vindbaar op id, en volgen werkt zoals bij de kant-en-klare', async () => {
    let s = await addCustomProgram(coachProgram('coach-a'))
    s = await addCustomProgram(coachProgram('coach-b'))
    expect(allPrograms(s).map((p) => p.id)).toEqual(['coach-b', 'coach-a', ...PROGRAMS.map((p) => p.id)])
    expect(programById(s, 'coach-a')?.name).toBe('Programma coach-a')
    expect(programById(s, 'carven')?.name).toBe('Leren carven')
    await startProgram('coach-a')
    await setDayDone('coach-a', 0, true)
    s = await setDayDone('coach-a', 1, true)
    // laatste dag af: ook bij een programma van de coach is hij dan klaar
    expect(s.active).toBeNull()
  })

  it('max 10: de oudste valt eraf, maar niet als je hem volgt', async () => {
    await addCustomProgram(coachProgram('coach-0'))
    await startProgram('coach-0')
    for (let i = 1; i <= MAX_CUSTOM; i++) await addCustomProgram(coachProgram(`coach-${i}`))
    const s = programStore.get()
    expect(s.custom).toHaveLength(MAX_CUSTOM)
    expect(s.custom!.some((p) => p.id === 'coach-0')).toBe(true)
    expect(s.custom!.some((p) => p.id === 'coach-1')).toBe(false)
  })

  it('weggooien haalt hem en je voortgang weg, en stopt hem als hij liep', async () => {
    await addCustomProgram(coachProgram('coach-a'))
    await startProgram('coach-a')
    await setDayDone('coach-a', 0, true)
    const s = await removeCustomProgram('coach-a')
    expect(s.custom).toEqual([])
    expect(s.runs['coach-a']).toBeUndefined()
    expect(s.active).toBeNull()
  })
})

describe('app: coach maakt je programma', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let queue: unknown[] = []
  beforeEach(async () => {
    await db.records.clear()
    await db.kv.clear()
    await loadPrograms()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    authStore.set({ user: { id: 'me' } as User, ready: true })
    queue = []
    fetchMock = vi.fn(async () => {
      const body = queue.shift()
      return body && typeof body === 'object' && 'status' in body
        ? { ok: false, status: (body as { status: number }).status, json: async () => body }
        : { ok: true, json: async () => body }
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
  const sent = (i = 0) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string)

  it('stuurt wens, dagen, je niveau en alleen tricks die je nog niet beheerst; bewaart het als programma', async () => {
    await setTrickStatus('ollie', 'beheerst')
    queue.push({ ...raw(3), dagen: [rawDay(1, { tricks: ['switch', 'ollie'] }), rawDay(2, { piste: null }), rawDay(3)] })
    const p = await askProgram('  switch rijden ', 3)
    const body = sent()
    expect(body).toMatchObject({ mode: 'program', wish: 'switch rijden', days: 3 })
    expect(body.context).toBeTruthy()
    expect(body.trickIds).toContain('switch')
    expect(body.trickIds).not.toContain('ollie')
    // ollie zat niet in de lijst, dus valt eraf; een dag zonder piste heeft er geen
    expect(p.days[0]).toEqual({ title: 'Dag 1', goal: 'Doel', piste: 'blauw', tricks: ['switch'], tasks: ['Een', 'Twee'] })
    expect(p.days[1].piste).toBeUndefined()
    expect(p.name).toBe('Switch in vijf dagen')
    expect(p.coach?.wish).toBe('switch rijden')
    expect(p.id).toMatch(/^coach-/)
    expect(programStore.get().custom?.[0].id).toBe(p.id)
  })

  it('kapot antwoord: een fout, en niets bewaard', async () => {
    queue.push({ naam: 'x', dagen: [] })
    await expect(askProgram('', 3)).rejects.toThrow(/geen bruikbaar programma/)
    expect(programStore.get().custom ?? []).toEqual([])
  })

  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/programmas" element={<Programs />} />
          <Route path="/programmas/:id" element={<Programs />} />
        </Routes>
      </MemoryRouter>,
    )

  it('maken met wens en 3 dagen, dan sta je op je programma; starten, en Home toont je dag', async () => {
    const user = userEvent.setup()
    queue.push(raw(3))
    at('/programmas')
    await user.type(screen.getByLabelText('Wat wil je leren? (mag leeg)'), 'switch')
    await user.click(screen.getByRole('tab', { name: '3 dagen' }))
    await user.click(screen.getByRole('button', { name: 'Maak mijn programma' }))
    expect(await screen.findByText('3 dagen, van Coach Daddy')).toBeTruthy()
    expect(sent()).toMatchObject({ wish: 'switch', days: 3 })
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByText('Een')).toBeTruthy()
    cleanup()
    at('/')
    expect(await screen.findByRole('link', { name: /Dag 1: Dag 1/ })).toBeTruthy()
    cleanup()
    at('/programmas')
    expect(await screen.findByText('Van de coach')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Switch in vijf dagen/ }).textContent).toMatch(/Bezig: dag 1 van 3/)
  })

  it('fout van de coach staat bij het formulier', async () => {
    const user = userEvent.setup()
    queue.push({ status: 503, error: 'Coach is even weg' })
    at('/programmas')
    await user.click(screen.getByRole('button', { name: 'Maak mijn programma' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Coach is even weg')
    expect(screen.queryByText('Van de coach')).toBeNull()
  })

  it('niet ingelogd: knop uit, met uitleg', async () => {
    authStore.set({ user: null, ready: true })
    at('/programmas')
    expect((screen.getByRole('button', { name: 'Maak mijn programma' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Log in om de coach een programma te laten maken.')).toBeTruthy()
  })

  it('weggooien kan alleen bij die van de coach', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', () => true)
    await addCustomProgram(coachProgram('coach-a'))
    at('/programmas/coach-a')
    await user.click(await screen.findByRole('button', { name: 'Weggooien' }))
    expect(await screen.findByText('Kant-en-klaar')).toBeTruthy()
    await waitFor(() => expect(programStore.get().custom).toEqual([]))
    cleanup()
    at('/programmas/carven')
    expect((await screen.findAllByText('Leren carven')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Weggooien' })).toBeNull()
  })
})
