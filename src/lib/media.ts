// Foto's en video's verwerken op het toestel: verkleinen, thumbnail maken, lokaal opslaan.
import { db } from './db'
import { create } from './repo'
import type { MediaMeta } from './types'
import { uid } from './ids'

export const MAX_VIDEO_MB = 50

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function canvasBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', q = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), type, q))
}

function drawScaled(src: CanvasImageSource, w: number, h: number, max: number) {
  const scale = Math.min(1, max / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function processImage(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const big = drawScaled(img, img.naturalWidth, img.naturalHeight, 2048)
    const thumb = drawScaled(img, img.naturalWidth, img.naturalHeight, 320).toDataURL('image/jpeg', 0.7)
    return { blob: await canvasBlob(big), mime: 'image/jpeg', thumb, width: big.width, height: big.height }
  } catch {
    // Formaat dat de browser niet kan tekenen: origineel bewaren
    return { blob: file as Blob, mime: file.type || 'image/jpeg', thumb: undefined, width: undefined, height: undefined }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function videoThumb(file: File): Promise<{ thumb?: string; width?: number; height?: number }> {
  const url = URL.createObjectURL(file)
  try {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'metadata'
    v.src = url
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res()
      v.onerror = () => rej(new Error('video'))
      setTimeout(() => res(), 4000)
    })
    v.currentTime = Math.min(0.5, (v.duration || 1) / 3)
    await new Promise<void>((res) => {
      v.onseeked = () => res()
      setTimeout(() => res(), 2000)
    })
    if (!v.videoWidth) return {}
    const c = drawScaled(v, v.videoWidth, v.videoHeight, 320)
    return { thumb: c.toDataURL('image/jpeg', 0.7), width: v.videoWidth, height: v.videoHeight }
  } catch {
    return {}
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function addMediaFiles(
  files: FileList | File[],
  link: { sessionId?: string; trickId?: string; crewId?: string | null },
): Promise<{ added: MediaMeta[]; skipped: string[] }> {
  const added: MediaMeta[] = []
  const skipped: string[] = []
  for (const file of Array.from(files)) {
    const isVideo = file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name)
    if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
      skipped.push(`${file.name} is groter dan ${MAX_VIDEO_MB} MB`)
      continue
    }
    const id = uid()
    if (isVideo) {
      const meta = await videoThumb(file)
      await db.blobs.put({ id, blob: file })
      added.push(
        await create('media', { id, type: 'video', mime: file.type || 'video/quicktime', ...meta, ...link, crewId: link.crewId ?? null }),
      )
    } else {
      const img = await processImage(file)
      await db.blobs.put({ id, blob: img.blob })
      added.push(
        await create('media', {
          id,
          type: 'image',
          mime: img.mime,
          thumb: img.thumb,
          width: img.width,
          height: img.height,
          ...link,
          crewId: link.crewId ?? null,
        }),
      )
    }
  }
  return { added, skipped }
}
