// Tekenen op je clip: hoeken rekenen, schermpunten naar beeldpixels, de tekening zelf, het tekenscherm, en
// vergelijken (twee beelden onder elkaar), slow-motion en de coach vanuit de tekening.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const io = vi.hoisted(() => ({ addMediaFiles: vi.fn(), exportSketch: vi.fn(), exportCompare: vi.fn(), shareFile: vi.fn() }))
vi.mock('../lib/media', async (orig) => ({ ...(await orig<typeof import('../lib/media')>()), addMediaFiles: io.addMediaFiles }))
vi.mock('../lib/shareCard', async (orig) => ({ ...(await orig<typeof import('../lib/shareCard')>()), shareFile: io.shareFile }))
vi.mock('../lib/sketch', async (orig) => ({
  ...(await orig<typeof import('../lib/sketch')>()),
  exportSketch: io.exportSketch,
  exportCompare: io.exportCompare,
}))

import { angleAt, compareLayout, drawCompare, drawShapes, nextRate, rateLabel, thin, toBase, toImage, tooShort, TOOLS } from '../lib/sketch'
import { ClipDraw } from '../components/ClipDraw'
import { MediaViewer } from '../components/Media'
import { TechniqueSheet } from '../components/CoachParts'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { toastStore } from '../lib/toast'
import type { MediaMeta } from '../lib/types'

