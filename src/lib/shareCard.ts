// Story-kaarten (1080×1920) in park-stijl: een dag, en de Season Wrapped-kaarten. Delen via het iOS-deelmenu
// (opslaan in Foto's, Instagram, WhatsApp) of downloaden als dat niet kan.
// De kleuren staan hier vast: het is een plaatje dat je deelt, net als de stickers (artwork), en het moet er in
// licht en donker hetzelfde uitzien.
import { iconPath, MOOD_LABELS, type IconName } from '../design/icons'
import { stickerSvg } from '../design/Stickers'
import { TRICK_BY_ID } from '../content/tricks'
import { fmtDate } from './format'
import { db } from './db'
import type { MediaMeta, Session } from './types'
import { mediaUrl } from './sync'

const W = 1080
const H = 1920
const INK = '#0d0d0f'
const PAPER = '#f5f5ef'
const MUTED = '#9d9d97'
const SURFACE = '#18181b'
const LINE = '#2e2e33'
const LIME = '#d7ff3c'
const HOT = '#ff5b22'
const WHITE = '#ffffff'
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
const DISPLAY = '"Archivo Variable", -apple-system, system-ui, sans-serif'

// ── Inhoud (puur, getest) ────────────────────────────────────────────────────

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t)
const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/** Wat er op de dagkaart staat. */
export function dayCardContent(s: Session) {
  const mood = Math.max(1, Math.min(5, Math.round(s.mood || 3)))
  const landed = s.landed ?? []
  return {
    date: fmtDate(s.date, true),
    title: s.resortName || 'Dag op de plank',
    highlight: s.highlight ? clip(s.highlight, 90) : '',
    stats: [
      { label: 'uur', value: fmtNum(s.hours || 0), hot: false },
      { label: landed.length === 1 ? 'trick' : 'tricks', value: String(landed.length), hot: false },
      { label: 'slams', value: String(s.falls || 0), hot: true },
    ],
    mood,
    moodLabel: MOOD_LABELS[mood - 1],
    tricks: landed.slice(0, 6).map((id) => TRICK_BY_ID.get(id)?.name ?? id),
    moreTricks: Math.max(0, landed.length - 6),
  }
}

/** Kleuren van een Wrapped-kaart: om en om zwart en lime, zoals een stapel posters. */
export function wrappedColors(index: number) {
  const lime = index % 2 === 1
  return lime
    ? { bg: LIME, fg: INK, soft: 'rgba(13,13,15,0.62)', track: 'rgba(13,13,15,0.18)', sticker: HOT }
    : { bg: INK, fg: PAPER, soft: MUTED, track: 'rgba(245,245,239,0.18)', sticker: LIME }
}

// ── Tekenen ──────────────────────────────────────────────────────────────────

function drawIcon(c: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string, width = 1.8) {
  const { d, solid } = iconPath(name)
  c.save()
  c.translate(x, y)
  c.scale(size / 24, size / 24)
  const p = new Path2D(d)
  if (solid) {
    c.fillStyle = color
    c.fill(p)
  } else {
    c.strokeStyle = color
    c.lineWidth = width
    c.lineCap = 'square'
    c.lineJoin = 'miter'
    c.stroke(p)
  }
  c.restore()
}

async function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Een sticker (stemming of reactie) als plaatje voor op het canvas. */
function stickerImg(art: number | string, size: number) {
  return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(stickerSvg(art, size)))
}

async function coverPhoto(s: Session): Promise<HTMLImageElement | null> {
  for (const id of s.mediaIds) {
    const m = (await db.records.get(id)) as MediaMeta | undefined
    if (!m || m.deleted) continue
    if (m.type === 'image') {
      const url = await mediaUrl(m)
      if (url) return loadImg(url)
    } else if (m.thumb) return loadImg(m.thumb)
  }
  return null
}

function cover(c: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.max(w / img.width, h / img.height)
  const iw = img.width * r
  const ih = img.height * r
  c.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
}

/** Smal en zwaar, zoals de titels in de app. Smal via het font-shorthand (`condensed`), plus fontStretch waar de browser dat kent. */
function display(c: CanvasRenderingContext2D, size: number) {
  c.font = `condensed 800 ${size}px ${DISPLAY}`
  const cc = c as CanvasRenderingContext2D & { fontStretch?: string }
  if ('fontStretch' in cc) cc.fontStretch = 'condensed'
}

