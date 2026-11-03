// Trip-film sneller dan in echte tijd: elk frame tekenen en coderen met WebCodecs (VideoEncoder), het geluid in
// één keer mixen met een OfflineAudioContext en coderen met AudioEncoder, en alles in een mp4 zetten. Clips
// lezen we in door ze versneld af te spelen (requestVideoFrameCallback), of anders frame voor frame te zoeken.
// Lukt iets niet, dan valt renderFilm terug op opnemen in echte tijd.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import {
  clipStart,
  drawFrame,
  FILM,
  loadClip,
  thumbOf,
  timeline,
  type FilmOptions,
  type FilmPlan,
  type Loaded,
  type Segment,
} from './tripFilm'
import { fontsReady, mascotImg } from './shareCard'
import { scheduleMusic, TRACK_BY_ID } from './filmMusic'

const { w: W, h: H, fps: FPS } = FILM
const SAMPLE_RATE = 48_000
/** clips zoveel keer sneller afspelen tijdens het inlezen */
const RATE = 2

export interface Codecs {
  video: { config: VideoEncoderConfig; mux: 'avc' | 'vp9' }
  audio: { config: AudioEncoderConfig; mux: 'aac' | 'opus' } | null
}

/** Welke codecs deze browser kan coderen. H.264 en AAC als het kan (iPhone), anders VP9 en Opus. */
export async function pickCodecs(withAudio: boolean): Promise<Codecs | null> {
  if (typeof VideoEncoder === 'undefined') return null
  const base = { width: W, height: H, bitrate: 5_000_000, framerate: FPS }
  let video: Codecs['video'] | null = null
  for (const [codec, mux] of [
    ['avc1.640028', 'avc'],
    ['avc1.4d0028', 'avc'],
    ['avc1.42001f', 'avc'],
    ['vp09.00.31.08', 'vp9'],
  ] as const) {
    const config: VideoEncoderConfig = { ...base, codec, ...(mux === 'avc' ? { avc: { format: 'avc' } } : {}) }
    if ((await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }))).supported) {
      video = { config, mux }
      break
    }
  }
  if (!video) return null
  if (!withAudio) return { video, audio: null }
  if (typeof AudioEncoder === 'undefined') return null
  for (const [codec, mux] of [
    ['mp4a.40.2', 'aac'],
    ['opus', 'opus'],
  ] as const) {
    const config: AudioEncoderConfig = { codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 160_000 }
    if ((await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }))).supported)
      return { video, audio: { config, mux } }
  }
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Muziek en clipgeluid in één keer mixen, net als in echte tijd (limiter, muziek zachter onder een clip). */
export async function mixAudio(
  plan: FilmPlan,
  opts: FilmOptions,
  buffers: (AudioBuffer | null)[],
  clipStarts: number[],
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(plan.total * SAMPLE_RATE) + SAMPLE_RATE / 4, SAMPLE_RATE)
  const master = ctx.createGain()
  master.gain.value = 0.6
  const limit = ctx.createDynamicsCompressor()
  limit.threshold.value = -6
  limit.knee.value = 4
  limit.ratio.value = 12
  limit.attack.value = 0.003
  limit.release.value = 0.15
  master.connect(limit)
  limit.connect(ctx.destination)
  const track = opts.music && opts.music !== 'geen' ? TRACK_BY_ID.get(opts.music) : undefined
  const music = track ? scheduleMusic(ctx, master, track, 0, plan.total) : null
  const starts = timeline(plan)
  plan.segments.forEach((seg, i) => {
    const buf = buffers[i]
    if (seg.kind !== 'clip' || !buf || !opts.clipAudio) return
    const at = starts[i]
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(1, at + 0.06)
    g.gain.setValueAtTime(1, at + seg.dur - 0.08)
    g.gain.linearRampToValueAtTime(0.0001, at + seg.dur)
    src.connect(g)
    g.connect(master)
    src.start(at, clipStarts[i], seg.dur)
    if (music) {
      music.gain.setValueAtTime(1, at)
      music.gain.linearRampToValueAtTime(0.35, at + 0.12)
      music.gain.setValueAtTime(0.35, at + seg.dur - 0.12)
      music.gain.linearRampToValueAtTime(1, at + seg.dur)
    }
  })
  return ctx.startRendering()
}

/** Per frame het juiste beeld van een clip: versneld afspelen en meelezen, of frame voor frame zoeken. */
async function clipFrames(v: HTMLVideoElement, start: number, dur: number, onFrame: (k: number) => Promise<void>) {
  const n = Math.max(1, Math.round(dur * FPS))
  v.currentTime = start
  await Promise.race([new Promise((r) => (v.onseeked = r)), sleep(1500)])
  let k = 0
  const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number })
    .requestVideoFrameCallback
  if (rvfc) {
    v.muted = true
    v.playbackRate = RATE
    await new Promise<void>((resolve) => {
      let last = Date.now()
      let busy = false
      const tick = (_: number, meta: { mediaTime: number }) => {
        last = Date.now()
        if (!busy) {
          busy = true
          void (async () => {
            // alle frames tot waar de video nu is, met dit beeld
            while (k < n && start + k / FPS <= meta.mediaTime + 0.5 / FPS) await onFrame(k++)
            busy = false
            if (k >= n || v.ended) return resolve()
            rvfc.call(v, tick)
          })()
        } else rvfc.call(v, tick)
      }
      rvfc.call(v, tick)
      void v.play().catch(() => resolve())
      // hangt de video (geen nieuwe frames), dan de rest met zoeken
      const guard = setInterval(() => {
        if (k >= n || Date.now() - last > 1500) {
          clearInterval(guard)
          resolve()
        }
      }, 300)
    })
    v.pause()
    v.playbackRate = 1
  }
  // wat er nog over is (of zonder requestVideoFrameCallback): frame voor frame zoeken
  while (k < n) {
    const t = Math.min(start + k / FPS, Math.max(0, (v.duration || dur) - 0.05))
    if (Math.abs(v.currentTime - t) > 0.5 / FPS) {
      v.currentTime = t
      await Promise.race([new Promise((r) => (v.onseeked = r)), sleep(800)])
    }
    await onFrame(k++)
  }
}

