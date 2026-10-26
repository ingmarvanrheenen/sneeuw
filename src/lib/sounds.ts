// Kleine, zachte geluidjes met WebAudio (geen bestanden nodig).
// iOS laat audio pas toe na een tik van de gebruiker, dus we "unlocken" bij de eerste tap.
import { settingsStore } from './settings'

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (!settingsStore.get().sounds) return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function unlockAudio() {
  const once = () => {
    audio()
    window.removeEventListener('pointerdown', once)
  }
  window.addEventListener('pointerdown', once)
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
  const a = audio()
  if (!a) return
  const t0 = a.currentTime + start
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export const sfx = {
  tap: () => tone(880, 0, 0.05, 'triangle', 0.03),
  toggle: () => tone(660, 0, 0.07, 'triangle', 0.04),
  success: () => {
    tone(660, 0, 0.12, 'triangle')
    tone(990, 0.08, 0.18, 'triangle')
  },
  wrong: () => tone(220, 0, 0.18, 'sine', 0.06),
  badge: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.22, 'triangle', 0.06)),
  levelUp: () => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.08, 0.3, 'square', 0.025)),
}
