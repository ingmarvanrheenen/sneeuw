// Trip-film (proef): van de gedeelde clips en foto's van een crew-trip een korte montage maken, op het toestel.
// Een canvas (720x1280, story-formaat) tekent intro, clips en outro in park-stijl; MediaRecorder neemt het canvas
// op. Dat gaat in echte tijd, dus de film van ~25 s duurt ~25 s om te maken. Nog zonder geluid.
import { mediaUrl } from './sync'
import { fmtShort } from './format'
import { isVisual } from './memo'
import { seeded } from './random'
import {
  caps,
  display,
  DISPLAY,
  fitDisplay,
  fontsReady,
  HOT,
  INK,
  LIME,
  loadImg,
  mascotImg,
  PAPER,
  peaks,
  resetSpacing,
  rotated,
  WHITE,
} from './shareCard'
import type { MediaMeta, Trip } from './types'

export const FILM = { w: 720, h: 1280, fps: 30 }
export const MAX_CLIPS = 8
export const CLIP_S = 2.6
export const PHOTO_S = 1.8
export const INTRO_S = 2.4
export const OUTRO_S = 2.4

export type FilmTrip = Pick<Trip, 'name' | 'resortName' | 'startDate' | 'endDate'>

export type Segment =
  | { kind: 'intro'; dur: number; title: string; sub: string }
  | { kind: 'clip'; dur: number; media: MediaMeta; rider: string; index: number; total: number }
  | { kind: 'outro'; dur: number; riders: string[] }

export interface FilmPlan {
  segments: Segment[]
  total: number
}

/**
 * Welke clips erin komen en in welke volgorde: op tijd (zoals de trip ging), max 8. Zijn er meer, dan gaan
 * video's voor foto's, en per soort een vaste maar gehusselde keuze per trip (zelfde trip = zelfde film).
 */
export function planFilm(media: MediaMeta[], names: Record<string, string>, trip: FilmTrip, seed: string): FilmPlan {
  const visual = media.filter((m) => isVisual(m) && !m.deleted)
  let picked = visual
  if (visual.length > MAX_CLIPS) {
    const rng = seeded(`film:${seed}`)
    const shuffled = (xs: MediaMeta[]) =>
      xs
        .map((m) => ({ m, k: rng() }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.m)
    const videos = shuffled(visual.filter((m) => m.type === 'video'))
    const photos = shuffled(visual.filter((m) => m.type === 'image'))
    picked = [...videos, ...photos].slice(0, MAX_CLIPS)
  }
  picked = [...picked].sort((a, b) => a.createdAt - b.createdAt)
  // echte namen, ook die van jezelf: de film is om te delen
  const who = (uid: string | null | undefined) => (uid && names[uid]) || 'Iemand'
  const dates = [trip.startDate, trip.endDate && trip.endDate !== trip.startDate ? trip.endDate : null]
    .filter(Boolean)
    .map((d) => fmtShort(d!))
    .join(' – ')
  const segments: Segment[] = [
    {
      kind: 'intro',
      dur: INTRO_S,
      title: trip.name || trip.resortName || 'De trip',
      sub: [trip.resortName, dates].filter(Boolean).join(' · '),
    },
    ...picked.map((m, i): Segment => ({
      kind: 'clip',
      dur: m.type === 'video' ? CLIP_S : PHOTO_S,
      media: m,
      rider: who(m.userId),
      index: i + 1,
      total: picked.length,
    })),
    { kind: 'outro', dur: OUTRO_S, riders: [...new Set(picked.map((m) => who(m.userId)))] },
  ]
  return { segments, total: Math.round(segments.reduce((n, s) => n + s.dur, 0) * 10) / 10 }
}

/** Welk filmformaat de browser kan opnemen. iPhone: mp4 (H.264); Chrome en Firefox: webm. */
export function pickVideoMime(supports: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
    try {
      if (supports(t)) return t
    } catch {
      // oudere Safari gooit hier soms
    }
  return ''
}

export function canMakeFilm(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof (HTMLCanvasElement.prototype as HTMLCanvasElement & { captureStream?: unknown }).captureStream === 'function'
  )
}

export const filmName = (trip: FilmTrip, mime: string) =>
  `trip-film-${(trip.name || trip.resortName || 'trip')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.${mime.includes('mp4') ? 'mp4' : 'webm'}`

// ── Tekenen ─────────────────────────────────────────────────────────────────

const { w: W, h: H } = FILM
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)
/** "slap": groot en gedraaid erop, dan vast (zoals de stickers in de app) */
const slap = (t: number) => (t < 0.18 ? 1.6 - 0.6 * ease(t / 0.18) : 1 + 0.04 * Math.sin(Math.min(1, (t - 0.18) / 0.2) * Math.PI))

type Source = HTMLVideoElement | HTMLImageElement
const sizeOf = (s: Source) =>
  s instanceof HTMLVideoElement ? [s.videoWidth, s.videoHeight] : [s.naturalWidth || s.width, s.naturalHeight || s.height]

