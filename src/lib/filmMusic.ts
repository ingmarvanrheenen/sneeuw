// Muziek voor de trip-film, in de app gemaakt met WebAudio: geen bestanden, geen licenties.
// Een track is een patroon van 2 maten (kick, snare, hats, bas, akkoord-stabs) dat herhaalt. `pattern()` is pure
// data (testbaar); `scheduleMusic()` maakt er klank van op een AudioContext.

export type TrackId = 'geen' | 'boombap' | 'park' | 'pow'

export interface Track {
  id: TrackId
  name: string
  bpm: number
  /** 16e noten per 2 maten (32 stappen): x = raak */
  kick: string
  snare: string
  hat: string
  /** basnoten per stap (midi), '.' = rust */
  bass: (number | null)[]
  /** akkoord (midi) op stappen met een x */
  stab: string
  chord: number[]
}

const n = (s: string) => s.replace(/\s/g, '')
const bassLine = (notes: Record<number, number>) => Array.from({ length: 32 }, (_, i) => notes[i] ?? null)

export const TRACKS: Track[] = [
  {
    id: 'boombap',
    name: 'Boom bap',
    bpm: 92,
    kick: n('x....... ..x..... x....... ..x...x.'),
    snare: n('....x... .......x ....x... ........'),
    hat: n('x.x.x.x. x.x.x.x. x.x.x.x. x.x.x.xx'),
    bass: bassLine({ 0: 40, 6: 40, 10: 43, 16: 38, 22: 38, 26: 45 }),
    stab: n('........ ........ ........ ........'),
    chord: [],
  },
  {
    id: 'park',
    name: 'Park',
    bpm: 108,
    kick: n('x...x... x...x... x...x... x...x...'),
    snare: n('....x... ....x... ....x... ....x..x'),
    hat: n('..x...x. ..x...x. ..x...x. ..x.x.x.'),
    bass: bassLine({ 0: 45, 3: 45, 6: 48, 8: 45, 16: 41, 19: 41, 22: 43, 24: 40 }),
    stab: n('x.....x. ........ x.....x. ........'),
    chord: [57, 60, 64],
  },
  {
    id: 'pow',
    name: 'Pow day',
    bpm: 124,
    kick: n('x...x... x...x... x...x... x...x...'),
    snare: n('....x... ....x... ....x... ....x...'),
    hat: n('xxx.xxx. xxx.xxx. xxx.xxx. xxxxxxxx'),
    bass: bassLine({ 2: 38, 6: 38, 10: 38, 14: 41, 18: 36, 22: 36, 26: 36, 30: 43 }),
    stab: n('..x...x. ..x...x. ..x...x. ..x...x.'),
    chord: [62, 65, 69],
  },
]

export const TRACK_BY_ID = new Map(TRACKS.map((t) => [t.id, t]))
export const beatOf = (t: Track) => 60 / t.bpm

export type NoteKind = 'kick' | 'snare' | 'hat' | 'bass' | 'stab'
export interface NoteEvent {
  /** seconden vanaf het begin van de muziek */
  at: number
  kind: NoteKind
  /** midi-noot (bas/akkoord) */
  notes?: number[]
  /** lengte in seconden (bas/akkoord) */
  len?: number
  vel: number
}

/** Alle noten voor een stuk van `duration` seconden. Laatste maat: alleen nog een kick en een crash-hat. */
export function pattern(track: Track, duration: number): NoteEvent[] {
  const step = beatOf(track) / 4
  const out: NoteEvent[] = []
  const steps = Math.floor(duration / step)
  for (let i = 0; i < steps; i++) {
    const at = i * step
    const s = i % 32
    const ending = at > duration - beatOf(track) * 2
    if (track.kick[s] === 'x') out.push({ at, kind: 'kick', vel: s % 16 === 0 ? 1 : 0.85 })
    if (ending) continue
    if (track.snare[s] === 'x') out.push({ at, kind: 'snare', vel: 0.8 })
    if (track.hat[s] === 'x') out.push({ at, kind: 'hat', vel: s % 4 === 0 ? 0.5 : 0.32 })
    const b = track.bass[s]
    if (b !== null && b !== undefined) out.push({ at, kind: 'bass', notes: [b], len: step * 2.5, vel: 0.8 })
    if (track.stab[s] === 'x' && track.chord.length) out.push({ at, kind: 'stab', notes: track.chord, len: step * 1.5, vel: 0.35 })
  }
  return out
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

let noiseCache: WeakMap<BaseAudioContext, AudioBuffer> = new WeakMap()
function noise(ctx: BaseAudioContext) {
  let b = noiseCache.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    noiseCache.set(ctx, b)
  }
  return b
}
export const _resetNoise = () => (noiseCache = new WeakMap())

function env(ctx: BaseAudioContext, out: AudioNode, at: number, peak: number, decay: number) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  g.connect(out)
  return g
}

function play(ctx: BaseAudioContext, out: AudioNode, e: NoteEvent, t: number) {
  if (e.kind === 'kick') {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    o.connect(env(ctx, out, t, e.vel, 0.32))
    o.start(t)
    o.stop(t + 0.35)
  } else if (e.kind === 'snare' || e.kind === 'hat') {
    const src = ctx.createBufferSource()
    src.buffer = noise(ctx)
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = e.kind === 'hat' ? 7000 : 1400
    src.connect(f)
    f.connect(env(ctx, out, t, e.vel * (e.kind === 'hat' ? 0.5 : 0.9), e.kind === 'hat' ? 0.05 : 0.18))
    src.start(t)
    src.stop(t + 0.25)
    if (e.kind === 'snare') {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(190, t)
      o.connect(env(ctx, out, t, 0.35, 0.1))
      o.start(t)
      o.stop(t + 0.12)
    }
  } else {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = e.kind === 'bass' ? 420 : 1800
    f.connect(env(ctx, out, t, (e.vel * (e.kind === 'bass' ? 0.9 : 1)) / (e.notes?.length || 1) ** 0.5, e.len ?? 0.3))
    for (const note of e.notes ?? []) {
      const o = ctx.createOscillator()
      o.type = e.kind === 'bass' ? 'sawtooth' : 'square'
      o.frequency.setValueAtTime(hz(note), t)
      o.connect(f)
      o.start(t)
      o.stop(t + (e.len ?? 0.3) + 0.05)
    }
  }
}

/**
 * De muziek inplannen op `ctx`, naar `out`, vanaf `start` (ctx-tijd), `duration` seconden. Met een korte fade-in
 * en een fade-out op het eind. Geeft de gain terug (om te dempen onder het geluid van een clip).
 */
export function scheduleMusic(
  ctx: BaseAudioContext,
  out: AudioNode,
  track: Track,
  start: number,
  duration: number,
  volume = 0.55,
): GainNode {
  const bus = ctx.createGain()
  bus.gain.setValueAtTime(0.0001, start)
  bus.gain.linearRampToValueAtTime(volume, start + 0.25)
  bus.gain.setValueAtTime(volume, Math.max(start + 0.25, start + duration - 1.2))
  bus.gain.linearRampToValueAtTime(0.0001, start + duration)
  bus.connect(out)
  const mix = ctx.createGain()
  mix.connect(bus)
  for (const e of pattern(track, duration)) play(ctx, mix, e, start + e.at)
  return mix
}