function caps(c: CanvasRenderingContext2D, size: number) {
  c.font = `800 ${size}px ${SANS}`
  const cc = c as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in cc) cc.letterSpacing = `${Math.round(size * 0.1)}px`
}
function resetSpacing(c: CanvasRenderingContext2D) {
  const cc = c as CanvasRenderingContext2D & { letterSpacing?: string; fontStretch?: string }
  if ('letterSpacing' in cc) cc.letterSpacing = '0px'
  if ('fontStretch' in cc) cc.fontStretch = 'normal'
}

/** Korrel over het hele vlak, als gedrukt papier. */
function grain(c: CanvasRenderingContext2D, alpha = 0.07) {
  const tile = document.createElement('canvas')
  tile.width = tile.height = 160
  const t = tile.getContext('2d')!
  const img = t.createImageData(160, 160)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255 * alpha
  }
  t.putImageData(img, 0, 0)
  c.fillStyle = c.createPattern(tile, 'repeat')!
  c.fillRect(0, 0, W, H)
}

/** Bergvorm (twee toppen) in een kleur. */
function peaks(c: CanvasRenderingContext2D, x: number, y: number, w: number, color: string) {
  const s = w / 190
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  c.fillStyle = color
  c.fill(new Path2D('M0 120 L50 40 L75 70 L115 10 L190 120Z'))
  c.restore()
}

/** Ster-sticker met witte rand, gekanteld; tekst in het midden. */
function burst(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, tilt: number) {
  const path = () => {
    c.beginPath()
    for (let i = 0; i < 24; i++) {
      const rr = i % 2 ? r * 0.78 : r
      const a = (i * Math.PI) / 12 + tilt
      c[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a))
    }
    c.closePath()
  }
  path()
  c.lineJoin = 'round'
  c.lineWidth = 16
  c.strokeStyle = WHITE
  c.stroke()
  c.fillStyle = fill
  c.fill()
}

function rotated(c: CanvasRenderingContext2D, cx: number, cy: number, deg: number, draw: () => void) {
  c.save()
  c.translate(cx, cy)
  c.rotate((deg * Math.PI) / 180)
  c.translate(-cx, -cy)
  draw()
  c.restore()
}

/** Grootste lettergrootte (tot max) waarbij de tekst op één regel past. */
function fitDisplay(c: CanvasRenderingContext2D, text: string, max: number, maxW: number, min = 60) {
  let size = max
  for (; size > min; size -= 6) {
    display(c, size)
    if (c.measureText(text).width <= maxW) break
  }
  return size
}

/** Tekst over meerdere regels binnen een breedte. Geeft de y van de volgende regel terug. */
function wrapText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 6) {
  const words = text.split(/\s+/)
  let line = ''
  let lines = 0
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (c.measureText(next).width <= maxW || !line) {
      line = next
      continue
    }
    if (++lines >= maxLines) {
      // laatste regel vol: afkappen met …
      while (line && c.measureText(line + '…').width > maxW) line = line.split(' ').slice(0, -1).join(' ')
      c.fillText(line + '…', x, y)
      return y + lineH
    }
    c.fillText(line, x, y)
    y += lineH
    line = words[i]
  }
  if (line) {
    c.fillText(line, x, y)
    y += lineH
  }
  return y
}

/** Archivo staat niet altijd al geladen (canvas laadt geen fonts zelf): vooraf ophalen, smal en zwaar. */
async function fontsReady() {
  await Promise.all([
    document.fonts.load(`condensed 800 100px ${DISPLAY}`).catch(() => []),
    document.fonts.load(`800 100px ${DISPLAY}`).catch(() => []),
  ])
  await document.fonts.ready
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'))
}

