// Trip-film (proef): van de gedeelde clips en foto's van een crew-trip een korte montage maken, op het toestel.
// Een canvas (720x1280, story-formaat) tekent intro, clips en outro in park-stijl; MediaRecorder neemt het canvas
// op. Dat gaat in echte tijd, dus de film van ~25 s duurt ~25 s om te maken. Nog zonder geluid.
import { mediaUrl } from './sync'
import { fmtDate, fmtShort } from './format'
import { isVisual } from './memo'
import { seeded } from './random'
import {
  burst,
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
import { scheduleMusic, TRACK_BY_ID, type TrackId } from './filmMusic'
import { db } from './db'
import { create } from './repo'
import { uid } from './ids'
import { MAX_VIDEO_MB } from './media'

export const FILM = { w: 720, h: 1280, fps: 30 }
export const MAX_CLIPS = 8
export const CLIP_S = 2.6
export const PHOTO_S = 1.8
export const INTRO_S = 2.4
export const OUTRO_S = 2.4

export type FilmTrip = Pick<Trip, 'name' | 'resortName' | 'startDate' | 'endDate'>

export type Segment =
  | { kind: 'intro'; dur: number; title: string; sub: string }
  | { kind: 'clip'; dur: number; media: MediaMeta; rider: string; index: number; total: number; opener?: boolean }
  | { kind: 'outro'; dur: number; riders: string[] }

export interface FilmPlan {
  segments: Segment[]
  total: number
}

/** Wat in de film mag: foto's en video's, niet weggegooid, oudste eerst. */
export const filmable = (media: MediaMeta[]) => media.filter((m) => isVisual(m) && !m.deleted).sort((a, b) => a.createdAt - b.createdAt)

/**
 * Welke clips erin komen. Eigen keuze (`pick`, ids) gaat voor, zolang er nog iets van bestaat; anders automatisch:
 * alles, of bij meer dan 8 video's voor foto's, met een vaste maar gehusselde keuze per trip. Altijd op tijd.
 */
export function pickClips(media: MediaMeta[], seed: string, pick?: string[] | null): MediaMeta[] {
  const visual = filmable(media)
  const own = pick?.length ? visual.filter((m) => pick.includes(m.id)).slice(0, MAX_CLIPS) : []
  if (own.length) return own
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
  return [...picked].sort((a, b) => a.createdAt - b.createdAt)
}

export function planFilm(
  media: MediaMeta[],
  names: Record<string, string>,
  trip: FilmTrip,
  seed: string,
  opts: { bpm?: number; pick?: string[] | null; opener?: string | null } = {},
): FilmPlan {
  // met muziek: elke cut op de beat (intro en clips 4 tellen, foto's 3, outro 4 plus een uitloop)
  const beat = opts.bpm ? 60 / opts.bpm : 0
  const snap = (s: number, beats: number) => (beat ? Math.round(beats * beat * 1000) / 1000 : s)
  let picked = pickClips(media, seed, opts.pick)
  // de clip van de trip (winnaar van het toernooi) als opener; zelf gekozen clips gaan voor
  const opener =
    opts.opener && !(opts.pick?.length && !opts.pick.includes(opts.opener)) ? filmable(media).find((m) => m.id === opts.opener) : undefined
  if (opener) picked = [opener, ...picked.filter((m) => m.id !== opener.id)].slice(0, MAX_CLIPS)
  // echte namen, ook die van jezelf: de film is om te delen
  const who = (uid: string | null | undefined) => (uid && names[uid]) || 'Iemand'
  const dates = [trip.startDate, trip.endDate && trip.endDate !== trip.startDate ? trip.endDate : null]
    .filter(Boolean)
    .map((d) => fmtShort(d!))
    .join(' – ')
  const segments: Segment[] = [
    {
      kind: 'intro',
      dur: snap(INTRO_S, 4),
      title: trip.name || trip.resortName || 'De trip',
      sub: [trip.resortName, dates].filter(Boolean).join(' · '),
    },
    ...picked.map((m, i): Segment => ({
      kind: 'clip',
      dur: m.type === 'video' ? snap(CLIP_S, 4) : snap(PHOTO_S, 3),
      media: m,
      rider: who(m.userId),
      index: i + 1,
      total: picked.length,
      ...(opener && i === 0 ? { opener: true } : {}),
    })),
    { kind: 'outro', dur: snap(OUTRO_S, 6), riders: [...new Set(picked.map((m) => who(m.userId)))] },
  ]
  return { segments, total: Math.round(segments.reduce((n, s) => n + s.dur, 0) * 1000) / 1000 }
}

/** Welk filmformaat de browser kan opnemen. iPhone: mp4 (H.264); Chrome en Firefox: webm. */
export function pickVideoMime(
  supports: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t),
  withAudio = false,
): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const list = withAudio
    ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  for (const t of list)
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

