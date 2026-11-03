// Trip-film sneller dan in echte tijd: welke codecs, en terugvallen op opnemen in echte tijd als het niet kan.
// Het coderen zelf (WebCodecs, OfflineAudioContext) checken we in een echte browser.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickCodecs } from '../lib/filmFast'
import { fastSupported, planFilm, renderFilm } from '../lib/tripFilm'

afterEach(() => vi.unstubAllGlobals())

/** Nagebootste encoders: `ok` zegt welke codecs de "browser" kan. */
function stubEncoders(ok: string[], audio = true) {
  const check = async (c: { codec: string }) => ({ supported: ok.includes(c.codec) })
  vi.stubGlobal('VideoEncoder', { isConfigSupported: check })
  if (audio) vi.stubGlobal('AudioEncoder', { isConfigSupported: check })
}

describe('codecs kiezen', () => {
  it('H.264 en AAC als het kan (iPhone)', async () => {
    stubEncoders(['avc1.640028', 'mp4a.40.2', 'opus'])
    const c = await pickCodecs(true)
    expect(c?.video).toMatchObject({
      mux: 'avc',
      config: { codec: 'avc1.640028', width: 720, height: 1280, framerate: 30, avc: { format: 'avc' } },
    })
    expect(c?.audio).toMatchObject({ mux: 'aac', config: { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 } })
  })

  it('anders een lager H.264-profiel, of VP9 en Opus', async () => {
    stubEncoders(['avc1.42001f', 'opus'])
    expect((await pickCodecs(true))?.video.config.codec).toBe('avc1.42001f')
    stubEncoders(['vp09.00.31.08', 'opus'])
    const c = await pickCodecs(true)
    expect(c?.video).toMatchObject({ mux: 'vp9' })
    expect(c?.video.config).not.toHaveProperty('avc')
    expect(c?.audio?.mux).toBe('opus')
  })

  it('geen geluid nodig: alleen beeld; geluid nodig maar geen AudioEncoder: niet snel', async () => {
    stubEncoders(['avc1.640028'], false)
    expect(await pickCodecs(false)).toMatchObject({ audio: null })
    expect(await pickCodecs(true)).toBeNull()
    stubEncoders([])
    expect(await pickCodecs(false)).toBeNull()
  })
})

describe('terugvallen', () => {
  it('snel kan alleen met VideoEncoder, VideoFrame en OfflineAudioContext', () => {
    expect(fastSupported()).toBe(false) // jsdom
    vi.stubGlobal('VideoEncoder', class {})
    vi.stubGlobal('VideoFrame', class {})
    vi.stubGlobal('OfflineAudioContext', class {})
    expect(fastSupported()).toBe(true)
  })

  it('kan de browser het niet snel, dan gewoon in echte tijd (hier: ook dat kan jsdom niet)', async () => {
    vi.stubGlobal('VideoEncoder', { isConfigSupported: async () => ({ supported: false }) })
    vi.stubGlobal('VideoFrame', class {})
    vi.stubGlobal('OfflineAudioContext', class {})
    const plan = planFilm([], {}, { name: 'x', resortName: '', startDate: '2027-01-16' }, 't')
    await expect(renderFilm(plan, {})).rejects.toThrow('Deze browser kan geen film maken.')
  })
})