function coverSource(c: CanvasRenderingContext2D, src: Source, zoom = 1) {
  const [sw, sh] = sizeOf(src)
  if (!sw || !sh) return
  const r = Math.max(W / sw, H / sh) * zoom
  c.drawImage(src, (W - sw * r) / 2, (H - sh * r) / 2, sw * r, sh * r)
}

let grainTile: HTMLCanvasElement | null = null
function grain(c: CanvasRenderingContext2D) {
  if (!grainTile) {
    grainTile = document.createElement('canvas')
    grainTile.width = grainTile.height = 128
    const t = grainTile.getContext('2d')!
    const img = t.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.random() * 255
      img.data[i + 3] = 16
    }
    t.putImageData(img, 0, 0)
  }
  c.fillStyle = c.createPattern(grainTile, 'repeat')!
  c.fillRect(0, 0, W, H)
}

function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, bg: string, fg: string, tilt: number, s = 1) {
  caps(c, size)
  const tw = c.measureText(text).width
  const pad = size * 0.55
  const bw = tw + pad * 2
  const bh = size * 1.7
  c.save()
  c.translate(x + bw / 2, y + bh / 2)
  c.rotate((tilt * Math.PI) / 180)
  c.scale(s, s)
  c.fillStyle = 'rgba(0,0,0,0.35)'
  c.fillRect(-bw / 2 + 5, -bh / 2 + 6, bw, bh)
  c.fillStyle = bg
  c.fillRect(-bw / 2, -bh / 2, bw, bh)
  c.fillStyle = fg
  c.textBaseline = 'middle'
  c.fillText(text, -tw / 2, 1)
  c.restore()
  resetSpacing(c)
}

function drawIntro(c: CanvasRenderingContext2D, seg: Extract<Segment, { kind: 'intro' }>, t: number) {
  c.fillStyle = INK
  c.fillRect(0, 0, W, H)
  peaks(c, W - 560, H - 420 + 40 * (1 - ease(t * 2)), 640, 'rgba(245,245,239,0.07)')
  label(c, 'Trip-film', 56, 250, 26, HOT, INK, -4, slap(t * 2.2))
  const title = seg.title.toUpperCase()
  const size = fitDisplay(c, title, 150, W - 112, 64)
  c.fillStyle = LIME
  c.textBaseline = 'alphabetic'
  const rise = 60 * (1 - ease((t - 0.08) * 3))
  c.globalAlpha = ease((t - 0.08) * 4)
  rotated(c, W / 2, 520, -2 * (1 - ease(t * 3)), () => c.fillText(title, 56, 520 + rise))
  c.globalAlpha = 1
  resetSpacing(c)
  if (seg.sub) {
    c.font = `600 34px -apple-system, system-ui, sans-serif`
    c.fillStyle = PAPER
    c.globalAlpha = ease((t - 0.25) * 4)
    c.fillText(seg.sub, 58, 520 + size * 0.55)
    c.globalAlpha = 1
  }
  grain(c)
}

function drawClip(c: CanvasRenderingContext2D, seg: Extract<Segment, { kind: 'clip' }>, src: Source | null, t: number) {
  c.fillStyle = INK
  c.fillRect(0, 0, W, H)
  if (src) coverSource(c, src, src instanceof HTMLImageElement ? 1 + 0.06 * t : 1)
  else {
    // clip niet te laden: een poster in plaats van een zwart gat
    c.fillStyle = LIME
    c.fillRect(0, 0, W, H)
    peaks(c, 60, H / 2 - 120, W - 120, 'rgba(13,13,15,0.12)')
  }
  // onderrand donkerder zodat de sticker leesbaar is
  const g = c.createLinearGradient(0, H - 420, 0, H)
  g.addColorStop(0, 'rgba(13,13,15,0)')
  g.addColorStop(1, 'rgba(13,13,15,0.55)')
  c.fillStyle = g
  c.fillRect(0, H - 420, W, 420)
  label(c, seg.rider, 48, H - 210, 40, LIME, INK, seg.index % 2 ? -5 : 4, slap(t * 2.4))
  caps(c, 22)
  c.fillStyle = WHITE
  c.textBaseline = 'alphabetic'
  c.fillText(`${seg.index}/${seg.total}`, W - 110, 110)
  resetSpacing(c)
  // korte witte flits bij de overgang, als een camera-klik
  if (t < 0.06) {
    c.fillStyle = `rgba(255,255,255,${0.5 * (1 - t / 0.06)})`
    c.fillRect(0, 0, W, H)
  }
  grain(c)
}

