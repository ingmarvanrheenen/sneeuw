// De 3D-speler: dezelfde lesmodus als de 2D-speler (stappen, pauze per stap, tijdlijn),
// maar met een echte rider die je van alle kanten kunt bekijken.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon, Spinner } from '../design/icons'
import { CUE_LABEL, cueFor, currentStep } from '../anim/engine'
import { HOLD_MS, Meter, SPEEDS, Toggle, TrickAnimation } from '../anim/TrickAnimation'
import { cx, Segmented } from '../components/ui'
import type { Trick } from '../content/tricks'
import { settingsStore, updateSettings } from '../lib/settings'
import { sfx } from '../lib/sounds'
import { motionFor } from './motions'
import { readColors, Stage } from './stage'
import type { CameraPreset, FullKey3, Motion } from './types'

const CAMERAS: { value: CameraPreset; label: string }[] = [
  { value: 'zij', label: 'Zij' },
  { value: 'achter', label: 'Achter' },
  { value: 'voor', label: 'Voor' },
  { value: 'boven', label: 'Boven' },
  { value: 'mee', label: 'Mee' },
]

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

function Meters({ motion, k, kmh }: { motion: Motion; k: FullKey3 | null; kmh: number }) {
  const spin = useMemo(() => {
    const h = motion.keys.map((x) => x.heading ?? 90)
    return Math.max(...h) - Math.min(...h) >= 179
  }, [motion])
  if (!k) return null
  const h0 = motion.keys[0]?.heading ?? 90
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4">
      <Meter label="Gewicht" value={clamp1(k.lean)} left="tail" right="neus" />
      <Meter label="Knieën" value={Math.max(0, Math.min(1, k.crouch))} left="gestrekt" right="diep" mode="fill" />
      <Meter label="Edge" value={clamp1(k.edge)} left="heel" right="toe" />
      {spin ? (
        <div>
          <div className="text-[12px] text-muted">Rotatie</div>
          <div className="display num mt-0.5 text-[22px] leading-none">{Math.round(Math.abs(k.heading - h0) / 10) * 10}°</div>
        </div>
      ) : (
        <Meter label="Schouders" value={clamp1(-k.twist / 35)} left="dicht" right="open" />
      )}
      <div className="col-span-2 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-[12px] text-muted">Snelheid</span>
        <span>
          <span className="display num text-[22px] leading-none">{kmh}</span>
          <span className="ml-1 text-[12px] text-muted">km/u</span>
        </span>
      </div>
    </div>
  )
}

