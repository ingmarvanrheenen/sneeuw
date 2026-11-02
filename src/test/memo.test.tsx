// Spraakmemo's bij je dag: opnemen (microfoon en MediaRecorder nagebootst), bewaren, terugluisteren,
// losse memo's die bij de dag komen, en memo's die nooit tussen je foto's en video's belanden.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import LogDetail from '../pages/LogDetail'
import Home from '../pages/Home'
import LogEditor from '../pages/LogEditor'
import { adoptMemos, fmtDuration, isVisual, looseMemos, MEMO_MAX_S, micError, pickAudioMime, saveMemo, startRecording } from '../lib/memo'
import { create } from '../lib/repo'
import { db } from '../lib/db'
import { EMPTY_DRAFT, saveSession } from '../lib/sessions'
import { todayISO } from '../lib/ids'
import { pickEntries } from '../lib/tournament'
import { toPosts, type FeedItem } from '../lib/crew'
import { toastStore } from '../lib/toast'
import type { MediaMeta } from '../lib/types'

let clock = Date.now()
const tracks: { stop: ReturnType<typeof vi.fn> }[] = []
let mic: () => Promise<unknown>

class FakeRecorder {
  static isTypeSupported = (t: string) => t === 'audio/mp4'
  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: ((e: Event) => void) | null = null
  constructor(_s: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? ''
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['geluid'], { type: this.mimeType }) })
    this.onstop?.(new Event('stop'))
  }
}

beforeEach(async () => {
  await db.records.clear()
  await db.blobs.clear()
  await db.kv.clear()
  toastStore.set([])
  tracks.length = 0
  mic = async () => {
    const t = { stop: vi.fn() }
    tracks.push(t)
    return { getTracks: () => [t] }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => mic() } })
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:memo', revokeObjectURL: () => {} }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const memos = async () =>
  ((await db.records.where('kind').equals('media').toArray()) as MediaMeta[]).filter((m) => m.type === 'audio' && !m.deleted)

