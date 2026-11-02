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
  previewMusic: vi.fn(),
  shareFile: vi.fn(),
}))
vi.mock('../lib/crew', async (orig) => ({ ...(await orig<typeof import('../lib/crew')>()), crewMembers: api.crewMembers }))
vi.mock('../lib/crewTrips', async (orig) => ({
  ...(await orig<typeof import('../lib/crewTrips')>()),
  tripDays: api.tripDays,
  tripMedia: api.tripMedia,
}))
vi.mock('../lib/sounds', () => ({ sfx: new Proxy({}, { get: () => () => {} }) }))
vi.mock('../lib/shareCard', async (orig) => ({ ...(await orig<typeof import('../lib/shareCard')>()), shareFile: api.shareFile }))
vi.mock('../lib/tripFilm', async (orig) => ({
  ...(await orig<typeof import('../lib/tripFilm')>()),
  renderFilm: api.renderFilm,
  canMakeFilm: api.canMakeFilm,
  previewMusic: api.previewMusic,
}))

import { TripFilm } from '../components/TripFilm'
import {
  clipStart,
  pickClips,
  timeline,
  CLIP_S,
  filmName,
  INTRO_S,
  MAX_CLIPS,
  OUTRO_S,
  PHOTO_S,
  pickVideoMime,
  planFilm,
  type Segment,
} from '../lib/tripFilm'
import type { MediaMeta } from '../lib/types'
import { db } from '../lib/db'

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

  it('met muziek vallen de cuts op de beat (intro en clips 4 tellen, foto 3, outro 6)', () => {
    const beat = 60 / 120
    const plan = planFilm([m('a', 'video', 'u1', 1), m('b', 'image', 'u2', 2)], names, trip, 't', { bpm: 120 })
    expect(plan.segments.map((s) => s.dur)).toEqual([4 * beat, 4 * beat, 3 * beat, 6 * beat])
    expect(plan.total).toBe(17 * beat)
    expect(timeline(plan)).toEqual([0, 2, 4, 5.5])
  })

  it('clip start iets na het begin, maar nooit voorbij het eind', () => {
    expect(clipStart(10, 2)).toBe(0.4)
    expect(clipStart(2.2, 2)).toBeCloseTo(0.2)
    expect(clipStart(1, 2)).toBe(0)
    expect(clipStart(NaN, 2)).toBe(0)
  })

  it('met geluid een formaat met audio-codec', () => {
    vi.stubGlobal('MediaRecorder', class {})
    expect(pickVideoMime((t) => t.includes('mp4a'), true)).toBe('video/mp4;codecs=avc1,mp4a.40.2')
    expect(pickVideoMime((t) => t.includes('opus'), true)).toBe('video/webm;codecs=vp9,opus')
    vi.unstubAllGlobals()
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
    api.previewMusic.mockReset().mockReturnValue(() => {})
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        resume = async () => {}
        close = async () => {}
      },
    )
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
    const [plan, opts] = api.renderFilm.mock.calls[0]
    expect(plan.segments.map((s: Segment) => s.kind)).toEqual(['intro', 'clip', 'clip', 'outro'])
    // standaard: Park en het geluid van de clips, met een AudioContext uit de tik
    expect(opts).toMatchObject({ music: 'park', clipAudio: true })
    expect(opts.audio).toBeTruthy()
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

describe('muziek kiezen', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    api.crewMembers.mockResolvedValue([])
    api.tripDays.mockResolvedValue([])
    api.tripMedia.mockResolvedValue([m('a', 'video', 'u1', 1)])
    api.canMakeFilm.mockReturnValue(true)
    api.renderFilm.mockReset().mockResolvedValue(new Blob([new Uint8Array(20_000)], { type: 'video/mp4' }))
    api.previewMusic.mockReset()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:film', revokeObjectURL: () => {} }))
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        resume = async () => {}
        close = async () => {}
      },
    )
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('tik een stijl: je hoort hem even, de vorige stopt; de lengte past zich aan de beat aan', async () => {
    const user = userEvent.setup()
    const stops = [vi.fn(), vi.fn()]
    api.previewMusic.mockReturnValueOnce(stops[0]).mockReturnValueOnce(stops[1])
    render(<TripFilm tripId="t1" crewId="c1" trip={trip} />)
    const group = await screen.findByRole('group', { name: 'Muziek' })
    const seconds = () => screen.getByText(/seconden/).textContent
    const before = seconds()
    await user.click(within(group).getByRole('button', { name: 'Boom bap' }))
    expect(api.previewMusic).toHaveBeenLastCalledWith(expect.anything(), 'boombap')
    expect(within(group).getByRole('button', { name: 'Boom bap' }).getAttribute('aria-pressed')).toBe('true')
    expect(seconds()).not.toBe(before) // 92 bpm: langere cuts dan Park
    await user.click(within(group).getByRole('button', { name: 'Pow day' }))
    expect(stops[0]).toHaveBeenCalled()
    await user.click(within(group).getByRole('button', { name: 'Geen' }))
    expect(stops[1]).toHaveBeenCalled()
    expect(api.previewMusic).toHaveBeenCalledTimes(2)
  })

  it('zonder muziek en zonder clipgeluid: een stille film, geen AudioContext nodig', async () => {
    const user = userEvent.setup()
    render(<TripFilm tripId="t1" crewId="c1" trip={trip} />)
    await user.click(within(await screen.findByRole('group', { name: 'Muziek' })).getByRole('button', { name: 'Geen' }))
    await user.click(screen.getByRole('switch', { name: /Geluid van de clips/ }))
    await user.click(screen.getByRole('button', { name: 'Maak de film' }))
    await waitFor(() => expect(api.renderFilm).toHaveBeenCalled())
    expect(api.renderFilm.mock.calls[0][1]).toMatchObject({ music: 'geen', clipAudio: false, audio: null })
  })
})