export default function Player3D({ trick }: { trick: Trick }) {
  const motion = useMemo(() => motionFor(trick), [trick])
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const [failed, setFailed] = useState(false)
  const [t, setT] = useState(0)
  const [key, setKey] = useState<FullKey3 | null>(null)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(0.5)
  const [learn, setLearn] = useState(true)
  const [camera, setCamera] = useState<CameraPreset>(motion?.camera ?? 'zij')
  const goofy = settingsStore.use().goofy
  const tRef = useRef(0)
  const holdUntil = useRef(0)
  const visible = useRef(true)
  const [ready, setReady] = useState(false)
  const [big, setBig] = useState(false)
  const [kmh, setKmh] = useState(0)
  const tap = useRef<{ x: number; y: number; at: number } | null>(null)

  const steps = motion?.steps ?? []
  const tt = Math.min(1, t)
  const stepIdx = currentStep(steps, tt)
  const step = steps[stepIdx]
  const cue = cueFor(step)
  const cueRef = useRef(cue)
  cueRef.current = cue

  // scène opbouwen
  useEffect(() => {
    if (!motion || !host.current) return
    let s: Stage
    try {
      s = new Stage(host.current, readColors())
    } catch {
      setFailed(true)
      return
    }
    stage.current = s
    // handig voor screenshots en debuggen: frames exact afspelen vanuit de console
    if (import.meta.env.DEV) (window as unknown as { __stage?: Stage }).__stage = s
    s.setMotion(motion)
    setCamera(motion.camera)
    tRef.current = 0
    setT(0)
    setKey(s.key)
    // kleuren volgen licht/donker
    const recolor = () => s.setColors(readColors())
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', recolor)
    const mo = new MutationObserver(recolor)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    // niet renderen als de speler uit beeld is
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting))
    io.observe(host.current)
    return () => {
      mq.removeEventListener('change', recolor)
      mo.disconnect()
      io.disconnect()
      s.dispose()
      stage.current = null
    }
  }, [motion])

  useEffect(() => {
    stage.current?.setMirror(goofy)
  }, [goofy, motion])

  // afspelen + renderen
  useEffect(() => {
    if (!motion) return
    let raf = 0
    let last: number | null = null
    const tick = (now: number) => {
      const s = stage.current
      if (s && visible.current) {
        if (playing && last != null && now >= holdUntil.current) {
          const dt = Math.min(0.05, (now - last) / 1000)
          const prev = tRef.current
          let next = prev + (dt * speed) / motion.duration
          if (learn) {
            const crossed = motion.steps.find((x) => x.t > prev && x.t <= next && x.t > 0)
            if (crossed) {
              next = crossed.t
              holdUntil.current = now + HOLD_MS
            }
          }
          if (next > 1.15) {
            next = 0
            if (learn) holdUntil.current = now + HOLD_MS
          }
          tRef.current = next
          setT(next)
        }
        s.update(Math.min(1, tRef.current), cueRef.current, now / 1000)
        setKey(s.key)
        setKmh(Math.round(s.speed * 3.6))
        s.render()
        setReady(true)
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [motion, playing, speed, learn])

  // groot scherm: pagina vastzetten en Escape sluit
  useEffect(() => {
    if (!big) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBig(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [big])

  const jump = useCallback((v: number) => {
    tRef.current = v
    holdUntil.current = 0
    setT(v)
  }, [])
  const togglePlay = () => {
    sfx.tap()
    if (!playing && tRef.current >= 1) jump(0)
    setPlaying((p) => !p)
  }
  const goStep = (i: number) => {
    sfx.tap()
    const idx = Math.max(0, Math.min(steps.length - 1, i))
    jump(steps[idx].t)
    setPlaying(false)
  }

  if (!motion) return null
  if (failed) return trick.anim ? <TrickAnimation anim={trick.anim} stepList={false} /> : null

  return (
    <div>
      {big && <div className="aspect-[4/3]" />}
      <div className={cx('overflow-hidden', big ? 'fixed inset-0 z-50 bg-bg' : 'card relative aspect-[4/3]')}>
        <div
          ref={host}
          className={cx('absolute inset-0 transition-opacity duration-300', ready ? 'opacity-100' : 'opacity-0')}
          // korte tik = pauze/afspelen, slepen = camera draaien
          onPointerDown={(e) => (tap.current = { x: e.clientX, y: e.clientY, at: performance.now() })}
          onPointerUp={(e) => {
            const d = tap.current
            tap.current = null
            if (d && performance.now() - d.at < 250 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) togglePlay()
          }}
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-muted">
            <Spinner size={22} />
          </div>
        )}
        <div
          className={cx(
            'pointer-events-none absolute inset-x-3 flex items-start justify-between gap-2',
            big ? 'top-[max(12px,env(safe-area-inset-top))]' : 'top-3',
          )}
        >
          <span className="text-[12px] text-muted">{goofy ? 'Goofy' : 'Regular'} · sleep om te draaien</span>
          {cue && (
            <span key={cue} className="pop-in rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold text-accent-ink">
              Let op: {CUE_LABEL[cue].toLowerCase()}
            </span>
          )}
        </div>
        {!playing && ready && !big && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="pop-in grid size-14 place-items-center rounded-full bg-accent text-accent-ink opacity-90">
              <Icon name="play" size={22} />
            </span>
          </div>
        )}
        <div className={cx('absolute right-3 flex gap-2', big ? 'top-[calc(max(12px,env(safe-area-inset-top))+40px)]' : 'bottom-3')}>
          <button
            aria-label="Camera terugzetten"
            onClick={() => {
              sfx.tap()
              stage.current?.setCamera(camera)
            }}
            className="grid size-9 place-items-center rounded-full bg-surface/90 text-text shadow-sm active:opacity-60"
          >
            <Icon name="target" size={17} />
          </button>
          <button
            aria-label={big ? 'Klein scherm' : 'Groot scherm'}
            onClick={() => {
              sfx.tap()
              setBig((b) => !b)
            }}
            className="grid size-9 place-items-center rounded-full bg-surface/90 text-text shadow-sm active:opacity-60"
          >
            <Icon name={big ? 'shrink' : 'expand'} size={17} />
          </button>
        </div>
        {big && (
          <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <div className="rounded-[14px] bg-surface/95 px-4 py-3" aria-live="polite">
              <div className="text-[13px] text-muted">
                Stap {Math.max(1, stepIdx + 1)} van {steps.length}
              </div>
              <div key={stepIdx} className="pop-in mt-0.5 text-[17px] font-semibold leading-snug">
                {step ? step.label : steps[0]?.label}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-center gap-6">
              <button
                aria-label="Vorige stap"
                onClick={() => goStep(stepIdx - 1)}
                className="grid size-11 place-items-center rounded-full bg-surface text-text"
              >
                <Icon name="back" size={18} stroke={2.2} />
              </button>
              <button
                aria-label={playing ? 'Pauze' : 'Afspelen'}
                onClick={togglePlay}
                className="grid size-14 place-items-center rounded-full bg-accent text-accent-ink"
              >
                <Icon name={playing ? 'pause' : 'play'} size={22} />
              </button>
              <button
                aria-label="Volgende stap"
                onClick={() => goStep(stepIdx + 1)}
                className="grid size-11 place-items-center rounded-full bg-surface text-text"
              >
                <Icon name="chevron" size={18} stroke={2.2} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <Segmented
          value={camera}
          options={CAMERAS}
          onChange={(c) => {
            setCamera(c)
            stage.current?.setCamera(c)
          }}
        />
      </div>

      <div className="mt-3 min-h-[76px] rounded-[14px] bg-surface px-4 py-3" aria-live="polite">
        <div className="text-[13px] text-muted">
          Stap {Math.max(1, stepIdx + 1)} van {steps.length}
        </div>
        <div key={stepIdx} className="pop-in mt-0.5 text-[17px] font-semibold leading-snug">
          {step ? step.label : steps[0]?.label}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          aria-label="Vorige stap"
          onClick={() => goStep(stepIdx - 1)}
          className="grid size-11 place-items-center rounded-full bg-surface text-text active:opacity-60"
        >
          <Icon name="back" size={18} stroke={2.2} />
        </button>
        <button
          aria-label={playing ? 'Pauze' : 'Afspelen'}
          onClick={togglePlay}
          className="grid size-14 place-items-center rounded-full bg-accent text-accent-ink active:opacity-80"
        >
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
        <button
          aria-label="Volgende stap"
          onClick={() => goStep(stepIdx + 1)}
          className="grid size-11 place-items-center rounded-full bg-surface text-text active:opacity-60"
        >
          <Icon name="chevron" size={18} stroke={2.2} />
        </button>
      </div>

      <div className="relative mt-4 px-1">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={tt}
          onChange={(e) => {
            setPlaying(false)
            jump(Number(e.target.value))
          }}
          className="w-full accent-[var(--accent)]"
          aria-label="Tijdlijn"
        />
        <div className="pointer-events-none absolute inset-x-1 -bottom-1 h-2">
          {steps.map((s, i) => (
            <span
              key={i}
              className={cx('absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-full', i <= stepIdx ? 'bg-accent' : 'bg-line')}
              style={{ left: `${s.t * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-[14px] bg-surface p-4">
        <Meters motion={motion} k={key} kmh={kmh} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-surface p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={cx('num h-8 rounded-full px-3 text-[13px] font-medium', speed === s ? 'bg-accent text-accent-ink' : 'text-muted')}
            >
              {s === 1 ? '1×' : s === 0.5 ? '½×' : '¼×'}
            </button>
          ))}
        </div>
        <Toggle on={learn} onClick={() => setLearn((l) => !l)}>
          <Icon name="list" size={14} /> Pauze per stap
        </Toggle>
        <Toggle on={goofy} onClick={() => updateSettings({ goofy: !goofy })}>
          <Icon name="mirror" size={14} /> Goofy
        </Toggle>
      </div>
    </div>
  )
}