let grainLayer: HTMLCanvasElement | null = null
/** Korrel over het hele beeld. Eén keer getekend en daarna als één laag erover: veel goedkoper per frame. */
function grain(c: CanvasRenderingContext2D) {
  if (!grainLayer) {
    const tile = document.createElement('canvas')
    tile.width = tile.height = 128
    const t = tile.getContext('2d')!
    const img = t.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.random() * 255
      img.data[i + 3] = 16
    }
    t.putImageData(img, 0, 0)
    grainLayer = document.createElement('canvas')
    grainLayer.width = W
    grainLayer.height = H
    const g = grainLayer.getContext('2d')!
    g.fillStyle = g.createPattern(tile, 'repeat')!
    g.fillRect(0, 0, W, H)
  }
  c.drawImage(grainLayer, 0, 0)
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

export type FilmStyle = 'park' | 'zon' | 'vhs' | 'strak'
export const FILM_STYLES: { id: FilmStyle; name: string; blurb: string }[] = [
  { id: 'park', name: 'Park', blurb: 'Zwart en lime, stickers, flits bij elke cut' },
  { id: 'zon', name: 'Zon', blurb: 'Fel lime met een zon-sticker, wipe tussen de clips' },
  { id: 'vhs', name: 'VHS', blurb: 'Camcorder: REC, datum in de hoek, scanlines en glitch' },
  { id: 'strak', name: 'Strak', blurb: 'Zwarte balken, rustig, fade tussen de clips' },
]
export const isFilmStyle = (v: unknown): v is FilmStyle => FILM_STYLES.some((x) => x.id === v)

const SANS_FONT = '-apple-system, system-ui, sans-serif'

/** Scanlines over het hele beeld (VHS). */
function scanlines(c: CanvasRenderingContext2D, alpha = 0.14) {
  c.fillStyle = `rgba(0,0,0,${alpha})`
  for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 2)
}

/** Tekst met een rood/cyaan randje ernaast, zoals een oude videoband. */
function chroma(c: CanvasRenderingContext2D, text: string, x: number, y: number, color = WHITE) {
  c.globalAlpha = 0.55
  c.fillStyle = '#ff3355'
  c.fillText(text, x - 4, y)
  c.fillStyle = '#33e0ff'
  c.fillText(text, x + 4, y)
  c.globalAlpha = 1
  c.fillStyle = color
  c.fillText(text, x, y)
}

/** Kleine tekst in hoofdletters met een schaduw, voor op beeld. */
function stamp(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: CanvasTextAlign = 'left') {
  caps(c, size)
  c.textAlign = align
  c.textBaseline = 'alphabetic'
  c.fillStyle = 'rgba(0,0,0,0.6)'
  c.fillText(text, x + 2, y + 2)
  c.fillStyle = WHITE
  c.fillText(text, x, y)
  c.textAlign = 'left'
  resetSpacing(c)
}