function drawOutro(c: CanvasRenderingContext2D, seg: Extract<Segment, { kind: 'outro' }>, mascot: HTMLImageElement | null, t: number) {
  c.fillStyle = LIME
  c.fillRect(0, 0, W, H)
  peaks(c, -40, H - 360, 700, 'rgba(13,13,15,0.1)')
  c.fillStyle = INK
  c.textBaseline = 'alphabetic'
  display(c, 120)
  const rise = 50 * (1 - ease(t * 3))
  c.fillText('MET', 56, 300 + rise)
  resetSpacing(c)
  seg.riders.slice(0, 8).forEach((r, i) => {
    const at = 0.12 + i * 0.07
    if (t < at) return
    label(c, r, 56 + (i % 2) * 20, 360 + i * 92, 38, i % 3 === 1 ? HOT : INK, i % 3 === 1 ? INK : LIME, i % 2 ? 3 : -3, slap((t - at) * 3))
  })
  if (mascot) {
    const s = slap((t - 0.3) * 2.5)
    if (t > 0.3) rotated(c, W - 170, H - 300, -8, () => c.drawImage(mascot, W - 170 - 130 * s, H - 300 - 130 * s, 260 * s, 260 * s))
  }
  c.font = `800 26px ${DISPLAY}`
  c.fillText('SNEEUW DADDY', 56, H - 90)
  grain(c)
}

/** Een frame tekenen (los te gebruiken, ook voor de preview). */
export function drawFrame(
  c: CanvasRenderingContext2D,
  seg: Segment,
  t: number,
  assets: { src?: Source | null; mascot?: HTMLImageElement | null },
) {
  if (seg.kind === 'intro') drawIntro(c, seg, t)
  else if (seg.kind === 'clip') drawClip(c, seg, assets.src ?? null, t)
  else drawOutro(c, seg, assets.mascot ?? null, t)
}

// ── Opnemen ─────────────────────────────────────────────────────────────────

function loadVideo(url: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    // iOS speelt een video die niet in de pagina hangt soms niet af: onzichtbaar erin hangen tijdens het maken
    v.setAttribute('aria-hidden', 'true')
    Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' })
    document.body.appendChild(v)
    const done = (ok: boolean) => {
      clearTimeout(timer)
      if (!ok) v.remove()
      resolve(ok ? v : null)
    }
    const timer = setTimeout(() => done(false), 10_000)
    v.onloadeddata = () => done(true)
    v.onerror = () => done(false)
    v.src = url
    v.load()
  })
}

async function loadSource(m: MediaMeta): Promise<Source | null> {
  const url = await mediaUrl(m).catch(() => null)
  if (!url) return m.thumb ? loadImg(m.thumb) : null
  if (m.type === 'video') return (await loadVideo(url)) ?? (m.thumb ? loadImg(m.thumb) : null)
  return loadImg(url)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * De film maken: alles laden, dan in echte tijd tekenen en opnemen. `canvas` mag je zelf meegeven om het
 * live te laten zien. Afbreken via `signal`.
 */
export async function renderFilm(
  plan: FilmPlan,
  opts: { canvas?: HTMLCanvasElement; onProgress?: (p: { phase: 'laden' | 'opnemen'; done: number }) => void; signal?: AbortSignal } = {},
): Promise<Blob> {
  const mime = pickVideoMime()
  if (mime === null || !canMakeFilm()) throw new Error('Deze browser kan geen film maken.')
  await fontsReady()
  const canvas = opts.canvas ?? document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!

  const clips = plan.segments.filter((s): s is Extract<Segment, { kind: 'clip' }> => s.kind === 'clip')
  const sources = new Map<string, Source | null>()
  let loaded = 0
  for (const s of clips) {
    if (opts.signal?.aborted) throw new DOMException('afgebroken', 'AbortError')
    sources.set(s.media.id, await loadSource(s.media))
    opts.onProgress?.({ phase: 'laden', done: ++loaded / Math.max(1, clips.length) })
  }
  const mascot = await mascotImg(300)

  const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(FILM.fps)
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()))
  drawFrame(c, plan.segments[0], 0, {})
  rec.start(500)

  let elapsed = 0
  try {
    for (const seg of plan.segments) {
      const src = seg.kind === 'clip' ? (sources.get(seg.media.id) ?? null) : null
      if (src instanceof HTMLVideoElement) {
        // vanaf iets na het begin (de eerste tel is vaak schudden), niet voorbij het eind
        const start = Math.max(0, Math.min(0.4, (src.duration || 0) - seg.dur))
        src.currentTime = start
        await Promise.race([new Promise((r) => (src.onseeked = r)), sleep(1500)])
        await src.play().catch(() => {})
      }
      const t0 = performance.now()
      for (;;) {
        if (opts.signal?.aborted) throw new DOMException('afgebroken', 'AbortError')
        const t = (performance.now() - t0) / 1000
        if (t >= seg.dur) break
        drawFrame(c, seg, t / seg.dur, { src, mascot })
        opts.onProgress?.({ phase: 'opnemen', done: Math.min(1, (elapsed + t) / plan.total) })
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      if (src instanceof HTMLVideoElement) src.pause()
      elapsed += seg.dur
    }
  } finally {
    rec.stop()
    stream.getTracks().forEach((t) => t.stop())
    for (const s of sources.values())
      if (s instanceof HTMLVideoElement) {
        s.removeAttribute('src')
        s.remove()
      }
  }
  await stopped
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0]
  return new Blob(chunks, { type })
}

/** Stil of gestopt? Een film van een paar KB is mislukt. */
export const looksEmpty = (b: Blob) => b.size < 10_000
