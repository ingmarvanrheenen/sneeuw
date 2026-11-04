// Spraakmemo naar tekst: de server-check van het geluid, het omzetten via de coach-functie (nagedaan), de tekst
// bij de memo en in de dagreview, de knop en de instelling (standaard uit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/auth', async (orig) => ({ ...(await orig<typeof import('../lib/auth')>()), getAccessToken: async () => 'tok' }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))

import { AUDIO_CHARS, checkAudioInput, cleanTranscript, TRANSCRIBE_PROMPT } from '../../supabase/functions/coach/protocol'
import { memoLines, reviewDay, transcribeMemo } from '../lib/coach'
import { MemoList } from '../components/VoiceMemos'
import Settings from '../pages/Settings'
import { settingsStore, updateSettings } from '../lib/settings'
import { create } from '../lib/repo'
import { db } from '../lib/db'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { MediaMeta, Session } from '../lib/types'

describe('server: geluid checken', () => {
  it('bekende formaten, base64, niet te lang', () => {
    expect(checkAudioInput({ mime: 'audio/mp4', data: 'AAAA' })).toEqual({ mime: 'audio/mp4', data: 'AAAA', ext: 'm4a' })
    expect(checkAudioInput({ mime: 'audio/webm;codecs=opus', data: 'AAAA' })).toMatchObject({ mime: 'audio/webm', ext: 'webm' })
    expect(checkAudioInput({ mime: 'video/mp4', data: 'AAAA' })).toHaveProperty('error')
    expect(checkAudioInput({ mime: 'audio/mp4', data: '' })).toHaveProperty('error')
    expect(checkAudioInput({ mime: 'audio/mp4', data: 'nee!' })).toHaveProperty('error')
    expect(checkAudioInput({ mime: 'audio/mp4', data: 'A'.repeat(AUDIO_CHARS + 1) })).toHaveProperty('error')
    expect(checkAudioInput(null)).toHaveProperty('error')
  })

  it('tekst opgeschoond; de prompt kent de snowboardtermen', () => {
    expect(cleanTranscript('  Eerste   carve\n gelukt ')).toBe('Eerste carve gelukt')
    expect(cleanTranscript(42)).toBe('')
    expect(cleanTranscript('x'.repeat(3000))).toHaveLength(2000)
    expect(TRANSCRIBE_PROMPT).toMatch(/heelside/)
  })
})

describe('in de app', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let answer: unknown = { text: 'Eerste heelside carve gelukt, knie doet beetje zeer' }
  beforeEach(async () => {
    await db.records.clear()
    await db.blobs.clear()
    await db.kv.clear()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    answer = { text: 'Eerste heelside carve gelukt, knie doet beetje zeer' }
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => answer }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    updateSettings({ memoText: false })
  })
  const sent = (i = 0) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string)
  const files = new Set<string>()
  async function memo(over: Partial<MediaMeta> = {}) {
    const m = await create('media', { type: 'audio', mime: 'audio/mp4', duration: 8, crewId: null, ...over } as never)
    files.add(m.id)
    return m as MediaMeta
  }
  // de nep-IndexedDB geeft een Blob terug zonder arrayBuffer; de echte browser wel
  beforeEach(() => {
    files.clear()
    vi.spyOn(db.blobs, 'get').mockImplementation((async (id: string) =>
      files.has(id) ? { id, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) } : undefined) as never)
  })

  it('omzetten: het geluid als base64 naar de coach-functie, de tekst komt bij de memo', async () => {
    const m = await memo()
    const text = await transcribeMemo(m)
    expect(text).toMatch(/heelside carve/)
    expect(sent()).toEqual({ mode: 'transcribe', audio: { data: 'AQID', mime: 'audio/mp4' } })
    expect(((await db.records.get(m.id)) as MediaMeta).transcript).toBe(text)
  })

  it('geen bestand op dit toestel: uitleg', async () => {
    const m = await memo()
    files.clear()
    await expect(transcribeMemo(m)).rejects.toThrow(/niet op dit toestel/)
  })

  it('de tekst van je memo’s gaat mee in de dagreview', async () => {
    const s = (await create('session', { ...EMPTY_DRAFT, date: '2027-01-17', hours: 5 })) as Session
    await memo({ sessionId: s.id, transcript: 'Bulten waren zwaar', createdAt: 2 } as Partial<MediaMeta>)
    await memo({ sessionId: s.id, createdAt: 3 } as Partial<MediaMeta>)
    await memo({ sessionId: 'ander', transcript: 'Niet van deze dag' } as Partial<MediaMeta>)
    answer = { goed: 'x', focus: 'Bulten', oefening: 'y', trickId: null, veiligheid: null }
    await reviewDay(s)
    const day = sent().day as string
    expect(day).toMatch(/Spraakmemo's van die dag:\n- "Bulten waren zwaar"/)
    expect(day).not.toMatch(/Niet van deze dag/)
    expect(memoLines([])).toBe('')
  })

  it('bij de memo: de tekst, en "Maak er tekst van" alleen met de instelling aan', async () => {
    const user = userEvent.setup()
    const m = await memo()
    const { rerender } = render(<MemoList items={[m, { ...m, id: 'x', transcript: 'Al gezegd' }]} editable />)
    expect(screen.getByText('“Al gezegd”')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Maak er tekst van' })).toBeNull()
    updateSettings({ memoText: true })
    rerender(<MemoList items={[m]} editable />)
    await user.click(await screen.findByRole('button', { name: 'Maak er tekst van' }))
    await waitFor(async () => expect(((await db.records.get(m.id)) as MediaMeta).transcript).toMatch(/heelside/))
  })

  it('instelling: standaard uit, met uitleg dat het naar OpenAI gaat', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    )
    const sw = await screen.findByRole('switch', { name: /Spraakmemo's omzetten naar tekst/ })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/gaat naar OpenAI/)).toBeTruthy()
    await user.click(sw)
    expect(settingsStore.get().memoText).toBe(true)
  })
})
