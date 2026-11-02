// Trip-film (proef): welke clips erin komen en hoe lang, en het scherm om hem te maken en te delen.
// Het tekenen en opnemen zelf (canvas + MediaRecorder) checken we in een echte browser met testclips.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({
  crewMembers: vi.fn(),
  tripDays: vi.fn(),
  tripMedia: vi.fn(),
  renderFilm: vi.fn(),
  canMakeFilm: vi.fn(() => true),
  shareFile: vi.fn(),
}))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), crewMembers: api.crewMembers }))
vi.mock('../lib/crewTrips', async (orig) => ({
  ...(await orig<typeof import('../lib/crewTrips')>()),
  tripDays: api.tripDays,
  tripMedia: api.tripMedia,
}))
vi.mock('../lib/shareCard', async (orig) => ({ ...(await orig<typeof import('../lib/shareCard')>()), shareFile: api.shareFile }))
vi.mock('../lib/tripFilm', async (orig) => ({
  ...(await orig<typeof import('../lib/tripFilm')>()),
  renderFilm: api.renderFilm,
  canMakeFilm: api.canMakeFilm,
}))

import { TripFilm } from '../components/TripFilm'
import { CLIP_S, filmName, INTRO_S, MAX_CLIPS, OUTRO_S, PHOTO_S, pickVideoMime, planFilm, type Segment } from '../lib/tripFilm'
import type { MediaMeta } from '../lib/types'

const m = (id: string, type: MediaMeta['type'], userId: string, createdAt: number, over: Partial<MediaMeta> = {}) =>
  ({ id, kind: 'media', type, mime: 'x', userId, createdAt, updatedAt: 0, ...over }) as MediaMeta
const trip = { name: 'Tignes 2027', resortName: 'Tignes', startDate: '2027-01-16', endDate: '2027-01-23' }
const names = { u1: 'Sam', u2: 'Noor' }
const clipsOf = (segs: Segment[]) => segs.filter((s): s is Extract<Segment, { kind: 'clip' }> => s.kind === 'clip')