/** Story-kaart van een dag: foto als sticker met tape, resort groot, cijfers in blokken, je stemming als sticker. */
export async function renderShareCard(s: Session): Promise<Blob> {
  await fontsReady()
  const k = dayCardContent(s)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const [photo, mood, mascot] = await Promise.all([coverPhoto(s), stickerImg(k.mood, 260), stickerImg(5, 150)])

  c.fillStyle = INK
  c.fillRect(0, 0, W, H)

  // kop: merk links, datum rechts
  caps(c, 28)
  c.fillStyle = MUTED
  c.fillText('SNEEUW DADDY', 70, 110)
  c.fillStyle = LIME
  const date = k.date.toUpperCase()
  c.fillText(date, W - 70 - c.measureText(date).width, 110)
  resetSpacing(c)

  // beeld: je foto als sticker met witte rand en tape, of een lime poster met bergen
  const bx = 80
  const by = 170
  const bw = W - 160
  const bh = photo ? 700 : 560
  rotated(c, bx + bw / 2, by + bh / 2, photo ? -2 : 0, () => {
    if (photo) {
      c.fillStyle = WHITE
      c.beginPath()
      c.roundRect(bx - 18, by - 18, bw + 36, bh + 36, 14)
      c.fill()
      c.save()
      c.beginPath()
      c.roundRect(bx, by, bw, bh, 8)
      c.clip()
      cover(c, photo, bx, by, bw, bh)
      c.restore()
    } else {
      c.fillStyle = LIME
      c.beginPath()
      c.roundRect(bx, by, bw, bh, 12)
      c.fill()
      peaks(c, bx + bw - 560, by + bh - 354, 560, 'rgba(13,13,15,0.9)')
      display(c, 64)
      c.fillStyle = INK
      c.fillText('DAG OP DE PLANK', bx + 44, by + 100)
      resetSpacing(c)
    }
  })
  // tape over de bovenrand
  rotated(c, bx + 150, by - 10, -6, () => {
    c.fillStyle = photo ? 'rgba(215,255,60,0.88)' : 'rgba(255,255,255,0.6)'
    c.fillRect(bx + 60, by - 34, 190, 50)
  })

  // je stemming als sticker op de hoek van het beeld geklapt, met een stempel eronder
  if (mood) rotated(c, bx + bw - 90, by + bh - 70, -10, () => c.drawImage(mood, bx + bw - 220, by + bh - 200, 260, 260))
  rotated(c, bx + bw - 90, by + bh + 80, 6, () => {
    caps(c, 34)
    const label = k.moodLabel.toUpperCase()
    const w = c.measureText(label).width + 44
    c.fillStyle = HOT
    c.fillRect(bx + bw - 60 - w, by + bh + 46, w, 66)
    c.fillStyle = INK
    c.fillText(label, bx + bw - 60 - w + 24, by + bh + 92)
    resetSpacing(c)
  })

  // titel: het resort, zo groot als past
  let y = by + bh + 230
  const title = k.title.toUpperCase()
  const size = fitDisplay(c, title, 190, W - 140)
  c.fillStyle = PAPER
  c.fillText(title, 66, y)
  resetSpacing(c)
  y += Math.max(40, size * 0.18)

  if (k.highlight) {
    c.fillStyle = LIME
    c.font = `600 44px ${SANS}`
    y = wrapText(c, `“${k.highlight}”`, 70, y + 40, W - 140, 56, 3) - 10
  }

  // cijfers in blokken, slams in oranje en een tikje scheef
  y += 40
  const gap = 18
  const cw = (W - 140 - gap * 2) / 3
  k.stats.forEach((st, i) => {
    const x = 70 + i * (cw + gap)
    rotated(c, x + cw / 2, y + 105, st.hot ? -2.5 : 0, () => {
      c.fillStyle = st.hot ? HOT : SURFACE
      c.beginPath()
      c.roundRect(x, y, cw, 210, 12)
      c.fill()
      if (!st.hot) {
        c.strokeStyle = LINE
        c.lineWidth = 3
        c.stroke()
      }
      display(c, 130)
      c.fillStyle = st.hot ? INK : PAPER
      c.fillText(st.value, x + 30, y + 138)
      resetSpacing(c)
      caps(c, 26)
      c.fillStyle = st.hot ? 'rgba(13,13,15,0.7)' : MUTED
      c.fillText(st.label.toUpperCase(), x + 32, y + 184)
      resetSpacing(c)
    })
  })
  y += 210 + 90

  // gelande tricks als lime labels
  if (k.tricks.length && y < H - 260) {
    caps(c, 26)
    c.fillStyle = MUTED
    c.fillText('GELAND', 70, y)
    const tw = c.measureText('GELAND').width
    resetSpacing(c)
    c.fillStyle = PAPER
    c.fillRect(70 + tw + 24, y - 10, W - 140 - tw - 24, 3)
    y += 30
    let x = 70
    c.font = `700 38px ${SANS}`
    const chips = [...k.tricks, ...(k.moreTricks ? [`+${k.moreTricks}`] : [])]
    for (const name of chips) {
      const w = c.measureText(name).width + 52
      if (x + w > W - 70) {
        x = 70
        y += 86
      }
      if (y > H - 240) break
      c.fillStyle = LIME
      c.beginPath()
      c.roundRect(x, y, w, 70, 8)
      c.fill()
      c.fillStyle = INK
      c.fillText(name, x + 26, y + 48)
      x += w + 14
    }
  }

  // voet: hashtag en de mascotte
  caps(c, 28)
  c.fillStyle = MUTED
  c.fillText('#SNEEUWDADDY', 70, H - 90)
  resetSpacing(c)
  if (mascot) rotated(c, W - 150, H - 140, 12, () => c.drawImage(mascot, W - 225, H - 215, 150, 150))

  grain(c)
  return toPng(canvas)
}

