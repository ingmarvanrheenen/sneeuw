// Seizoensboek: hoofdstukken, stickers, beste clips en dagen per maand, uit je eigen data; en de pagina met
// "Bewaar als PDF" (het printscherm).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import SeasonBook from '../pages/SeasonBook'
import { bestClips, seasonBook } from '../lib/seasonBook'
import { create } from '../lib/repo'
import { db } from '../lib/db'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { ProgressInput } from '../lib/progress'
import type { MediaMeta, Session } from '../lib/types'

const day = (date: string, over: Partial<Session> = {}) =>
  ({ ...EMPTY_DRAFT, id: date, kind: 'session', date, hours: 5, createdAt: 0, updatedAt: 0, ...over }) as Session
const media = (id: string, over: Partial<MediaMeta> = {}) =>
  ({
    id,
    kind: 'media',
    type: 'image',
    mime: 'image/jpeg',
    createdAt: new Date('2026-12-20T12:00:00').getTime(),
    updatedAt: 0,
    ...over,
  }) as MediaMeta
const input = (over: Partial<ProgressInput>): ProgressInput => ({
  sessions: [],
  tricks: [],
  goals: [],
  media: [],
  gear: [],
  trips: [],
  quizBest: 0,
  quizCorrect: 0,
  inCrew: false,
  ...over,
})

describe('seizoensboek: inhoud', () => {
  const sessions = [
    day('2026-12-20', { resortName: 'Tignes', landed: ['ollie'] }),
    day('2026-12-21', { resortName: 'Tignes' }),
    day('2027-01-10', { resortName: 'Ischgl', falls: 3 }),
    day('2025-12-01', { resortName: 'Vorig jaar' }),
  ]

  it('dagen per maand in volgorde, alleen dit seizoen; hoofdstukken zonder de intro', () => {
    const b = seasonBook(input({ sessions }), '26/27')
    expect(b.days).toBe(3)
    expect(b.months.map((m) => [m.label, m.days.length])).toEqual([
      ['december 2026', 2],
      ['januari 2027', 1],
    ])
    expect(b.chapters.length).toBeGreaterThan(2)
    expect(b.chapters.some((c) => c.id === 'intro')).toBe(false)
    expect(b.chapters.find((c) => c.id === 'tricks')?.big).toBe('1')
  })

  it('beste clips: van dit seizoen, die bij een trick eerst, geen memo of trip-film, max 9', () => {
    const list = [
      media('oud', { createdAt: new Date('2025-12-01T12:00:00').getTime() }),
      media('dag', { sessionId: '2026-12-20', createdAt: 1 }),
      media('trick', { trickId: 'ollie' }),
      media('memo', { type: 'audio' }),
      media('film', { type: 'video', tripFilm: { tripId: 't1' } as never }),
      media('weg', { deleted: true }),
      ...Array.from({ length: 12 }, (_, i) => media(`m${i}`, { createdAt: new Date('2026-12-22T12:00:00').getTime() + i })),
    ]
    const clips = bestClips(list, sessions.slice(0, 3), '26/27')
    expect(clips).toHaveLength(9)
    expect(clips[0].id).toBe('trick')
    expect(clips.map((c) => c.id)).not.toEqual(expect.arrayContaining(['oud', 'memo', 'film', 'weg']))
  })

  it('leeg seizoen: niks', () => {
    expect(seasonBook(input({ sessions }), '20/21')).toMatchObject({ days: 0, months: [], chapters: [] })
  })
})

describe('seizoensboek-pagina', () => {
  beforeEach(async () => {
    await db.records.clear()
    await db.kv.clear()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/seizoensboek" element={<SeasonBook />} />
          <Route path="/log/:id" element={<div>dag</div>} />
        </Routes>
      </MemoryRouter>,
    )

  it('cover, hoofdstukken, dagen per maand, en bewaren als PDF via het printscherm', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await create('session', { ...EMPTY_DRAFT, date: '2026-12-20', hours: 6, resortName: 'Tignes', highlight: 'Eerste carve' })
    await create('session', { ...EMPTY_DRAFT, date: '2027-01-10', hours: 4, resortName: 'Ischgl', falls: 2 })
    await create('trick', { trickId: 'ollie', status: 'geland', firstLandedAt: '2026-12-20', mediaIds: [] })
    at('/seizoensboek?seizoen=26%2F27')
    const cover = await screen.findByRole('group', { name: 'Seizoensboek 26/27' })
    expect(within(cover).getByText(/2 dagen · 10 uur/)).toBeTruthy()
    expect(screen.getByText('december 2026')).toBeTruthy()
    expect(screen.getByText('januari 2027')).toBeTruthy()
    expect(screen.getAllByText(/"Eerste carve"/).length).toBe(2) // bij je beste dag en bij de dag zelf
    expect(screen.getByText('uur op de plank')).toBeTruthy()
    expect(screen.getByText('Stickers')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Bewaar als PDF' }))
    expect(print).toHaveBeenCalled()
    // knoppen en keuzes niet in de PDF
    expect(screen.getByRole('button', { name: 'Bewaar als PDF' }).className).toContain('no-print')
  })

  it('nog niks gelogd: uitleg', async () => {
    at('/seizoensboek')
    expect(await screen.findByText('Nog geen seizoen om te bewaren')).toBeTruthy()
  })
})