/** VHS-glitch: stroken van het beeld schuiven even opzij. */
function glitch(c: CanvasRenderingContext2D, amount: number, seed: number) {
  if (amount <= 0) return
  const rng = seeded(`glitch:${seed}`)
  for (let i = 0; i < 9; i++) {
    const y = Math.floor(rng() * H)
    const h = 12 + Math.floor(rng() * 60)
    const dx = (rng() - 0.5) * 120 * amount
    c.drawImage(c.canvas, 0, y, c.canvas.width, h, dx, y, W, h)
  }
  c.fillStyle = `rgba(255,255,255,${0.12 * amount})`
  c.fillRect(0, 0, W, H)
}

function drawIntro(c: CanvasRenderingContext2D, seg: Extract<Segment, { kind: 'intro' }>, t: number, style: FilmStyle) {
  const title = seg.title.toUpperCase()
  c.textBaseline = 'alphabetic'
  if (style === 'vhs') {
    c.fillStyle = INK
    c.fillRect(0, 0, W, H)
    stamp(c, 'PLAY', 96, 120, 30)
    c.fillStyle = WHITE
    c.beginPath()
    c.moveTo(56, 96)
    c.lineTo(80, 108)
    c.lineTo(56, 120)
    c.closePath()
    c.fill()
    fitDisplay(c, title, 130, W - 112, 60)
    if (t > 0.08) chroma(c, title, 56, 560)
    resetSpacing(c)
    if (seg.sub) {
      c.font = `600 34px ${SANS_FONT}`
      chroma(c, seg.sub, 58, 620)
    }
    if (Math.floor(t * 6) % 2 === 0) stamp(c, 'REC', W - 56, 120, 30, 'right')
    scanlines(c)
    glitch(c, t < 0.12 ? 1 - t / 0.12 : 0, 1)
    return
  }
  if (style === 'strak') {
    c.fillStyle = INK
    c.fillRect(0, 0, W, H)
    c.globalAlpha = ease(t * 2.5)
    const size = fitDisplay(c, title, 120, W - 140, 56)
    c.fillStyle = WHITE
    c.textAlign = 'center'
    c.fillText(title, W / 2, H / 2)
    resetSpacing(c)
    c.fillStyle = LIME
    const lw = (W - 280) * ease((t - 0.15) * 3)
    c.fillRect(W / 2 - lw / 2, H / 2 + size * 0.35, lw, 4)
    if (seg.sub) {
      c.font = `500 30px ${SANS_FONT}`
      c.fillStyle = PAPER
      c.fillText(seg.sub, W / 2, H / 2 + size * 0.35 + 64)
    }
    c.textAlign = 'left'
    c.globalAlpha = 1
    return
  }
  const zon = style === 'zon'
  c.fillStyle = zon ? LIME : INK
  c.fillRect(0, 0, W, H)
  peaks(c, W - 560, H - 420 + 40 * (1 - ease(t * 2)), 640, zon ? 'rgba(13,13,15,0.1)' : 'rgba(245,245,239,0.07)')
  if (zon) {
    const r = 150 * slap(t * 1.8)
    burst(c, W - 170, 260, r, HOT, t * 1.2)
  }
  label(c, 'Trip-film', 56, 250, 26, zon ? INK : HOT, zon ? LIME : INK, -4, slap(t * 2.2))
  const size = fitDisplay(c, title, 150, W - 112, 64)
  c.fillStyle = zon ? INK : LIME
  const rise = 60 * (1 - ease((t - 0.08) * 3))
  c.globalAlpha = ease((t - 0.08) * 4)
  rotated(c, W / 2, 520, -2 * (1 - ease(t * 3)), () => c.fillText(title, 56, 520 + rise))
  c.globalAlpha = 1
  resetSpacing(c)
  if (seg.sub) {
    c.font = `600 34px ${SANS_FONT}`
    c.fillStyle = zon ? INK : PAPER
    c.globalAlpha = ease((t - 0.25) * 4)
    c.fillText(seg.sub, 58, 520 + size * 0.55)
    c.globalAlpha = 1
  }
  grain(c)
}

