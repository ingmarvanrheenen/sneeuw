// Tekenen op je clip: lijnen, pijlen, hoeken en vrije lijnen op een frame. Punten in pixels van het beeld zelf
// (niet van het scherm), zodat de tekening klopt op elk formaat en in de export.

export type Pt = { x: number; y: number }

/** Lijnkleuren: fel op elk beeld, in licht en donker hetzelfde (artwork, zoals de deelkaarten). */
export const INKS = [
  { id: 'lime', name: 'Lime', hex: '#d7ff3c' },
  { id: 'oranje', name: 'Oranje', hex: '#ff5b22' },
  { id: 'wit', name: 'Wit', hex: '#ffffff' },
] as const
export type Tool = 'lijn' | 'pijl' | 'hoek' | 'vrij'
export type Shape =
  | { kind: 'lijn'; a: Pt; b: Pt; color: string }
  | { kind: 'pijl'; a: Pt; b: Pt; color: string }
  | { kind: 'hoek'; a: Pt; b: Pt; c: Pt; color: string }
  | { kind: 'vrij'; pts: Pt[]; color: string }

export const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'lijn', label: 'Lijn', hint: 'Sleep een lijn, bijv. langs je board of je schouders' },
  { id: 'pijl', label: 'Pijl', hint: 'Sleep een pijl: waar moet je gewicht of je blik heen?' },
  { id: 'hoek', label: 'Hoek', hint: 'Tik drie punten: begin, hoekpunt, eind. Bijv. heup, knie, enkel' },
  { id: 'vrij', label: 'Vrij', hint: 'Teken wat je wilt' },
]

/** Hoek bij b tussen ba en bc, in hele graden (0..180). */
export function angleAt(a: Pt, b: Pt, c: Pt): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const l = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)
  if (!l) return 0
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / l))
  return Math.round((Math.acos(cos) * 180) / Math.PI)
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Een sleep die te kort is (per ongeluk getikt) wordt geen lijn. */
export const tooShort = (a: Pt, b: Pt, size: number) => dist(a, b) < size * 0.02

/** Schermpunt naar beeldpixels, voor een beeld dat met object-contain in een vlak staat. */
export function toImage(pt: Pt, box: { width: number; height: number }, img: { width: number; height: number }): Pt {
  const s = Math.min(box.width / img.width, box.height / img.height)
  const ox = (box.width - img.width * s) / 2
  const oy = (box.height - img.height * s) / 2
  return { x: Math.max(0, Math.min(img.width, (pt.x - ox) / s)), y: Math.max(0, Math.min(img.height, (pt.y - oy) / s)) }
}

/** Vrije lijn uitdunnen: punten die vlak bij de vorige liggen weg (minder werk, vloeiender lijn). */
export function thin(pts: Pt[], min: number): Pt[] {
  const out: Pt[] = []
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) >= min) out.push(p)
  return out
}

/** Alles tekenen op een canvas dat het beeld 1-op-1 laat zien (dikte schaalt mee met het formaat). */
export function drawShapes(c: CanvasRenderingContext2D, shapes: Shape[], size: { width: number; height: number }, draft?: Pt[]) {
  const w = Math.max(3, Math.round(Math.min(size.width, size.height) / 160))
  c.lineCap = 'round'
  c.lineJoin = 'round'
  const line = (a: Pt, b: Pt, color: string) => {
    c.strokeStyle = 'rgba(0,0,0,0.45)'
    c.lineWidth = w + 3
    c.beginPath()
    c.moveTo(a.x, a.y)
    c.lineTo(b.x, b.y)
    c.stroke()
    c.strokeStyle = color
    c.lineWidth = w
    c.stroke()
  }
  const dot = (p: Pt, color: string) => {
    c.fillStyle = color
    c.beginPath()
    c.arc(p.x, p.y, w * 1.4, 0, Math.PI * 2)
    c.fill()
  }
  for (const s of shapes) {
    if (s.kind === 'lijn') line(s.a, s.b, s.color)
    else if (s.kind === 'pijl') {
      line(s.a, s.b, s.color)
      const ang = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x)
      const head = w * 5
      for (const d of [-0.5, 0.5]) line(s.b, { x: s.b.x - head * Math.cos(ang + d), y: s.b.y - head * Math.sin(ang + d) }, s.color)
    } else if (s.kind === 'hoek') {
      line(s.b, s.a, s.color)
      line(s.b, s.c, s.color)
      for (const p of [s.a, s.b, s.c]) dot(p, s.color)
      // boogje en de graden bij het hoekpunt
      const a1 = Math.atan2(s.a.y - s.b.y, s.a.x - s.b.x)
      const a2 = Math.atan2(s.c.y - s.b.y, s.c.x - s.b.x)
      let d = a2 - a1
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      const r = w * 9
      c.strokeStyle = s.color
      c.lineWidth = Math.max(2, w * 0.7)
      c.beginPath()
      c.arc(s.b.x, s.b.y, r, a1, a1 + d, d < 0)
      c.stroke()
      const mid = a1 + d / 2
      const label = `${angleAt(s.a, s.b, s.c)}°`
      const fs = w * 6
      c.font = `800 ${fs}px -apple-system, system-ui, sans-serif`
      const tx = s.b.x + Math.cos(mid) * (r + fs * 1.1)
      const ty = s.b.y + Math.sin(mid) * (r + fs * 1.1)
      const tw = c.measureText(label).width
      c.fillStyle = 'rgba(0,0,0,0.6)'
      c.fillRect(tx - tw / 2 - fs * 0.3, ty - fs * 0.65, tw + fs * 0.6, fs * 1.3)
      c.fillStyle = s.color
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(label, tx, ty + fs * 0.05)
    } else {
      for (let i = 1; i < s.pts.length; i++) line(s.pts[i - 1], s.pts[i], s.color)
    }
  }
  // hoek in de maak: de punten die je al tikte
  if (draft) for (const p of draft) dot(p, 'rgba(255,255,255,0.9)')
}

/** Frame plus tekening als jpg. `src` is het beeld (video op het juiste frame, of een foto). */
export async function exportSketch(src: CanvasImageSource, size: { width: number; height: number }, shapes: Shape[]): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const c = canvas.getContext('2d')!
  c.drawImage(src, 0, 0, size.width, size.height)
  drawShapes(c, shapes, size)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Opslaan lukte niet'))), 'image/jpeg', 0.9),
  )
}