export async function renderFilmFast(plan: FilmPlan, opts: FilmOptions, codecs: Codecs): Promise<Blob> {
  const abort = () => {
    if (opts.signal?.aborted) throw new DOMException('afgebroken', 'AbortError')
  }
  await fontsReady()
  const canvas = opts.canvas ?? document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const segs = plan.segments
  const starts = timeline(plan)
  const totalFrames = Math.round(plan.total * FPS)

  // clips laden (beeld en geluid in één keer)
  const decoder = codecs.audio ? new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE) : null
  const loaded = new Map<string, Loaded>()
  const clips = segs.filter((s): s is Extract<Segment, { kind: 'clip' }> => s.kind === 'clip')
  let n = 0
  for (const s of clips) {
    abort()
    loaded.set(s.media.id, await loadClip(s.media, opts.clipAudio ? decoder : null))
    opts.onProgress?.({ phase: 'laden', done: ++n / Math.max(1, clips.length) })
  }
  const mascot = await mascotImg(300)

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: codecs.video.mux, width: W, height: H, frameRate: FPS },
    ...(codecs.audio ? { audio: { codec: codecs.audio.mux, numberOfChannels: 2, sampleRate: SAMPLE_RATE } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })
  let failed: unknown = null
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failed = e) })
  venc.configure(codecs.video.config)

  let frame = 0
  let thumbed = false
  const emit = async (seg: Segment, i: number, local: number, src: Loaded['src']) => {
    abort()
    if (failed) throw failed
    drawFrame(c, seg, Math.min(1, local / seg.dur), { src, mascot }, opts.style)
    if (!thumbed && i === 0 && local >= seg.dur * 0.6 && opts.onThumb) {
      thumbed = true
      opts.onThumb(thumbOf(canvas))
    }
    const vf = new VideoFrame(canvas, { timestamp: Math.round((frame * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
    venc.encode(vf, { keyFrame: frame % (FPS * 2) === 0 })
    vf.close()
    frame++
    // niet te ver voor de encoder uit lopen, en de pagina laten ademen
    while (venc.encodeQueueSize > 8) await sleep(4)
    if (frame % 10 === 0) {
      opts.onProgress?.({ phase: 'opnemen', done: Math.min(1, frame / totalFrames) })
      await sleep(0)
    }
  }

  try {
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]
      // frames van dit stuk: tot het begin van het volgende (zo telt alles precies op)
      const first = Math.round(starts[i] * FPS)
      const end = i + 1 < segs.length ? Math.round(starts[i + 1] * FPS) : totalFrames
      const count = Math.max(0, end - first)
      const l = seg.kind === 'clip' ? loaded.get(seg.media.id) : undefined
      const src = l?.src ?? null
      if (src instanceof HTMLVideoElement) {
        await clipFrames(src, clipStart(src.duration, seg.dur), count / FPS, (k) => emit(seg, i, k / FPS, src))
      } else for (let k = 0; k < count; k++) await emit(seg, i, k / FPS, src)
    }
    await venc.flush()
    if (failed) throw failed

    // geluid
    if (codecs.audio) {
      const buffers = segs.map((s) => (s.kind === 'clip' ? (loaded.get(s.media.id)?.audio ?? null) : null))
      const clipStarts = segs.map((s) => {
        const v = s.kind === 'clip' ? loaded.get(s.media.id)?.src : null
        return v instanceof HTMLVideoElement ? clipStart(v.duration, s.dur) : 0
      })
      const mixed = await mixAudio(plan, opts, buffers, clipStarts)
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failed = e) })
      aenc.configure(codecs.audio.config)
      const block = 1024 * 8
      const length = Math.min(mixed.length, Math.round(plan.total * SAMPLE_RATE))
      for (let off = 0; off < length; off += block) {
        const frames = Math.min(block, length - off)
        const data = new Float32Array(frames * 2)
        data.set(mixed.getChannelData(0).subarray(off, off + frames), 0)
        data.set(mixed.getChannelData(1).subarray(off, off + frames), frames)
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate: SAMPLE_RATE,
          numberOfFrames: frames,
          numberOfChannels: 2,
          timestamp: Math.round((off * 1e6) / SAMPLE_RATE),
          data,
        })
        aenc.encode(ad)
        ad.close()
      }
      await aenc.flush()
      aenc.close()
      if (failed) throw failed
    }
    muxer.finalize()
    opts.onProgress?.({ phase: 'opnemen', done: 1 })
    return new Blob([target.buffer], { type: 'video/mp4' })
  } finally {
    if (venc.state !== 'closed') venc.close()
    for (const l of loaded.values()) {
      if (l.src instanceof HTMLVideoElement) {
        l.src.pause()
        l.src.removeAttribute('src')
        l.src.remove()
      }
      if (l.url) URL.revokeObjectURL(l.url)
    }
  }
}