function drawClip(c: CanvasRenderingContext2D, seg: Extract<Segment, { kind: 'clip' }>, src: Source | null, t: number, style: FilmStyle) {
  c.fillStyle = INK
  c.fillRect(0, 0, W, H)
  if (src) coverSource(c, src, src instanceof HTMLImageElement ? 1 + 0.06 * t : 1)
  else {
    // clip niet te laden: een poster in plaats van een zwart gat
    c.fillStyle = LIME
    c.fillRect(0, 0, W, H)
    peaks(c, 60, H / 2 - 120, W - 120, 'rgba(13,13,15,0.12)')
  }

  if (style === 'vhs') {
    scanlines(c, 0.1)
    if (Math.floor(t * 6) % 2 === 0) {
      c.fillStyle = '#ff2b2b'
      c.beginPath()
      c.arc(66, 104, 12, 0, Math.PI * 2)
      c.fill()
    }
    stamp(c, 'REC', 90, 116, 30)
    stamp(c, seg.opener ? 'BESTE CLIP' : `${seg.index}/${seg.total}`, W - 56, 116, 26, 'right')
    stamp(c, seg.rider.toUpperCase(), 56, H - 150, 34)
    stamp(c, fmtDate(new Date(seg.media.createdAt).toISOString().slice(0, 10)).toUpperCase(), W - 56, H - 96, 28, 'right')
    glitch(c, t < 0.1 ? 1 - t / 0.1 : 0, seg.index)
    return
  }

  if (style === 'strak') {
    c.fillStyle = INK
    c.fillRect(0, 0, W, 130)
    c.fillRect(0, H - 170, W, 170)
    caps(c, 26)
    c.fillStyle = WHITE
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(seg.rider.toUpperCase(), W / 2, H - 92)
    caps(c, 18)
    c.fillStyle = PAPER
    c.fillText(seg.opener ? 'CLIP VAN DE TRIP' : `${seg.index} / ${seg.total}`, W / 2, 70)
    c.textAlign = 'left'
    resetSpacing(c)
    // fade vanuit zwart
    if (t < 0.15) {
      c.fillStyle = `rgba(13,13,15,${1 - ease(t / 0.15)})`
      c.fillRect(0, 0, W, H)
    }
    return
  }

  const zon = style === 'zon'
  // onderrand donkerder zodat de sticker leesbaar is
  const g = c.createLinearGradient(0, H - 420, 0, H)
  g.addColorStop(0, 'rgba(13,13,15,0)')
  g.addColorStop(1, 'rgba(13,13,15,0.55)')
  c.fillStyle = g
  c.fillRect(0, H - 420, W, 420)
  if (zon) {
    // lime lijst om het beeld
    c.strokeStyle = LIME
    c.lineWidth = 18
    c.strokeRect(9, 9, W - 18, H - 18)
  }
  label(c, seg.rider, 48, H - 210, 40, zon ? HOT : LIME, INK, seg.index % 2 ? -5 : 4, slap(t * 2.4))
  if (seg.opener) label(c, 'Clip van de trip', 48, 96, 30, zon ? INK : HOT, zon ? LIME : INK, -5, slap(t * 2))
  else {
    caps(c, 22)
    c.fillStyle = WHITE
    c.textBaseline = 'alphabetic'
    c.fillText(`${seg.index}/${seg.total}`, W - 110, 110)
    resetSpacing(c)
  }
  if (zon) {
    // lime wipe: een balk schuift weg naar rechts
    if (t < 0.14) {
      const x = W * ease(t / 0.14)
      c.fillStyle = LIME
      c.fillRect(x, 0, W - x, H)
    }
  } else if (t < 0.06) {
    // korte witte flits bij de overgang, als een camera-klik
    c.fillStyle = `rgba(255,255,255,${0.5 * (1 - t / 0.06)})`
    c.fillRect(0, 0, W, H)
  }
  grain(c)
}