export async function shareSession(s: Session) {
  await shareImage(await renderShareCard(s), `sneeuw-daddy-${s.date}.png`, s.resortName)
}

/** Deelt een afbeelding via het iOS-deelmenu, of downloadt hem als dat niet kan. */
export async function shareImage(blob: Blob, name: string, title?: string) {
  const file = new File([blob], name, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ── Season Wrapped ───────────────────────────────────────────────────────────

/** Story-kaart (1080×1920) van één Wrapped-kaart: een poster, om en om zwart en lime. */
export async function renderWrappedCard(
  card: { icon: IconName; big: string; title: string; body: string },
  season: string,
  index: number,
  total: number,
): Promise<Blob> {
  await fontsReady()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const col = wrappedColors(index)
  const mascot = await stickerImg(5, 170)

  c.fillStyle = col.bg
  c.fillRect(0, 0, W, H)
  peaks(c, W - 760, H - 640, 860, col.fg === INK ? 'rgba(13,13,15,0.1)' : 'rgba(245,245,239,0.07)')

  // voortgang in blokken bovenaan
  const gap = 10
  const seg = (W - 140 - gap * (total - 1)) / total
  for (let i = 0; i < total; i++) {
    c.fillStyle = i <= index ? col.fg : col.track
    c.fillRect(70 + i * (seg + gap), 80, seg, 14)
  }

  caps(c, 30)
  c.fillStyle = col.soft
  c.fillText(`SEASON WRAPPED ${season}`, 70, 190)
  resetSpacing(c)

  // icoon op een sticker
  rotated(c, 190, 520, -10, () => {
    burst(c, 190, 520, 120, col.sticker, 0.2)
    drawIcon(c, card.icon, 190 - 60, 520 - 60, 120, INK, 2.2)
  })

  c.fillStyle = col.fg
  const size = fitDisplay(c, card.big.toUpperCase(), 330, W - 140)
  let y = 760 + size * 0.8
  c.fillText(card.big.toUpperCase(), 64, y)
  resetSpacing(c)
  y += 110
  display(c, 76)
  y = wrapText(c, card.title.toUpperCase(), 70, y, W - 140, 80, 2)
  resetSpacing(c)
  y += 30
  c.fillStyle = col.soft
  c.font = `500 48px ${SANS}`
  wrapText(c, card.body, 70, y, W - 140, 64, 6)

  caps(c, 30)
  c.fillStyle = col.soft
  c.fillText('SNEEUW DADDY', 70, H - 100)
  resetSpacing(c)
  if (mascot) rotated(c, W - 160, H - 160, 12, () => c.drawImage(mascot, W - 245, H - 245, 170, 170))

  grain(c, col.bg === INK ? 0.07 : 0.06)
  return toPng(canvas)
}
