// Video's op het toestel verkleinen voordat ze geüpload worden: 720p H.264, max 30 fps.
// Een iPhone-clip van 1 minuut gaat zo van ~100 MB naar ~10 MB. Draait met WebCodecs; kan de
// browser dat niet, of levert het niks op, dan houden we gewoon het origineel.
// Deze module wordt pas geladen als je een video toevoegt.
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  canEncodeVideo,
} from 'mediabunny'

const SHORT_SIDE = 720
const MAX_FPS = 30

export interface Compressed {
  blob: Blob
  mime: string
  /** false als het geluid niet mee kon (dan beslist de aanroeper) */
  hasAudio: boolean
}

export async function compressVideo(file: Blob, onProgress?: (p: number) => void): Promise<Compressed | null> {
  if (typeof VideoEncoder === 'undefined') return null
  try {
    if (!(await canEncodeVideo('avc', { width: 1280, height: 720 }))) return null
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
    const audioTracks = (await input.getAudioTracks()).length

    const conversion = await Conversion.init({
      input,
      output,
      video: async (track) => {
        const w = track.displayWidth
        const h = track.displayHeight
        // alleen verkleinen, nooit vergroten; de korte kant wordt 720
        const size = Math.min(w, h) > SHORT_SIDE ? (w >= h ? { height: SHORT_SIDE } : { width: SHORT_SIDE }) : {}
        const stats = await track.computePacketStats(60).catch(() => null)
        const fps = stats && stats.averagePacketRate > MAX_FPS + 1 ? { frameRate: MAX_FPS } : {}
        return { codec: 'avc', quality: QUALITY_MEDIUM, ...size, ...fps }
      },
      audio: { codec: 'aac' },
    })
    if (!conversion.isValid) return null
    if (onProgress) conversion.onProgress = (p) => onProgress(p)
    await conversion.execute()

    const buffer = (output.target as BufferTarget).buffer
    if (!buffer) return null
    const blob = new Blob([buffer], { type: 'video/mp4' })
    const keptAudio = conversion.utilizedTracks.some((t) => t.isAudioTrack())
    return { blob, mime: 'video/mp4', hasAudio: audioTracks === 0 || keptAudio }
  } catch {
    return null
  }
}
