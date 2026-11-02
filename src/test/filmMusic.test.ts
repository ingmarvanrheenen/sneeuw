// Muziek voor de trip-film: de patronen kloppen en het inplannen maakt geluid op de juiste momenten.
import { describe, expect, it } from 'vitest'
import { beatOf, pattern, scheduleMusic, TRACK_BY_ID, TRACKS } from '../lib/filmMusic'

describe('patronen', () => {
  it('elke track: 2 maten van 16en (32 stappen), uniek, met een kick op de eerste tel', () => {
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length)
    for (const t of TRACKS) {
      for (const p of [t.kick, t.snare, t.hat, t.stab]) expect(p).toMatch(/^[x.]{32}$/)
      expect(t.bass).toHaveLength(32)
      expect(t.kick[0]).toBe('x')
      expect(t.bpm).toBeGreaterThan(80)
    }
  })

  it('noten binnen de lengte, op het raster, en de laatste twee tellen alleen nog kicks', () => {
    const t = TRACK_BY_ID.get('park')!
    const dur = 10
    const ev = pattern(t, dur)
    const step = beatOf(t) / 4
    expect(ev.length).toBeGreaterThan(50)
    for (const e of ev) {
      expect(e.at).toBeGreaterThanOrEqual(0)
      expect(e.at).toBeLessThan(dur)
      expect(Math.abs(e.at / step - Math.round(e.at / step))).toBeLessThan(1e-9)
    }
    expect(ev.filter((e) => e.at > dur - beatOf(t) * 2).every((e) => e.kind === 'kick')).toBe(true)
    expect(ev[0]).toMatchObject({ at: 0, kind: 'kick', vel: 1 })
  })

  it('elke stijl klinkt anders', () => {
    const sig = TRACKS.map((t) => JSON.stringify(pattern(t, 6).map((e) => [e.kind, Math.round(e.at * 1000)])))
    expect(new Set(sig).size).toBe(TRACKS.length)
  })
})

/** Nagebootste AudioContext: onthoudt wanneer welke bron start. */
function fakeCtx() {
  const starts: number[] = []
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} })
  const node = () => ({ connect() {}, disconnect() {}, gain: param(), frequency: param(), type: '' })
  const src = () => ({ ...node(), buffer: null, start: (t: number) => starts.push(t), stop() {} })
  return {
    starts,
    ctx: {
      sampleRate: 8000,
      currentTime: 0,
      createGain: node,
      createBiquadFilter: node,
      createOscillator: src,
      createBufferSource: src,
      createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    } as unknown as BaseAudioContext,
  }
}

describe('inplannen', () => {
  it('alles start tussen begin en eind, vanaf het gekozen moment', () => {
    const { ctx, starts } = fakeCtx()
    const out = { connect() {} } as unknown as AudioNode
    const mix = scheduleMusic(ctx, out, TRACK_BY_ID.get('pow')!, 5, 8)
    expect(mix.gain).toBeTruthy()
    expect(starts.length).toBeGreaterThan(40)
    expect(Math.min(...starts)).toBe(5)
    expect(Math.max(...starts)).toBeLessThan(13)
  })
})
