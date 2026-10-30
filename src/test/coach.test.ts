import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), getAccessToken: async () => 'tok' }))

import {
  CoachError,
  MEMORY_MAX,
  addMemory,
  applyAction,
  askDrill,
  cachedDrill,
  compareClips,
  buildContext,
  dayText,
  imageSrc,
  listMemory,
  newConversation,
  removeMemory,
  streamCoach,
  toCoachImage,
  toWire,
} from '../lib/coach'
import { db } from '../lib/db'
import { create, listKind } from '../lib/repo'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { Session } from '../lib/types'

const session = (patch: Partial<Session>): Session =>
  ({ ...EMPTY_DRAFT, id: 's1', kind: 'session', createdAt: 0, updatedAt: 0, ...patch }) as Session

describe('dagreview', () => {
  it('beschrijft de dag in gewone taal met tricknamen in plaats van ids', () => {
    const t = dayText(
      session({ resortName: 'Tignes', hours: 5, falls: 3, mood: 5, landed: ['ollie'], practiced: ['ollie', 'nollie'], pistes: ['blauw'] }),
    )
    expect(t).toContain('Waar: Tignes')
    expect(t).toContain('Gevallen: 3x')
    expect(t).toContain('Geland: Ollie')
    expect(t).toContain('Geoefend: Nollie')
    expect(t).toContain('Pistes: Blauw')
    expect(t).not.toContain('ollie,')
  })

  it('laat lege velden weg in plaats van "undefined"', () => {
    const t = dayText(session({}))
    expect(t).not.toMatch(/undefined|null/)
    expect(t).not.toContain('Notities')
  })
})

// ── Coach-upgrade: stream met knoppen, geheugen, foto's ──────────────────────

describe('stream van de coach', () => {
  const ndjson = (parts: string[], type = 'application/x-ndjson') =>
    new Response(
      new ReadableStream({
        start(c) {
          for (const p of parts) c.enqueue(new TextEncoder().encode(p))
          c.close()
        },
      }),
      { headers: { 'Content-Type': type } },
    )
  const conv = () => ({ ...newConversation('ctx'), messages: [{ role: 'user' as const, content: 'Plan?' }] })

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('leest tekst en knoppen, ook als een event over twee stukken binnenkomt', async () => {
    const fetchMock = vi.fn(async () =>
      ndjson([
        '{"t":"text","v":"Hier je"}\n{"t":"te',
        'xt","v":" plan."}\n{"t":"action","action":{"kind":"trick","trickId":"ollie"}}\n',
        '{"t":"done"}',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const chunks: string[] = []
    const seen: unknown[] = []
    const r = await streamCoach(conv(), { onText: (c) => chunks.push(c), onAction: (a) => seen.push(a) })
    expect(r).toEqual({ text: 'Hier je plan.', actions: [{ kind: 'trick', trickId: 'ollie' }] })
    expect(chunks).toEqual(['Hier je', ' plan.'])
    expect(seen).toHaveLength(1)
    // de server krijgt de trick-bijbel mee voor de knoppen, en de bearer token
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.supabase.co/functions/v1/coach')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    const body = JSON.parse(init.body as string)
    expect(body.tricks).toContainEqual({ id: 'ollie', name: 'Ollie' })
    expect(body.context).toBe('ctx')
  })

  it('werkt nog met de oude server die gewone tekst streamt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ndjson(['Gewoon ', 'tekst {"t":1}'], 'text/plain; charset=utf-8')),
    )
    const r = await streamCoach(conv(), { onText: () => {} })
    expect(r).toEqual({ text: 'Gewoon tekst {"t":1}', actions: [] })
  })

  it('een fout van de server midden in de stream wordt een CoachError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ndjson(['{"t":"text","v":"Even"}\n{"t":"error","v":"Coach is even overbelast"}\n'])),
    )
    await expect(streamCoach(conv(), { onText: () => {} })).rejects.toThrow('Coach is even overbelast')
  })

  it('stuurt alleen de laatste twee foto’s mee', () => {
    const image = { mediaType: 'image/jpeg' as const, data: 'AAAA' }
    const msgs = [0, 1, 2].flatMap((i) => [
      { role: 'user' as const, content: i ? `Foto ${i}` : '', image },
      { role: 'assistant' as const, content: 'Gezien', actions: [], applied: [0] },
    ])
    const wire = toWire(msgs)
    expect(wire.filter((m) => m.image)).toHaveLength(2)
    // oudste foto zonder tekst wordt een regel, zodat het bericht niet leeg is
    expect(wire[0]).toEqual({ role: 'user', content: '(Hier stuurde ik een foto.)' })
    // wat alleen de app nodig heeft gaat niet mee
    expect(wire[1]).toEqual({ role: 'assistant', content: 'Gezien' })
  })
})

describe('geheugen', () => {
  beforeEach(async () => {
    await db.kv.clear()
  })

  it('nieuw bovenaan, hetzelfde feit niet dubbel, wissen kan', async () => {
    await addMemory('Rijdt goofy')
    await addMemory('Linkerpols is gevoelig')
    const list = await addMemory('  rijdt GOOFY ')
    expect(list.map((m) => m.text)).toEqual(['Linkerpols is gevoelig', 'Rijdt goofy'])
    expect((await removeMemory(list[0].id)).map((m) => m.text)).toEqual(['Rijdt goofy'])
  })

  it('houdt er max 30', async () => {
    for (let i = 0; i < MEMORY_MAX + 5; i++) await addMemory(`Feit ${i}`)
    const list = await listMemory()
    expect(list).toHaveLength(MEMORY_MAX)
    expect(list[0].text).toBe(`Feit ${MEMORY_MAX + 4}`)
  })

  it('de coach krijgt het geheugen mee in de context', async () => {
    expect(await buildContext()).toContain('Wat de coach onthouden heeft:\n- nog niks')
    await addMemory('Bang voor sleepliften')
    expect(await buildContext()).toContain('Wat de coach onthouden heeft:\n- Bang voor sleepliften')
  })
})

