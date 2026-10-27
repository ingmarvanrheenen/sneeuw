import { describe, expect, it, vi } from 'vitest'
import { compressVideo } from '../lib/videoCompress'

// Het echte verkleinen draait op WebCodecs en is met Playwright in Chromium getest
// (25 MB -> 2 MB, rotatie en geluid behouden). Hier: dat hij veilig terugvalt.
describe('video verkleinen', () => {
  it('zonder WebCodecs: null, zodat het origineel gebruikt wordt', async () => {
    vi.stubGlobal('VideoEncoder', undefined)
    expect(await compressVideo(new Blob(['x'], { type: 'video/quicktime' }))).toBeNull()
    vi.unstubAllGlobals()
  })

  it('onleesbaar bestand: null in plaats van een fout', async () => {
    vi.stubGlobal('VideoEncoder', class {})
    vi.stubGlobal('VideoDecoder', class {})
    expect(await compressVideo(new Blob(['geen video'], { type: 'video/mp4' }))).toBeNull()
    vi.unstubAllGlobals()
  })
})