describe('film plannen', () => {
  it('intro, de clips op tijd, outro met wie er in zit; echte namen; lengte klopt', () => {
    const plan = planFilm([m('b', 'image', 'u2', 2), m('a', 'video', 'u1', 1), m('c', 'video', 'u9', 3)], names, trip, 't')
    expect(plan.segments[0]).toEqual({ kind: 'intro', dur: INTRO_S, title: 'Tignes 2027', sub: 'Tignes · 16 jan – 23 jan' })
    const clips = clipsOf(plan.segments)
    expect(clips.map((c) => [c.media.id, c.rider, c.index, c.total, c.dur])).toEqual([
      ['a', 'Sam', 1, 3, CLIP_S],
      ['b', 'Noor', 2, 3, PHOTO_S],
      ['c', 'Iemand', 3, 3, CLIP_S],
    ])
    expect(plan.segments.at(-1)).toEqual({ kind: 'outro', dur: OUTRO_S, riders: ['Sam', 'Noor', 'Iemand'] })
    expect(plan.total).toBeCloseTo(INTRO_S + 2 * CLIP_S + PHOTO_S + OUTRO_S)
  })

  it('max 8: video’s gaan voor, vaste keuze per trip, en dan weer op tijd', () => {
    const media = [
      ...Array.from({ length: 6 }, (_, i) => m(`v${i}`, 'video', 'u1', 100 + i)),
      ...Array.from({ length: 6 }, (_, i) => m(`f${i}`, 'image', 'u2', i)),
    ]
    const a = clipsOf(planFilm(media, names, trip, 'trip-1').segments)
    expect(a).toHaveLength(MAX_CLIPS)
    expect(a.filter((c) => c.media.type === 'video')).toHaveLength(6)
    expect(a.map((c) => c.media.createdAt)).toEqual([...a.map((c) => c.media.createdAt)].sort((x, y) => x - y))
    expect(clipsOf(planFilm(media, names, trip, 'trip-1').segments).map((c) => c.media.id)).toEqual(a.map((c) => c.media.id))
  })

  it('geen spraakmemo’s of weggegooide clips; zonder einddatum alleen de begindatum', () => {
    const plan = planFilm(
      [m('a', 'audio', 'u1', 1), m('b', 'video', 'u1', 2, { deleted: true }), m('c', 'image', 'u1', 3)],
      names,
      { ...trip, endDate: undefined },
      't',
    )
    expect(clipsOf(plan.segments).map((c) => c.media.id)).toEqual(['c'])
    expect(plan.segments[0]).toMatchObject({ sub: 'Tignes · 16 jan' })
  })

  it('formaat: mp4 als het kan (iPhone), anders webm; bestandsnaam zonder rare tekens', () => {
    vi.stubGlobal('MediaRecorder', class {})
    expect(pickVideoMime((t) => t.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1')
    expect(pickVideoMime((t) => t === 'video/webm')).toBe('video/webm')
    vi.unstubAllGlobals()
    expect(filmName({ ...trip, name: 'Val d’Isère 2027!' }, 'video/mp4')).toBe('trip-film-val-d-isere-2027.mp4')
    expect(filmName({ ...trip, name: '' }, 'video/webm')).toBe('trip-film-tignes.webm')
  })

  it('zonder MediaRecorder of canvas-opname: geen film', async () => {
    const real = await vi.importActual<typeof import('../lib/tripFilm')>('../lib/tripFilm')
    expect(real.canMakeFilm()).toBe(false) // jsdom heeft geen MediaRecorder
    vi.stubGlobal('MediaRecorder', class {})
    expect(real.canMakeFilm()).toBe(false) // en geen captureStream op canvas
    vi.unstubAllGlobals()
  })
})

describe('trip-film op de trippagina', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    api.crewMembers.mockResolvedValue([
      { user_id: 'u1', display_name: 'Sam', role: 'owner', stats: {} },
      { user_id: 'u2', display_name: 'Noor', role: 'member', stats: {} },
    ])
    api.tripDays.mockResolvedValue([])
    api.tripMedia.mockResolvedValue([m('a', 'video', 'u1', 1), m('b', 'image', 'u2', 2)])
    api.canMakeFilm.mockReturnValue(true)
    api.renderFilm.mockReset()
    api.shareFile.mockReset()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:film', revokeObjectURL: () => {} }))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('maken, bekijken en delen', async () => {
    const user = userEvent.setup()
    api.renderFilm.mockImplementation(async (_plan, opts) => {
      opts.onProgress({ phase: 'opnemen', done: 0.5 })
      return new Blob([new Uint8Array(20_000)], { type: 'video/mp4' })
    })
    render(<TripFilm tripId="t1" crewId="c1" trip={trip} />)
    expect(await screen.findByText(/2 gedeelde clips en foto's van de crew als film van \d+ seconden/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Maak de film' }))
    const sheet = screen.getByRole('dialog', { name: 'Trip-film' })
    const film = await within(sheet).findByLabelText('Je trip-film')
    expect(film.getAttribute('src')).toBe('blob:film')
    const plan = api.renderFilm.mock.calls[0][0]
    expect(plan.segments.map((s: Segment) => s.kind)).toEqual(['intro', 'clip', 'clip', 'outro'])
    await user.click(within(sheet).getByRole('button', { name: 'Deel' }))
    expect(api.shareFile).toHaveBeenCalledWith(expect.any(Blob), 'trip-film-tignes-2027.mp4', 'Tignes 2027')
  })

  it('lege film of fout: uitleg en opnieuw proberen', async () => {
    const user = userEvent.setup()
    api.renderFilm.mockResolvedValueOnce(new Blob(['x'], { type: 'video/mp4' })).mockRejectedValueOnce(new Error('kapot'))
    render(<TripFilm tripId="t1" crewId="c1" trip={trip} />)
    await user.click(await screen.findByRole('button', { name: 'Maak de film' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Hou het scherm aan/)
    await user.click(screen.getByRole('button', { name: 'Opnieuw' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('kapot'))
  })

  it('niks gedeeld, of een browser die het niet kan: geen film-blok', async () => {
    api.tripMedia.mockResolvedValue([])
    const { container } = render(<TripFilm tripId="t1" crewId="c1" trip={trip} />)
    await waitFor(() => expect(api.tripMedia).toHaveBeenCalled())
    expect(container.textContent).toBe('')
    cleanup()
    api.tripMedia.mockResolvedValue([m('a', 'video', 'u1', 1)])
    api.canMakeFilm.mockReturnValue(false)
    const r = render(<TripFilm tripId="t1" crewId="c1" trip={trip} />)
    await waitFor(() => expect(api.tripMedia).toHaveBeenCalledTimes(2))
    expect(r.container.textContent).toBe('')
  })
})