describe('knoppen uitvoeren', () => {
  beforeEach(async () => {
    await db.records.clear()
    await db.kv.clear()
  })

  it('doel met trick wordt een doel; onbekende trick valt weg', async () => {
    expect(await applyAction({ kind: 'doel', titel: 'Ollie landen', trickId: 'ollie' })).toBe(1)
    await applyAction({ kind: 'doel', titel: 'Iets anders', trickId: 'bestaat-niet' })
    const goals = (await listKind('goal')).sort((a, b) => a.title.localeCompare(b.title))
    expect(goals.map((g) => [g.title, g.trickId, g.done])).toEqual([
      ['Iets anders', undefined, false],
      ['Ollie landen', 'ollie', false],
    ])
  })

  it('plan: elke dag een doel, aan de volgende trip gehangen', async () => {
    const trip = await create('trip', { name: 'Tignes', startDate: '2999-01-10', endDate: '2999-01-17' } as never)
    await create('trip', { name: 'Vorig jaar', startDate: '2000-01-10', endDate: '2000-01-17' } as never)
    const n = await applyAction({
      kind: 'plan',
      titel: 'Tignes',
      dagen: [
        { dag: 'Dag 1', focus: 'Heelside turns', oefeningen: [] },
        { dag: 'Dag 2', focus: 'Linken', oefeningen: ['Garlands'] },
      ],
    })
    expect(n).toBe(2)
    const goals = await listKind('goal')
    expect(goals.map((g) => g.title).sort()).toEqual(['Dag 1: Heelside turns', 'Dag 2: Linken'])
    expect(goals.every((g) => g.tripId === trip.id)).toBe(true)
  })

  it('onthoud komt in het geheugen, geen doel', async () => {
    expect(await applyAction({ kind: 'onthoud', feit: 'Heeft een 154 board' })).toBe(0)
    expect((await listMemory()).map((m) => m.text)).toEqual(['Heeft een 154 board'])
    expect(await listKind('goal')).toEqual([])
  })
})

describe('foto voor de coach', () => {
  afterEach(() => vi.restoreAllMocks())

  it('verkleint tot max 1024 px en geeft kale base64 JPEG', () => {
    const drawn: number[][] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: (_: unknown, x: number, y: number, w: number, h: number) => drawn.push([x, y, w, h]),
    } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,QUJD')
    const img = toCoachImage(document.createElement('img'), 4032, 3024)
    expect(img).toEqual({ mediaType: 'image/jpeg', data: 'QUJD' })
    expect(drawn[0]).toEqual([0, 0, 1024, 768])
    expect(imageSrc(img)).toBe('data:image/jpeg;base64,QUJD')
  })

  it('zonder canvas een nette fout', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() => toCoachImage(document.createElement('img'), 10, 10)).toThrow(CoachError)
  })
})

describe('drill van de dag', () => {
  beforeEach(async () => {
    await db.kv.clear()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
  const answer = (over = {}) =>
    new Response(JSON.stringify({ titel: 'Garlands', waarom: 'Rustig', stappen: ['Een', 'Twee'], minuten: 15, trickId: 'ollie', ...over }))

  it('één call per dag: daarna komt hij uit de cache; eerdere drills gaan mee voor afwisseling', async () => {
    const fetchMock = vi.fn(async () => answer())
    vi.stubGlobal('fetch', fetchMock)
    const d = await askDrill('2027-01-16')
    expect(d).toMatchObject({ titel: 'Garlands', trickId: 'ollie', date: '2027-01-16' })
    await askDrill('2027-01-16')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await cachedDrill('2027-01-16')).toMatchObject({ titel: 'Garlands' })
    expect(await cachedDrill('2027-01-17')).toBeNull()

    fetchMock.mockImplementation(async () => answer({ titel: 'Switch-bochten' }))
    await askDrill('2027-01-17')
    const body = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)
    expect(body.mode).toBe('drill')
    expect(body.recent).toEqual(['Garlands'])
    expect(body.context).toContain('Laatste dagen')
    expect(body.trickIds).toContain('ollie')
  })

  it('onbruikbaar antwoord: nette fout en niks bewaard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ titel: '' }))),
    )
    await expect(askDrill('2027-01-16')).rejects.toBeInstanceOf(CoachError)
    expect(await cachedDrill('2027-01-16')).toBeNull()
  })

  it('voor en na: stuurt beide beelden, de tricknaam en het aantal dagen', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ beter: 'Lager', nogWerk: 'Blik', drill: 'Garlands' })))
    vi.stubGlobal('fetch', fetchMock)
    const pic = { mediaType: 'image/jpeg' as const, data: btoa('x'.repeat(300)) }
    expect(await compareClips('ollie', pic, pic, 30)).toEqual({ beter: 'Lager', nogWerk: 'Blik', drill: 'Garlands' })
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ mode: 'compare', trick: 'Ollie', days: 30, before: pic, after: pic })
  })
})
