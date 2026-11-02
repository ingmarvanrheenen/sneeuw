// Tekenen op je clip: hoeken rekenen, schermpunten naar beeldpixels, de tekening zelf, en het tekenscherm.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const io = vi.hoisted(() => ({ addMediaFiles: vi.fn(), exportSketch: vi.fn(), shareFile: vi.fn() }))
vi.mock('../lib/media', async (orig) => ({ ...(await orig<typeof import('../lib/media')>()), addMediaFiles: io.addMediaFiles }))
vi.mock('../lib/shareCard', async (orig) => ({ ...(await orig<typeof import('../lib/shareCard')>()), shareFile: io.shareFile }))
vi.mock('../lib/sketch', async (orig) => ({ ...(await orig<typeof import('../lib/sketch')>()), exportSketch: io.exportSketch }))

import { angleAt, drawShapes, thin, toImage, tooShort, TOOLS } from '../lib/sketch'
import { ClipDraw } from '../components/ClipDraw'
import { MediaViewer } from '../components/Media'
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
