// Story-kaart (1080×1920) van een dag, in de huisstijl. Delen via het iOS-deelmenu
// (opslaan in Foto's, Instagram, WhatsApp) of downloaden als dat niet kan.
import { iconPath, MOOD_LABELS, type IconName } from '../design/icons'
import { TRICK_BY_ID } from '../content/tricks'
import { fmtDate } from './format'
import { db } from './db'
import type { MediaMeta, Session } from './types'
import { mediaUrl } from './sync'

const W = 1080
const H = 1920
const INK = '#0b0d0a'
const PAPER = '#ecefe6'
const MUTED = '#8b9483'
const ACCENT = '#9be564'

function drawIcon(c: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string) {
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
    c.lineWidth = 1.8
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

export async function renderShareCard(s: Session): Promise<Blob> {
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const sans = '"Space Grotesk Variable", system-ui, sans-serif'
  const mono = '"JetBrains Mono Variable", ui-monospace, monospace'

  c.fillStyle = INK
  c.fillRect(0, 0, W, H)
  // puntraster
  c.fillStyle = 'rgba(236,239,230,0.07)'
  for (let x = 30; x < W; x += 44) for (let y = 30; y < H; y += 44) c.fillRect(x, y, 3, 3)

  const photo = await coverPhoto(s)
  const top = 150
  const ph = photo ? 860 : 0
  if (photo) {
    c.save()
    c.beginPath()
    c.roundRect(60, top, W - 120, ph, 36)
    c.clip()
    cover(c, photo, 60, top, W - 120, ph)
    c.restore()
  }

  // header
  c.fillStyle = MUTED
  c.font = `500 30px ${mono}`
  c.fillText('SNEEUW DADDY / LOGBOEK', 60, 100)
  drawIcon(c, 'snowflake', W - 110, 62, 50, ACCENT)

  let y = top + ph + (photo ? 110 : 260)
  c.fillStyle = MUTED
  c.font = `500 32px ${mono}`
  c.fillText(fmtDate(s.date, true).toUpperCase(), 60, y)
  y += 100
  c.fillStyle = PAPER
  c.font = `600 96px ${sans}`
  const title = s.resortName || 'Dag op de plank'
  c.fillText(title.length > 18 ? title.slice(0, 17) + '…' : title, 56, y)

  if (s.highlight) {
    y += 70
    c.fillStyle = ACCENT
    c.font = `500 40px ${sans}`
    c.fillText(`“${s.highlight.slice(0, 40)}${s.highlight.length > 40 ? '…' : ''}”`, 60, y)
  }

  // stats
  y += 90
  const stats: [string, string][] = [
    ['UREN', String(s.hours)],
    ['GEVALLEN', String(s.falls)],
    ['GELAND', String(s.landed.length)],
  ]
  const colW = (W - 120) / 3
  stats.forEach(([label, value], i) => {
    const x = 60 + i * colW
    c.strokeStyle = 'rgba(236,239,230,0.18)'
    c.lineWidth = 2
    c.beginPath()
    c.roundRect(x + (i ? 10 : 0), y, colW - 10, 200, 28)
    c.stroke()
    c.fillStyle = MUTED
    c.font = `500 26px ${mono}`
    c.fillText(label, x + 34, y + 60)
    c.fillStyle = PAPER
    c.font = `600 88px ${mono}`
    c.fillText(value, x + 30, y + 160)
  })
  y += 270

  // mood
  drawIcon(c, `mood${Math.max(1, Math.min(5, s.mood))}` as IconName, 60, y - 50, 70, ACCENT)
  c.fillStyle = PAPER
  c.font = `500 44px ${sans}`
  c.fillText(MOOD_LABELS[s.mood - 1] ?? '', 150, y)

  // gelande tricks
  if (s.landed.length) {
    y += 80
    c.fillStyle = MUTED
    c.font = `500 26px ${mono}`
    c.fillText('GELAND VANDAAG', 60, y)
    y += 30
    let x = 60
    c.font = `600 34px ${sans}`
    for (const id of s.landed.slice(0, 6)) {
      const name = TRICK_BY_ID.get(id)?.name ?? id
      const w = c.measureText(name).width + 56
      if (x + w > W - 60) {
        x = 60
        y += 80
      }
      c.fillStyle = ACCENT
      c.beginPath()
      c.roundRect(x, y, w, 64, 32)
      c.fill()
      c.fillStyle = INK
      c.fillText(name, x + 28, y + 44)
      x += w + 14
    }
  }

  c.fillStyle = MUTED
  c.font = `500 26px ${mono}`
  c.fillText('#SNEEUWDADDY', 60, H - 80)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'))
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

/** Tekst over meerdere regels binnen een breedte. Geeft de y van de volgende regel terug. */
function wrapText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 6) {
  const words = text.split(/\s+/)
  let line = ''
  let lines = 0
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (c.measureText(next).width > maxW && line) {
      c.fillText(line, x, y)
      y += lineH
      line = w
      if (++lines >= maxLines - 1) break
    } else line = next
  }
  if (line) {
    c.fillText(line, x, y)
    y += lineH
  }
  return y
}

/** Grootste lettergrootte (tot max) waarbij de tekst op één regel past. */
function fitFont(c: CanvasRenderingContext2D, text: string, family: string, weight: number, max: number, maxW: number) {
  let size = max
  for (; size > 60; size -= 8) {
    c.font = `${weight} ${size}px ${family}`
    if (c.measureText(text).width <= maxW) break
  }
  return size
}

/** Story-kaart (1080×1920) van één Wrapped-kaart. */
export async function renderWrappedCard(
  card: { icon: IconName; big: string; title: string; body: string },
  season: string,
  index: number,
  total: number,
): Promise<Blob> {
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const c = canvas.getContext('2d')!
  const sans = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
  const display = '"Archivo Variable", -apple-system, system-ui, sans-serif'
  // om en om donker en accent, zoals in de app
  const onAccent = index % 2 === 1
  const bg = onAccent ? ACCENT : INK
  const fg = onAccent ? INK : PAPER
  const soft = onAccent ? 'rgba(11,13,10,0.62)' : MUTED

  c.fillStyle = bg
  c.fillRect(0, 0, W, H)

  // voortgang bovenaan, zoals in de app
  const gap = 10
  const seg = (W - 120 - gap * (total - 1)) / total
  for (let i = 0; i < total; i++) {
    c.fillStyle = i <= index ? fg : onAccent ? 'rgba(11,13,10,0.18)' : 'rgba(236,239,230,0.18)'
    c.fillRect(60 + i * (seg + gap), 80, seg, 8)
  }

  c.fillStyle = soft
  c.font = `600 40px ${sans}`
  c.fillText(`Season Wrapped ${season}`, 60, 190)

  drawIcon(c, card.icon, 60, 620, 96, fg)
  c.fillStyle = fg
  const size = fitFont(c, card.big, display, 800, 300, W - 120)
  c.font = `800 ${size}px ${display}`
  c.fillText(card.big, 52, 760 + size * 0.8)
  let y = 760 + size * 0.8 + 110
  c.font = `700 72px ${sans}`
  y = wrapText(c, card.title, 60, y, W - 120, 84, 2)
  y += 30
  c.fillStyle = soft
  c.font = `500 48px ${sans}`
  wrapText(c, card.body, 60, y, W - 120, 64, 6)

  c.fillStyle = soft
  c.font = `600 34px ${sans}`
  c.fillText('Sneeuw Daddy', 60, H - 90)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'))
}