describe('zelf clips kiezen', () => {
  const many = Array.from({ length: 10 }, (_, i) => m(`c${i}`, i % 3 ? 'video' : 'image', i % 2 ? 'u1' : 'u2', i))

  it('eigen keuze gaat voor, op tijd en max 8; verdwenen clips tellen niet; niks of alles weg = automatisch', () => {
    expect(pickClips(many, 't', ['c5', 'c1', 'c3']).map((x) => x.id)).toEqual(['c1', 'c3', 'c5'])
    expect(
      pickClips(
        many,
        't',
        many.map((x) => x.id),
      ),
    ).toHaveLength(8)
    expect(pickClips(many, 't', ['weg', 'c2']).map((x) => x.id)).toEqual(['c2'])
    const auto = pickClips(many, 't').map((x) => x.id)
    expect(pickClips(many, 't', []).map((x) => x.id)).toEqual(auto)
    expect(pickClips(many, 't', ['weg']).map((x) => x.id)).toEqual(auto)
    expect(pickClips([...many, m('memo', 'audio', 'u1', 99)], 't', ['memo', 'c0']).map((x) => x.id)).toEqual(['c0'])
  })

  beforeEach(async () => {
    await db.kv.clear()
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    api.crewMembers.mockResolvedValue([
      { user_id: 'u1', display_name: 'Sam', role: 'owner', stats: {} },
      { user_id: 'u2', display_name: 'Noor', role: 'member', stats: {} },
    ])
    api.tripDays.mockResolvedValue([])
    api.tripMedia.mockResolvedValue(many)
    api.canMakeFilm.mockReturnValue(true)
    api.renderFilm.mockReset().mockResolvedValue(new Blob([new Uint8Array(20_000)], { type: 'video/mp4' }))
    api.previewMusic.mockReset().mockReturnValue(() => {})
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:film', revokeObjectURL: () => {} }))
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        resume = async () => {}
        close = async () => {}
      },
    )
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const clipsSheet = () => screen.getByRole('dialog', { name: 'Clips voor de film' })
  const tiles = () => within(within(clipsSheet()).getByRole('group', { name: 'Clips' })).getAllByRole('button')

  it('kiezen, nummers op volgorde, onthouden per trip, en de film gebruikt jouw keuze', async () => {
    const user = userEvent.setup()
    const r = render(<TripFilm tripId="t1" crewId="c1" trip={trip} />)
    await user.click(await screen.findByRole('button', { name: /Clips.*Automatisch: 8 van 10/ }))
    expect(tiles().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(8)
    // alles uit, dan drie kiezen in een andere volgorde dan de trip
    await user.click(within(clipsSheet()).getByRole('button', { name: 'Niks' }))
    expect(within(clipsSheet()).getByText(/Niks gekozen: dan kiest de app weer/)).toBeTruthy()
    for (const i of [5, 1, 3]) await user.click(tiles()[i])
    expect(tiles()[1].getAttribute('aria-label')).toBe('Clip van Sam')
    expect(tiles()[1].parentElement?.textContent).toContain('1')
    expect(tiles()[5].parentElement?.textContent).toContain('3')
    await user.click(within(clipsSheet()).getByRole('button', { name: 'Klaar' }))
    expect(screen.getByRole('button', { name: /Jouw keuze: 3/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Maak de film' }))
    await waitFor(() => expect(api.renderFilm).toHaveBeenCalled())
    const ids = api.renderFilm.mock.calls[0][0].segments
      .filter((x: Segment) => x.kind === 'clip')
      .map((x: Extract<Segment, { kind: 'clip' }>) => x.media.id)
    expect(ids).toEqual(['c1', 'c3', 'c5'])

    // onthouden: opnieuw openen geeft dezelfde keuze
    r.unmount()
    render(<TripFilm tripId="t1" crewId="c1" trip={trip} />)
    expect(await screen.findByRole('button', { name: /Jouw keuze: 3/ })).toBeTruthy()
  })

  it('max 8: de rest kan niet meer; automatisch zet het terug', async () => {
    const user = userEvent.setup()
    render(<TripFilm tripId="t1" crewId="c1" trip={trip} />)
    await user.click(await screen.findByRole('button', { name: /Clips/ }))
    // de app koos 8: de andere twee zijn vol
    const off = tiles().filter((b) => b.getAttribute('aria-pressed') === 'false')
    expect(off).toHaveLength(2)
    expect(off.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect((within(clipsSheet()).getByRole('button', { name: 'Automatisch' }) as HTMLButtonElement).disabled).toBe(true)
    // één eruit, dan kan er een andere in
    await user.click(tiles().find((b) => b.getAttribute('aria-pressed') === 'true')!)
    await user.click(off[0])
    expect(off[0].getAttribute('aria-pressed')).toBe('true')
    await user.click(within(clipsSheet()).getByRole('button', { name: 'Automatisch' }))
    await user.click(within(clipsSheet()).getByRole('button', { name: 'Klaar' }))
    expect(screen.getByRole('button', { name: /Automatisch: 8 van 10/ })).toBeTruthy()
  })
})
