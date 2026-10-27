import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const compress = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('../lib/videoCompress', () => ({ compressVideo: compress.fn }))

import { db, type BlobRow } from '../lib/db'
import { addMediaFiles, MAX_VIDEO_INPUT_MB, MAX_VIDEO_MB } from '../lib/media'
import { listKind } from '../lib/repo'

const MB = 1024 * 1024
const blobs = new Map<string, Blob>()

/** Een bestand dat een bepaalde grootte opgeeft zonder dat we zoveel geheugen gebruiken. */
function fileOfSize(name: string, type: string, size: number, bytes = 'x') {
  const f = new File([bytes], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}
const bigBlob = (size: number, type = 'video/mp4') => {
  const b = new Blob(['klein'], { type })
  Object.defineProperty(b, 'size', { value: size })
  return b
}

beforeEach(async () => {
  await db.records.clear()
  blobs.clear()
  compress.fn.mockReset()
  vi.spyOn(db.blobs, 'put').mockImplementation((async (row: BlobRow) => (blobs.set(row.id, row.blob), row.id)) as never)
  // jsdom laadt geen plaatjes of video's: meteen "kan niet laden", zodat de fallback-paden draaien
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      set src(_: string) {
        setTimeout(() => this.onerror?.(new Error('geen decoder')))
      }
    },
  )
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    configurable: true,
    set(this: HTMLMediaElement) {
      setTimeout(() => this.onerror?.(new Event('error')))
    },
  })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('media toevoegen', () => {
  it('slaat een foto op met de echte bytes en de grootte', async () => {
    const { added, skipped } = await addMediaFiles([new File(['jpeg-bytes'], 'a.jpg', { type: 'image/jpeg' })], { sessionId: 's1' })
    expect(skipped).toEqual([])
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ type: 'image', size: 10, sessionId: 's1', crewId: null })
    expect(new TextDecoder().decode(await blobs.get(added[0].id)!.arrayBuffer())).toBe('jpeg-bytes')
  })

  it('een leeg bestand wordt nooit opgeslagen', async () => {
    const { added, skipped } = await addMediaFiles([new File([], 'leeg.jpg', { type: 'image/jpeg' })], {})
    expect(added).toEqual([])
    expect(skipped[0]).toMatch(/leeg\.jpg kon niet worden ingelezen/)
    expect(await listKind('media')).toEqual([])
  })

  it('video: verkleinde versie met geluid wordt gebruikt', async () => {
    compress.fn.mockResolvedValue({ blob: new Blob(['klein mp4'], { type: 'video/mp4' }), mime: 'video/mp4', hasAudio: true })
    const { added } = await addMediaFiles([new File(['x'.repeat(1000)], 'clip.mov', { type: 'video/quicktime' })], {})
    expect(added[0]).toMatchObject({ type: 'video', mime: 'video/mp4', size: 9 })
  })

  it('video: geen winst of geen WebCodecs, dan het origineel', async () => {
    compress.fn.mockResolvedValue(null)
    const { added } = await addMediaFiles([new File(['origineel'], 'clip.mov', { type: 'video/quicktime' })], {})
    expect(added[0]).toMatchObject({ mime: 'video/quicktime', size: 9 })
  })

  it('video: verkleind zonder geluid, dan liever het origineel als dat past', async () => {
    compress.fn.mockResolvedValue({ blob: new Blob(['stil'], { type: 'video/mp4' }), mime: 'video/mp4', hasAudio: false })
    const { added } = await addMediaFiles([new File(['origineel met geluid'], 'clip.mov', { type: 'video/quicktime' })], {})
    expect(added[0].mime).toBe('video/quicktime')
  })

  it('video: origineel te groot en zonder geluid verkleind, dan toch de kleine versie', async () => {
    compress.fn.mockResolvedValue({ blob: new Blob(['stil'], { type: 'video/mp4' }), mime: 'video/mp4', hasAudio: false })
    const { added } = await addMediaFiles([fileOfSize('lang.mov', 'video/quicktime', 80 * MB)], {})
    expect(added[0].mime).toBe('video/mp4')
  })

  it(`video boven ${MAX_VIDEO_INPUT_MB} MB: meteen geweigerd`, async () => {
    const { added, skipped } = await addMediaFiles([fileOfSize('film.mov', 'video/quicktime', (MAX_VIDEO_INPUT_MB + 1) * MB)], {})
    expect(added).toEqual([])
    expect(skipped[0]).toMatch(/te groot/)
    expect(compress.fn).not.toHaveBeenCalled()
  })

  it(`video ook na verkleinen boven ${MAX_VIDEO_MB} MB: geweigerd met tip`, async () => {
    compress.fn.mockResolvedValue({ blob: bigBlob((MAX_VIDEO_MB + 5) * MB), mime: 'video/mp4', hasAudio: true })
    const { added, skipped } = await addMediaFiles([fileOfSize('lang.mov', 'video/quicktime', 300 * MB)], {})
    expect(added).toEqual([])
    expect(skipped[0]).toMatch(/Knip hem korter/)
  })

  it('geeft voortgang door per bestand', async () => {
    compress.fn.mockImplementation(async (_f: Blob, onProgress?: (p: number) => void) => {
      onProgress?.(0.5)
      return null
    })
    const seen: number[] = []
    await addMediaFiles([new File(['a'], 'a.mov', { type: 'video/quicktime' })], {}, (p) => seen.push(p.progress))
    expect(seen).toContain(0.5)
  })
})