function drawOutro(
  c: CanvasRenderingContext2D,
  seg: Extract<Segment, { kind: 'outro' }>,
  mascot: HTMLImageElement | null,
  t: number,
  style: FilmStyle,
) {
  const dark = style === 'vhs' || style === 'strak'
  const bg = style === 'zon' ? HOT : dark ? INK : LIME
  const fg = dark ? WHITE : INK
  c.fillStyle = bg
  c.fillRect(0, 0, W, H)
  if (!dark) peaks(c, -40, H - 360, 700, 'rgba(13,13,15,0.1)')
  c.textBaseline = 'alphabetic'
  if (style === 'strak') {
    caps(c, 26)
    c.fillStyle = PAPER
    c.textAlign = 'center'
    c.fillText('MET', W / 2, 380)
    resetSpacing(c)
    c.font = `600 46px ${SANS_FONT}`
    c.fillStyle = WHITE
    seg.riders.slice(0, 8).forEach((r, i) => {
      c.globalAlpha = ease((t - 0.1 - i * 0.06) * 4)
      c.fillText(r, W / 2, 470 + i * 70)
    })
    c.globalAlpha = 1
    c.textAlign = 'left'
  } else {
    c.fillStyle = fg
    display(c, 120)
    const rise = 50 * (1 - ease(t * 3))
    if (style === 'vhs') chroma(c, 'STOP', 56, 300 + rise)
    else c.fillText('MET', 56, 300 + rise)
    resetSpacing(c)
    seg.riders.slice(0, 8).forEach((r, i) => {
      const at = 0.12 + i * 0.07
      if (t < at) return
      if (style === 'vhs') stamp(c, r.toUpperCase(), 56, 400 + i * 80, 38)
      else
        label(
          c,
          r,
          56 + (i % 2) * 20,
          360 + i * 92,
          38,
          i % 3 === 1 ? (style === 'zon' ? LIME : HOT) : INK,
          i % 3 === 1 ? INK : style === 'zon' ? HOT : LIME,
          i % 2 ? 3 : -3,
          slap((t - at) * 3),
        )
    })
  }
  if (mascot) {
    const s = style === 'strak' ? 0.6 : slap((t - 0.3) * 2.5)
    if (t > 0.3)
      rotated(c, W - 170, H - 300, style === 'strak' ? 0 : -8, () =>
        c.drawImage(mascot, W - 170 - 130 * s, H - 300 - 130 * s, 260 * s, 260 * s),
      )
  }
  c.font = `800 26px ${DISPLAY}`
  c.fillStyle = fg
  c.fillText('SNEEUW DADDY', 56, H - 90)
  if (style === 'vhs') scanlines(c)
  else if (style !== 'strak') grain(c)
}

/** Een frame tekenen (los te gebruiken, ook voor de preview). */
export function drawFrame(
  c: CanvasRenderingContext2D,
  seg: Segment,
  t: number,
  assets: { src?: Source | null; mascot?: HTMLImageElement | null },
  style: FilmStyle = 'park',
) {
  if (seg.kind === 'intro') drawIntro(c, seg, t, style)
  else if (seg.kind === 'clip') drawClip(c, seg, assets.src ?? null, t, style)
  else drawOutro(c, seg, assets.mascot ?? null, t, style)
}

// ── Opnemen ─────────────────────────────────────────────────────────────────

/** Wanneer elk stuk begint (seconden vanaf het begin van de film). */
export function timeline(plan: FilmPlan): number[] {
  let at = 0
  return plan.segments.map((s) => {
    const start = at
    at += s.dur
    return start
  })
}

/** Vanaf waar in een clip we beginnen: iets na het begin (de eerste tel is vaak schudden), niet voorbij het eind. */
export const clipStart = (clipDuration: number, dur: number) => Math.max(0, Math.min(0.4, (clipDuration || 0) - dur))