describe('memo-logica', () => {
  it('tijd als m:ss', () => {
    expect(fmtDuration(7.4)).toBe('0:07')
    expect(fmtDuration(60)).toBe('1:00')
    expect(fmtDuration(undefined)).toBe('0:00')
  })

  it('formaat: mp4 als het kan (iPhone), anders webm; zonder MediaRecorder niks', () => {
    expect(pickAudioMime((t) => t === 'audio/mp4')).toBe('audio/mp4')
    expect(pickAudioMime((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus')
    expect(pickAudioMime(() => false)).toBe('')
    vi.stubGlobal('MediaRecorder', undefined)
    expect(pickAudioMime()).toBeNull()
  })

  it('microfoonfouten in gewone taal', () => {
    expect(micError({ name: 'NotAllowedError' })).toMatch(/Safari > Microfoon/)
    expect(micError({ name: 'NotFoundError' })).toBe('Geen microfoon gevonden.')
    expect(micError(new Error('x'))).toMatch(/nog een keer/)
  })

  it('opnemen: stoppen geeft het geluid en de lengte, en zet de microfoon uit', async () => {
    const rec = await startRecording()
    clock += 12_500
    const out = await rec.stop()
    expect(out.mime).toBe('audio/mp4')
    expect(out.duration).toBe(12.5)
    expect(out.blob.size).toBeGreaterThan(0)
    expect(tracks[0].stop).toHaveBeenCalled()
    // nooit langer dan de max
    const long = await startRecording()
    clock += 90_000
    expect((await long.stop()).duration).toBe(MEMO_MAX_S)
  })

  it('weggooien zet de microfoon ook uit', async () => {
    const rec = await startRecording()
    rec.cancel()
    expect(tracks[0].stop).toHaveBeenCalled()
  })

  it('bewaren: als audio-media bij de dag, met lengte; per ongeluk getikt of leeg wordt niet bewaard', async () => {
    const blob = new Blob(['x'], { type: 'audio/mp4' })
    expect(await saveMemo({ blob, mime: 'audio/mp4', duration: 0.3 }, { sessionId: 's1' })).toBeNull()
    expect(await saveMemo({ blob: new Blob([]), mime: 'audio/mp4', duration: 5 }, { sessionId: 's1' })).toBeNull()
    const m = await saveMemo({ blob, mime: 'audio/mp4', duration: 4.26 }, { sessionId: 's1', crewId: 'c1' })
    expect(m).toMatchObject({ kind: 'media', type: 'audio', sessionId: 's1', crewId: 'c1', duration: 4.3, dirty: 1 })
    expect(await db.blobs.get(m!.id)).toBeTruthy()
  })

  it('losse memo van vandaag komt bij de dag als je die logt (alleen een nieuwe dag)', async () => {
    const blob = new Blob(['x'], { type: 'audio/mp4' })
    await saveMemo({ blob, mime: 'audio/mp4', duration: 3 }, {})
    expect(await looseMemos(todayISO())).toHaveLength(1)
    expect(await looseMemos('2001-01-01')).toHaveLength(0)
    await saveSession({ id: 'dag', draft: { ...EMPTY_DRAFT, date: todayISO(), crewId: 'crew' } })
    const [m] = await memos()
    expect(m).toMatchObject({ sessionId: 'dag', crewId: 'crew' })
    expect(await adoptMemos('ander', todayISO(), null)).toBe(0)
  })

  it('memo’s komen nooit tussen foto’s en video’s: toernooi, filters en de crew-feed', () => {
    const media = [
      { id: 'v', type: 'video' },
      { id: 'f', type: 'image' },
      { id: 'a', type: 'audio' },
    ] as MediaMeta[]
    expect(media.filter(isVisual).map((m) => m.id)).toEqual(['v', 'f'])
    expect(pickEntries(media, 'trip')).not.toContain('a')
    const items = [
      { id: 's', user_id: 'u', kind: 'session', data: { id: 's', date: '2027-01-02' } },
      { id: 'a', user_id: 'u', kind: 'media', data: { id: 'a', type: 'audio', sessionId: 's' } },
      { id: 'f', user_id: 'u', kind: 'media', data: { id: 'f', type: 'image', sessionId: 's' } },
    ] as unknown as FeedItem[]
    const [post] = toPosts(items)
    expect(post.media.map((m) => m.id)).toEqual(['f'])
    expect(post.memos?.map((m) => m.id)).toEqual(['a'])
  })
})

const dayPage = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/log/${id}`]}>
      <Routes>
        <Route path="/log/:id" element={<LogDetail />} />
      </Routes>
    </MemoryRouter>,
  )

describe('memo’s op je dag', () => {
  it('inspreken, terugluisteren en weggooien', async () => {
    const user = userEvent.setup()
    const s = await create('session', { ...EMPTY_DRAFT, date: '2027-01-10', resortName: 'Tignes' })
    dayPage(s.id)
    await user.click(await screen.findByRole('button', { name: 'Spreek een memo in' }))
    const rec = await screen.findByRole('group', { name: 'Opnemen' })
    clock += 8_000
    await waitFor(() => expect(within(rec).getByText('0:08')).toBeTruthy())
    await user.click(within(rec).getByRole('button', { name: /Klaar/ }))
    const play = await screen.findByRole('button', { name: 'Luister memo 1' })
    expect(screen.getByText('0:08')).toBeTruthy()
    expect(tracks[0].stop).toHaveBeenCalled()
    expect((await memos())[0]).toMatchObject({ sessionId: s.id, duration: 8 })

    await user.click(play)
    expect(await screen.findByRole('button', { name: 'Pauzeer memo 1' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Gooi memo 1 weg' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /memo 1/ })).toBeNull())
    expect(await memos()).toHaveLength(0) // zacht verwijderd
    expect(((await db.records.where('kind').equals('media').toArray()) as MediaMeta[])[0].deleted).toBe(true)
  })

  it('stopt vanzelf na een minuut', async () => {
    const user = userEvent.setup()
    const s = await create('session', { ...EMPTY_DRAFT, date: '2027-01-10' })
    dayPage(s.id)
    await user.click(await screen.findByRole('button', { name: 'Spreek een memo in' }))
    await screen.findByRole('group', { name: 'Opnemen' })
    clock += 61_000
    expect(await screen.findByRole('button', { name: 'Luister memo 1' })).toBeTruthy()
    expect(screen.getByText('1:00')).toBeTruthy()
  })

  it('weg: niks bewaard; te kort: melding; geen microfoon: uitleg', async () => {
    const user = userEvent.setup()
    const s = await create('session', { ...EMPTY_DRAFT, date: '2027-01-10' })
    dayPage(s.id)
    await user.click(await screen.findByRole('button', { name: 'Spreek een memo in' }))
    await user.click(within(await screen.findByRole('group', { name: 'Opnemen' })).getByRole('button', { name: 'Weg' }))
    expect(tracks[0].stop).toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: 'Spreek een memo in' }))
    await user.click(within(await screen.findByRole('group', { name: 'Opnemen' })).getByRole('button', { name: /Klaar/ }))
    await waitFor(() => expect(toastStore.get().some((t) => t.title === 'Te kort')).toBe(true))

    mic = () => Promise.reject(Object.assign(new Error('nee'), { name: 'NotAllowedError' }))
    await user.click(await screen.findByRole('button', { name: 'Spreek een memo in' }))
    await waitFor(() => expect(toastStore.get().some((t) => /Microfoon/.test(t.body ?? '') || /microfoon/.test(t.body ?? ''))).toBe(true))
    expect(await memos()).toHaveLength(0)
  })

  it('zonder MediaRecorder geen opnameknop (wel je memo’s)', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    const s = await create('session', { ...EMPTY_DRAFT, date: '2027-01-10' })
    await create('media', { type: 'audio', mime: 'audio/mp4', duration: 3, sessionId: s.id, crewId: null })
    dayPage(s.id)
    expect(await screen.findByRole('button', { name: 'Luister memo 1' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Spreek een memo in' })).toBeNull()
  })
})

describe('memo vanaf home', () => {
  it('nog geen dag gelogd: de memo wacht op je dag', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Spraakmemo' }))
    clock += 5_000
    await user.click(within(await screen.findByRole('group', { name: 'Opnemen' })).getByRole('button', { name: /Klaar/ }))
    expect(await screen.findByText('1 memo wacht op je dag')).toBeTruthy()
    expect(toastStore.get().at(-1)?.body).toBe('Komt bij je dag zodra je die logt.')
    expect((await memos())[0].sessionId).toBeUndefined()
  })

  it('dag al gelogd: de memo komt er meteen bij', async () => {
    const user = userEvent.setup()
    const s = await create('session', { ...EMPTY_DRAFT, date: todayISO(), crewId: 'crew' })
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Spraakmemo' }))
    clock += 5_000
    await user.click(within(await screen.findByRole('group', { name: 'Opnemen' })).getByRole('button', { name: /Klaar/ }))
    await waitFor(async () => expect((await memos())[0]).toMatchObject({ sessionId: s.id, crewId: 'crew' }))
    expect(screen.queryByText(/wacht op je dag/)).toBeNull()
  })
})

describe('memo in de editor', () => {
  it('een nieuwe dag toont de memo’s die je vandaag al insprak; een bestaande dag niet', async () => {
    await saveMemo({ blob: new Blob(['x'], { type: 'audio/mp4' }), mime: 'audio/mp4', duration: 3 }, {})
    render(
      <MemoryRouter initialEntries={['/log/nieuw']}>
        <Routes>
          <Route path="/log/nieuw" element={<LogEditor />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: 'Luister memo 1' })).toBeTruthy()
    cleanup()
    const s = await create('session', { ...EMPTY_DRAFT, date: todayISO() })
    render(
      <MemoryRouter initialEntries={[`/log/${s.id}/bewerk`]}>
        <Routes>
          <Route path="/log/:id/bewerk" element={<LogEditor />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: 'Spreek een memo in' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Luister memo 1' })).toBeNull()
  })
})