describe('teken-logica', () => {
  it('hoek bij het middelste punt, in hele graden', () => {
    expect(angleAt({ x: 0, y: -10 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(90)
    expect(angleAt({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(180)
    expect(angleAt({ x: 10, y: 1 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(6)
    expect(angleAt({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0)
  })

  it('schermpunt naar beeldpixels, ook met zwarte randen; buiten het beeld wordt de rand', () => {
    const box = { width: 400, height: 400 }
    const img = { width: 720, height: 1280 } // staand: zwarte randen links en rechts
    expect(toImage({ x: 200, y: 200 }, box, img)).toEqual({ x: 360, y: 640 })
    expect(toImage({ x: 0, y: 0 }, box, img)).toEqual({ x: 0, y: 0 })
    expect(toImage({ x: 400, y: 400 }, box, img)).toEqual({ x: 720, y: 1280 })
  })

  it('per ongeluk getikt is geen lijn; vrije lijn wordt uitgedund', () => {
    expect(tooShort({ x: 0, y: 0 }, { x: 5, y: 0 }, 720)).toBe(true)
    expect(tooShort({ x: 0, y: 0 }, { x: 50, y: 0 }, 720)).toBe(false)
    expect(
      thin(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 5, y: 0 },
          { x: 5.5, y: 0 },
        ],
        3,
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ])
  })

  it('de hoek krijgt zijn graden in beeld', () => {
    const texts: string[] = []
    const ctx = new Proxy({ measureText: () => ({ width: 40 }), fillText: (t: string) => texts.push(t) } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => {}),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    drawShapes(ctx, [{ kind: 'hoek', a: { x: 0, y: -10 }, b: { x: 0, y: 0 }, c: { x: 10, y: 0 }, color: '#fff' }], {
      width: 720,
      height: 1280,
    })
    expect(texts).toEqual(['90°'])
  })

  it('elk gereedschap heeft uitleg', () => {
    for (const t of TOOLS) expect(t.hint.length).toBeGreaterThan(10)
  })
})

const photo = (over: Partial<MediaMeta> = {}) =>
  ({
    id: 'foto1',
    kind: 'media',
    type: 'image',
    mime: 'image/jpeg',
    userId: 'me',
    trickId: 'ollie',
    crewId: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as MediaMeta

describe('tekenscherm', () => {
  beforeEach(async () => {
    await db.blobs.clear()
    await db.blobs.put({ id: 'foto1', blob: new Blob(['x'], { type: 'image/jpeg' }) })
    setCurrentUserId('me')
    toastStore.set([])
    io.addMediaFiles.mockReset().mockResolvedValue({ added: [photo({ id: 'nieuw' })], skipped: [] })
    io.exportSketch.mockReset().mockResolvedValue(new Blob(['jpg'], { type: 'image/jpeg' }))
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob(['x']) })),
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  /** jsdom laadt geen plaatjes: het beeld en het tekenvlak zelf neerzetten. */
  async function ready() {
    const dialog = await screen.findByRole('dialog', { name: 'Tekenen op je clip' })
    await waitFor(() => expect(dialog.querySelector('img')?.getAttribute('src')).toBe('blob:x'))
    const img = dialog.querySelector('img')!
    Object.defineProperties(img, { naturalWidth: { value: 720 }, naturalHeight: { value: 1280 } })
    fireEvent.load(img)
    const cv = screen.getByLabelText('Tekenvlak')
    cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 640, right: 360, bottom: 640, x: 0, y: 0, toJSON: () => {} })
    return cv
  }

  it('hoek in drie tikken, ongedaan maken, en bewaren als foto bij dezelfde trick', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ClipDraw m={photo()} onClose={onClose} />)
    const cv = await ready()
    expect(screen.getByRole('button', { name: 'Hoek' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('button', { name: 'Bewaar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.pointerDown(cv, { clientX: 100, clientY: 100, pointerId: 1 })
    expect(screen.getByText(/\(1 van 3\)/)).toBeTruthy()
    fireEvent.pointerDown(cv, { clientX: 120, clientY: 300, pointerId: 1 })
    fireEvent.pointerDown(cv, { clientX: 100, clientY: 500, pointerId: 1 })
    expect(screen.queryByText(/van 3\)/)).toBeNull()
    const save = screen.getByRole('button', { name: 'Bewaar' }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Ongedaan maken' }))
    expect(save.disabled).toBe(true)

    // lijn slepen, dan bewaren
    await user.click(screen.getByRole('button', { name: 'Lijn' }))
    fireEvent.pointerDown(cv, { clientX: 20, clientY: 600, pointerId: 1 })
    fireEvent.pointerMove(cv, { clientX: 340, clientY: 590, pointerId: 1 })
    fireEvent.pointerUp(cv, { pointerId: 1 })
    await user.click(screen.getByRole('button', { name: 'Bewaar' }))
    await waitFor(() => expect(io.addMediaFiles).toHaveBeenCalled())
    const [files, link] = io.addMediaFiles.mock.calls[0]
    expect(files[0].type).toBe('image/jpeg')
    expect(link).toEqual({ sessionId: undefined, trickId: 'ollie', crewId: null })
    const shapes = io.exportSketch.mock.calls[0][2]
    expect(shapes).toHaveLength(1)
    expect(shapes[0]).toMatchObject({ kind: 'lijn', a: { x: 40, y: 1200 }, b: { x: 680, y: 1180 } })
    expect(onClose).toHaveBeenCalled()
    expect(toastStore.get().at(-1)?.title).toBe('Bewaard')
  })

  it('te korte sleep is geen lijn; delen kan altijd', async () => {
    const user = userEvent.setup()
    render(<ClipDraw m={photo()} onClose={() => {}} />)
    const cv = await ready()
    await user.click(screen.getByRole('button', { name: 'Pijl' }))
    fireEvent.pointerDown(cv, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(cv, { pointerId: 1 })
    expect((screen.getByRole('button', { name: 'Bewaar' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Deel' }))
    await waitFor(() => expect(io.shareFile).toHaveBeenCalledWith(expect.any(Blob), 'tekening.jpg'))
  })

  it('in de viewer: Teken alleen bij je eigen media', async () => {
    const r = render(
      <MemoryRouter>
        <MediaViewer m={photo()} onClose={() => {}} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Teken' })).toBeTruthy()
    r.unmount()
    render(
      <MemoryRouter>
        <MediaViewer m={photo({ userId: 'daan' })} onClose={() => {}} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Teken' })).toBeNull()
  })
})

describe('vergelijken en afspelen: logica', () => {
  it('punt van het tweede beeld naar de maten van het eerste', () => {
    expect(toBase({ x: 180, y: 320 }, { width: 360, height: 640 }, { width: 720, height: 1280 })).toEqual({ x: 360, y: 640 })
  })

  it('onder elkaar: even breed als het bovenste, het onderste geschaald', () => {
    expect(compareLayout({ width: 720, height: 1280 }, { width: 1080, height: 1920 })).toEqual({
      width: 720,
      height: 2560,
      bottomHeight: 1280,
    })
  })

  it('twee beelden, twee labels, en dezelfde lijn op allebei', () => {
    const calls: string[] = []
    const ctx = new Proxy(
      {
        measureText: () => ({ width: 40 }),
        fillText: (t: string) => calls.push(`text:${t}`),
        drawImage: () => calls.push('image'),
        moveTo: (x: number, y: number) => calls.push(`move:${x},${y}`),
      } as Record<string, unknown>,
      { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true },
    ) as unknown as CanvasRenderingContext2D
    const src = {} as CanvasImageSource
    drawCompare(
      ctx,
      { src, size: { width: 720, height: 1280 }, label: 'Toen · 3 jan' },
      { src, size: { width: 720, height: 1280 }, label: 'Nu · 20 jan' },
      [{ kind: 'lijn', a: { x: 10, y: 20 }, b: { x: 300, y: 400 }, color: '#fff' }],
    )
    expect(calls.filter((c) => c === 'image')).toHaveLength(2)
    expect(calls.filter((c) => c.startsWith('text:'))).toEqual(['text:Toen · 3 jan', 'text:Nu · 20 jan'])
    expect(calls.filter((c) => c === 'move:10,20').length).toBe(2) // bovenste en onderste beeld
  })

  it('snelheden: ½x, ¼x, 1x en weer rond', () => {
    expect(nextRate(0.5)).toBe(0.25)
    expect(nextRate(0.25)).toBe(1)
    expect(nextRate(1)).toBe(0.5)
    expect([0.5, 0.25, 1].map(rateLabel)).toEqual(['½x', '¼x', '1x'])
  })
})

describe('tekenscherm: vergelijken, slow-motion en de coach', () => {
  const day = (d: string) => new Date(`${d}T12:00:00`).getTime()
  const foto2 = photo({ id: 'foto2', createdAt: day('2027-01-20') })
  const clip = photo({ id: 'clip1', type: 'video', mime: 'video/mp4', createdAt: day('2027-01-03') })
  let play: ReturnType<typeof vi.fn>
  let pauseFn: ReturnType<typeof vi.fn>
  beforeEach(async () => {
    await db.blobs.clear()
    await db.records.clear()
    for (const id of ['foto1', 'foto2', 'clip1']) await db.blobs.put({ id, blob: new Blob(['x']) })
    await db.records.bulkPut([photo({ createdAt: day('2027-01-03') }), foto2, clip] as never[])
    setCurrentUserId('me')
    io.exportCompare.mockReset().mockResolvedValue(new Blob(['jpg'], { type: 'image/jpeg' }))
    io.exportSketch.mockReset().mockResolvedValue(new Blob(['jpg'], { type: 'image/jpeg' }))
    io.addMediaFiles.mockReset().mockResolvedValue({ added: [photo({ id: 'nieuw' })], skipped: [] })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob(['x']) })),
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    play = vi.fn(async () => {})
    pauseFn = vi.fn()
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pauseFn })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })
  const rect = (el: Element, w: number, h: number) =>
    ((el as HTMLElement).getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON: () => {} }) as DOMRect)
  const loadImg = (img: HTMLImageElement, w: number, h: number) => {
    Object.defineProperties(img, { naturalWidth: { value: w }, naturalHeight: { value: h } })
    fireEvent.load(img)
  }

  it('vergelijken: tweede foto eronder, dezelfde lijnen, labels toen en nu, en bewaren als één beeld', async () => {
    const user = userEvent.setup()
    render(<ClipDraw m={photo({ createdAt: day('2027-01-03') })} onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog', { name: 'Tekenen op je clip' })
    await waitFor(() => expect(dialog.querySelector('img')).toBeTruthy())
    loadImg(dialog.querySelector('img')!, 720, 1280)
    await user.click(screen.getByRole('button', { name: 'Vergelijk met een andere clip' }))
    const picker = await screen.findByRole('group', { name: 'Kies een clip om te vergelijken' })
    // eigen clip zelf staat er niet in, de andere twee wel
    expect(within(picker).getAllByRole('button', { name: /van / })).toHaveLength(2)
    await user.click(within(picker).getByRole('button', { name: 'Foto van 20 jan' }))
    const second = await screen.findByLabelText('Tekenvlak, tweede beeld')
    const imgs = dialog.querySelectorAll('img')
    loadImg(imgs[1] as HTMLImageElement, 360, 640)
    expect(screen.getByText('Toen · 3 jan')).toBeTruthy()
    expect(screen.getByText('Nu · 20 jan')).toBeTruthy()
    // een lijn op het tweede beeld komt in de maten van het eerste
    rect(second, 360, 640)
    await user.click(screen.getByRole('button', { name: 'Lijn' }))
    fireEvent.pointerDown(second, { clientX: 20, clientY: 600, pointerId: 1 })
    fireEvent.pointerMove(second, { clientX: 340, clientY: 590, pointerId: 1 })
    fireEvent.pointerUp(second, { pointerId: 1 })
    await user.click(screen.getByRole('button', { name: 'Bewaar' }))
    await waitFor(() => expect(io.exportCompare).toHaveBeenCalled())
    const [top, bottom, shapes] = io.exportCompare.mock.calls[0]
    expect(top).toMatchObject({ size: { width: 720, height: 1280 }, label: 'Toen · 3 jan' })
    expect(bottom).toMatchObject({ size: { width: 360, height: 640 }, label: 'Nu · 20 jan' })
    expect(shapes[0]).toMatchObject({ kind: 'lijn', a: { x: 40, y: 1200 }, b: { x: 680, y: 1180 } })
    expect(io.exportSketch).not.toHaveBeenCalled()
    // weer één beeld
    cleanup()
  })

  it('één beeld terug na vergelijken', async () => {
    const user = userEvent.setup()
    render(<ClipDraw m={photo()} onClose={() => {}} />)
    await user.click(await screen.findByRole('button', { name: 'Vergelijk met een andere clip' }))
    await user.click(await screen.findByRole('button', { name: 'Foto van 20 jan' }))
    expect(await screen.findByLabelText('Tekenvlak, tweede beeld')).toBeTruthy()
    // aan: wit vlak, zodat je ziet dat hij aan staat
    expect(screen.getByRole('button', { name: 'Eén beeld' }).className).toMatch(/bg-white text-black/)
    expect(screen.getByRole('button', { name: 'Eén beeld' }).className).not.toMatch(/bg-white\/10/)
    await user.click(screen.getByRole('button', { name: 'Eén beeld' }))
    expect(screen.queryByLabelText('Tekenvlak, tweede beeld')).toBeNull()
  })

  it('clip: afspelen in slow-motion, sneller of langzamer, en pauze', async () => {
    const user = userEvent.setup()
    render(<ClipDraw m={clip} onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog', { name: 'Tekenen op je clip' })
    await waitFor(() => expect(dialog.querySelector('video')).toBeTruthy())
    const v = dialog.querySelector('video')!
    Object.defineProperties(v, { videoWidth: { value: 720 }, videoHeight: { value: 1280 }, duration: { value: 4 } })
    fireEvent.loadedMetadata(v)
    await user.click(screen.getByRole('button', { name: 'Speel af' }))
    expect(play).toHaveBeenCalled()
    expect(v.playbackRate).toBe(0.5)
    await user.click(screen.getByRole('button', { name: 'Snelheid ½x' }))
    expect(v.playbackRate).toBe(0.25)
    expect(screen.getByRole('button', { name: 'Snelheid ¼x' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Pauze' }))
    expect(pauseFn).toHaveBeenCalled()
    expect(v.loop).toBe(true)
  })

  it('vraag de coach: met het moment in de clip, en bij een foto zonder', async () => {
    const user = userEvent.setup()
    const ask = vi.fn()
    render(<ClipDraw m={clip} onClose={() => {}} onAskCoach={ask} />)
    const dialog = await screen.findByRole('dialog', { name: 'Tekenen op je clip' })
    await waitFor(() => expect(dialog.querySelector('video')).toBeTruthy())
    const v = dialog.querySelector('video')!
    Object.defineProperties(v, { videoWidth: { value: 720 }, videoHeight: { value: 1280 }, duration: { value: 4 } })
    fireEvent.loadedMetadata(v)
    v.currentTime = 1.5
    await user.click(screen.getByRole('button', { name: 'Vraag de coach' }))
    expect(ask).toHaveBeenCalledWith(1.5)
    cleanup()
    render(<ClipDraw m={photo()} onClose={() => {}} onAskCoach={ask} />)
    await user.click(await screen.findByRole('button', { name: 'Vraag de coach' }))
    expect(ask).toHaveBeenLastCalledWith(null)
    // zonder coach-knop (geen viewer): ook geen knop
    cleanup()
    render(<ClipDraw m={photo()} onClose={() => {}} />)
    await screen.findByRole('dialog', { name: 'Tekenen op je clip' })
    expect(screen.queryByRole('button', { name: 'Vraag de coach' })).toBeNull()
  })

  it('vanuit de viewer: de coach opent met de clip en het moment', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/kluis']}>
        <Routes>
          <Route path="/kluis" element={<MediaViewer m={clip} onClose={() => {}} />} />
          <Route path="/coach" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Teken' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tekenen op je clip' })
    await waitFor(() => expect(dialog.querySelector('video')).toBeTruthy())
    const v = dialog.querySelector('video')!
    Object.defineProperties(v, { videoWidth: { value: 720 }, videoHeight: { value: 1280 }, duration: { value: 4 } })
    fireEvent.loadedMetadata(v)
    v.currentTime = 2.25
    await user.click(screen.getByRole('button', { name: 'Vraag de coach' }))
    expect((await screen.findByTestId('loc')).textContent).toBe('/coach?media=clip1&at=2.25')
  })
})

describe('techniek-check vanuit de tekening', () => {
  beforeEach(async () => {
    await db.records.clear()
    await db.blobs.clear()
    await db.blobs.put({ id: 'clip1', blob: new Blob(['x']) })
    await db.records.put(photo({ id: 'clip1', type: 'video', mime: 'video/mp4' }) as never)
    setCurrentUserId('me')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('begint op het moment uit de tekening', async () => {
    render(<TechniqueSheet open onClose={() => {}} onPick={() => {}} mediaId="clip1" at={2} />)
    const v = (await screen.findByLabelText('Gekozen video')) as HTMLVideoElement
    Object.defineProperty(v, 'duration', { value: 4 })
    fireEvent.loadedMetadata(v)
    expect(v.currentTime).toBe(2)
    expect((screen.getByLabelText('Moment in de video') as HTMLInputElement).value).toBe('2')
  })
})

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}