function loadVideo(url: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
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

export interface Loaded {
  src: Source | null
  audio: AudioBuffer | null
  url?: string
}

/** Clip ophalen als bestand: één keer downloaden voor beeld én geluid (en geen cross-origin gedoe op het canvas). */
export async function loadClip(m: MediaMeta, ctx: BaseAudioContext | null): Promise<Loaded> {
  const thumb = async (): Promise<Loaded> => ({ src: m.thumb ? await loadImg(m.thumb) : null, audio: null })
  const remote = await mediaUrl(m).catch(() => null)
  if (!remote) return thumb()
  const blob = await fetch(remote)
    .then((r) => (r.ok ? r.blob() : null))
    .catch(() => null)
  if (!blob) return thumb()
  const url = URL.createObjectURL(blob)
  if (m.type !== 'video') return { src: await loadImg(url), audio: null, url }
  const [video, audio] = await Promise.all([
    loadVideo(url),
    ctx
      ? blob
          .arrayBuffer()
          .then((b) => ctx.decodeAudioData(b))
          .catch(() => null)
      : Promise.resolve(null),
  ])
  return { src: video ?? (await thumb()).src, audio, url }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface FilmOptions {
  canvas?: HTMLCanvasElement
  onProgress?: (p: { phase: 'laden' | 'opnemen'; done: number }) => void
  signal?: AbortSignal
  /** muziek eronder ('geen' of weglaten = zonder) */
  music?: TrackId
  /** geluid van de clips zelf erin */
  clipAudio?: boolean
  /** AudioContext, aangemaakt bij de tik (iOS start geluid alleen na een tik). Zonder: een film zonder geluid. */
  audio?: AudioContext | null
  /** meeluisteren terwijl hij gemaakt wordt */
  listen?: boolean
  /** cover voor in je kluis: een klein plaatje van de intro-poster */
  onThumb?: (dataUrl: string) => void
  /** look van de film */
  style?: FilmStyle
  /** false: altijd in echte tijd opnemen (anders eerst de snelle manier, als de browser die kan) */
  fast?: boolean
}

/**
 * De film maken: alles laden, dan in echte tijd tekenen en opnemen, met geluid. Beeld en geluid lopen op dezelfde
 * klok (die van de AudioContext), zodat ze gelijk blijven ook als een clip traag start.
 */
export async function renderFilm(plan: FilmPlan, opts: FilmOptions = {}): Promise<Blob> {
  const track = opts.music && opts.music !== 'geen' ? TRACK_BY_ID.get(opts.music) : undefined
  // eerst sneller dan in echte tijd (WebCodecs); kan de browser dat niet of gaat het mis, dan zoals altijd
  if (opts.fast !== false && fastSupported()) {
    try {
      const fast = await import('./filmFast')
      const codecs = await fast.pickCodecs(!!track || !!opts.clipAudio)
      if (codecs) return await fast.renderFilmFast(plan, opts, codecs)
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      console.warn('snelle film lukte niet, nu in echte tijd', e)
    }
  }
  let ctx = opts.audio ?? null
  if (ctx && ctx.state !== 'running') await ctx.resume().catch(() => {})
  if (ctx && ctx.state !== 'running') ctx = null // geen geluid mogelijk: dan maar stil
  const wantAudio = !!ctx && (!!track || !!opts.clipAudio)
  const mime = pickVideoMime(undefined, wantAudio)
  if (mime === null || !canMakeFilm()) throw new Error('Deze browser kan geen film maken.')
  await fontsReady()
  const canvas = opts.canvas ?? document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const abort = () => {
    if (opts.signal?.aborted) throw new DOMException('afgebroken', 'AbortError')
  }

  const segs = plan.segments
  const starts = timeline(plan)
  const loaded = new Map<string, Loaded>()
  let n = 0
  const clips = segs.filter((s): s is Extract<Segment, { kind: 'clip' }> => s.kind === 'clip')
  for (const s of clips) {
    abort()
    loaded.set(s.media.id, await loadClip(s.media, opts.clipAudio ? ctx : null))
    opts.onProgress?.({ phase: 'laden', done: ++n / Math.max(1, clips.length) })
  }
  const mascot = await mascotImg(300)
  // alle video's alvast op hun beginpunt, zodat een cut meteen beeld heeft
  for (const s of clips) {
    const v = loaded.get(s.media.id)?.src
    if (v instanceof HTMLVideoElement) {
      v.currentTime = clipStart(v.duration, s.dur)
      await Promise.race([new Promise((r) => (v.onseeked = r)), sleep(1500)])
    }
  }
  abort()

  const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(FILM.fps)
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()]
  let master: GainNode | null = null
  if (ctx && wantAudio) {
    const dest = ctx.createMediaStreamDestination()
    master = ctx.createGain()
    master.gain.value = 0.6
    // limiter: muziek plus clipgeluid mag nooit oversturen
    const limit = ctx.createDynamicsCompressor()
    limit.threshold.value = -6
    limit.knee.value = 4
    limit.ratio.value = 12
    limit.attack.value = 0.003
    limit.release.value = 0.15
    master.connect(limit)
    limit.connect(dest)
    if (opts.listen !== false) limit.connect(ctx.destination)
    tracks.push(...dest.stream.getAudioTracks())
  }
  const stream = new MediaStream(tracks)
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()))
  drawFrame(c, segs[0], 0, {}, opts.style)
  rec.start(500)

  // geluid inplannen op de klok van de AudioContext
  const lead = 0.15
  const audioStart = ctx ? ctx.currentTime + lead : 0
  if (ctx && master) {
    const music = track ? scheduleMusic(ctx, master, track, audioStart, plan.total) : null
    segs.forEach((seg, i) => {
      if (seg.kind !== 'clip') return
      const l = loaded.get(seg.media.id)
      if (!l?.audio || !(l.src instanceof HTMLVideoElement)) return
      const at = audioStart + starts[i]
      const src = ctx!.createBufferSource()
      src.buffer = l.audio
      const g = ctx!.createGain()
      g.gain.setValueAtTime(0.0001, at)
      g.gain.linearRampToValueAtTime(1, at + 0.06)
      g.gain.setValueAtTime(1, at + seg.dur - 0.08)
      g.gain.linearRampToValueAtTime(0.0001, at + seg.dur)
      src.connect(g)
      g.connect(master!)
      src.start(at, clipStart(l.src.duration, seg.dur), seg.dur)
      // muziek zachter onder het geluid van de clip
      if (music) {
        music.gain.setValueAtTime(1, at)
        music.gain.linearRampToValueAtTime(0.35, at + 0.12)
        music.gain.setValueAtTime(0.35, at + seg.dur - 0.12)
        music.gain.linearRampToValueAtTime(1, at + seg.dur)
      }
    })
  }
  const t0 = performance.now() + lead * 1000
  const clock = () => (ctx ? ctx.currentTime - audioStart : (performance.now() - t0) / 1000)

  let current = -1
  let thumbed = false
  try {
    for (;;) {
      abort()
      const t = clock()
      if (t >= plan.total) break
      let i = 0
      while (i < segs.length - 1 && t >= starts[i + 1]) i++
      if (i !== current) {
        const prev = segs[current]
        const pv = prev?.kind === 'clip' ? loaded.get(prev.media.id)?.src : null
        if (pv instanceof HTMLVideoElement) pv.pause()
        const seg = segs[i]
        const v = seg.kind === 'clip' ? loaded.get(seg.media.id)?.src : null
        if (v instanceof HTMLVideoElement) void v.play().catch(() => {})
        current = i
      }
      const seg = segs[i]
      const src = seg.kind === 'clip' ? (loaded.get(seg.media.id)?.src ?? null) : null
      drawFrame(c, seg, Math.max(0, t - starts[i]) / seg.dur, { src, mascot }, opts.style)
      // cover: de intro als de titel er staat
      if (!thumbed && i === 0 && t - starts[0] >= seg.dur * 0.6 && opts.onThumb) {
        thumbed = true
        opts.onThumb(thumbOf(canvas))
      }
      opts.onProgress?.({ phase: 'opnemen', done: Math.min(1, Math.max(0, t) / plan.total) })
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
    // laatste stukje geluid (fade-out) nog meenemen
    await sleep(150)
  } finally {
    rec.stop()
    stream.getTracks().forEach((tr) => tr.stop())
    canvasStream.getTracks().forEach((tr) => tr.stop())
    master?.disconnect()
    for (const l of loaded.values()) {
      if (l.src instanceof HTMLVideoElement) {
        l.src.pause()
        l.src.removeAttribute('src')
        l.src.remove()
      }
      if (l.url) URL.revokeObjectURL(l.url)
    }
  }
  await stopped
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0]
  return new Blob(chunks, { type })
}

/** Stil of gestopt? Een film van een paar KB is mislukt. */
export const looksEmpty = (b: Blob) => b.size < 10_000

/** Een stukje van een track laten horen (4 maten), naar de speakers. Geeft een stop-functie terug. */
export function previewMusic(ctx: AudioContext, id: TrackId): () => void {
  const track = TRACK_BY_ID.get(id)
  if (!track) return () => {}
  const out = ctx.createGain()
  out.connect(ctx.destination)
  void ctx.resume().catch(() => {})
  const len = (60 / track.bpm) * 16
  scheduleMusic(ctx, out, track, ctx.currentTime + 0.05, len)
  return () => {
    out.gain.setValueAtTime(out.gain.value, ctx.currentTime)
    out.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.08)
    setTimeout(() => out.disconnect(), 150)
  }
}

/** Klein plaatje van wat er nu op het canvas staat (180 breed), voor lijsten. */
export function thumbOf(canvas: HTMLCanvasElement): string {
  const t = document.createElement('canvas')
  t.width = 180
  t.height = Math.round((180 * canvas.height) / canvas.width)
  t.getContext('2d')?.drawImage(canvas, 0, 0, t.width, t.height)
  return t.toDataURL('image/jpeg', 0.75)
}

/** Film bewaren in je kluis: als video bij jou (niet gedeeld met de crew), met de trip erbij. */
export async function saveFilm(blob: Blob, trip: FilmTrip & { id: string }, thumb?: string): Promise<MediaMeta> {
  if (blob.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`De film is groter dan ${MAX_VIDEO_MB} MB. Kies minder clips.`)
  const id = uid()
  await db.blobs.put({ id, blob })
  return create('media', {
    id,
    type: 'video',
    mime: blob.type || 'video/mp4',
    size: blob.size,
    thumb,
    width: FILM.w,
    height: FILM.h,
    crewId: null,
    caption: `Trip-film ${trip.name || trip.resortName || ''}`.trim(),
    tripFilm: { tripId: trip.id, title: trip.name || trip.resortName || 'Trip-film' },
  })
}

/** Je bewaarde trip-films, nieuwste eerst (van één trip, of allemaal). */
export async function savedFilms(tripId?: string): Promise<MediaMeta[]> {
  const all = (await db.records.where('kind').equals('media').toArray()) as MediaMeta[]
  return all.filter((m) => !m.deleted && m.tripFilm && (!tripId || m.tripFilm.tripId === tripId)).sort((a, b) => b.createdAt - a.createdAt)
}

/** Kan deze browser een film sneller dan in echte tijd maken (WebCodecs en offline audio)? */
export function fastSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof OfflineAudioContext !== 'undefined'
}
