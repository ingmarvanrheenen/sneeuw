import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../design/icons'
import {
  CUE_LABEL,
  cueFor,
  currentStep,
  normalize,
  sample,
  SIDE_DEFAULT,
  TOP_DEFAULT,
  type Anim,
  type BodyPart,
  type FullSideKey,
  type FullTopKey,
  type Obstacle,
  type SideAnim,
  type TopAnim,
} from './engine'
import { pose, type Fill, type P2 } from './pose'
import { cx } from '../components/ui'
import { settingsStore, updateSettings } from '../lib/settings'
import { sfx } from '../lib/sounds'

// ── Zijaanzicht ─────────────────────────────────────────────────────────────

const GROUND = 150
const VIEW_W = 204
const VIEW_H = 153
const wx = (x: number) => 160 + x * 130
const wy = (y: number) => GROUND - y * 75

const FILL: Record<Fill, string> = {
  jacket: 'var(--jacket)',
  pants: 'var(--pants)',
  gear: 'var(--text)',
  board: 'var(--text)',
  binding: 'var(--accent)',
  lens: 'var(--accent)',
  skin: 'var(--skin)',
}

function CueRing({ at }: { at: P2 | null }) {
  if (!at) return null
  return (
    <g transform={`translate(${at[0]} ${at[1]})`} pointerEvents="none">
      <circle r={13} fill="none" stroke="var(--bg)" strokeWidth={5} opacity={0.85} />
      <circle r={13} fill="none" stroke="var(--accent)" strokeWidth={2.4} />
      <circle className="cue-ring" r={13} fill="none" stroke="var(--accent)" strokeWidth={2} />
    </g>
  )
}

function Rider({ k, opacity = 1, cue }: { k: FullSideKey; opacity?: number; cue?: BodyPart | null }) {
  const p = pose(k)
  return (
    <g transform={`translate(${wx(k.x)} ${wy(k.y)})`} opacity={opacity}>
      {p.shapes.map((s, i) => {
        if (s.type === 'line')
          return (
            <line key={i} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={FILL[s.fill]} strokeWidth={s.w} strokeLinecap="round" />
          )
        if (s.type === 'circle') return <circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.r} fill={FILL[s.fill]} />
        return (
          <path
            key={i}
            d={`M${s.pts.map((q) => q.join(',')).join(' L')} Z`}
            fill={FILL[s.fill]}
            stroke={FILL[s.fill]}
            strokeWidth={s.fill === 'board' ? 3 : 1}
            strokeLinejoin="round"
          />
        )
      })}
      {cue && <CueRing at={p.points[cue]} />}
    </g>
  )
}

function ObstacleShape({ type }: { type?: Obstacle }) {
  if (!type || type === 'none') return null
  const fill = 'var(--surface-2)'
  const stroke = 'var(--line)'
  if (type === 'kicker')
    return (
      <path
        d={`M${wx(-0.52)},${GROUND} Q${wx(-0.26)},${GROUND} ${wx(-0.17)},${wy(0.3)} L${wx(0.22)},${wy(0.3)} L${wx(0.64)},${GROUND} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
      />
    )
  if (type === 'box')
    return (
      <rect
        x={wx(-0.4)}
        y={wy(0.2)}
        width={wx(0.4) - wx(-0.4)}
        height={GROUND - wy(0.2)}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
      />
    )
  if (type === 'rail')
    return (
      <g stroke="var(--muted)" strokeLinecap="round">
        <line x1={wx(-0.4)} y1={wy(0.3)} x2={wx(0.4)} y2={wy(0.3)} strokeWidth={3} />
        <line x1={wx(-0.3)} y1={wy(0.3)} x2={wx(-0.3)} y2={GROUND} strokeWidth={2} />
        <line x1={wx(0.3)} y1={wy(0.3)} x2={wx(0.3)} y2={GROUND} strokeWidth={2} />
      </g>
    )
  if (type === 'object') return <rect x={wx(-0.12)} y={GROUND - 10} width={20} height={10} rx={4} fill={fill} stroke={stroke} />
  return null
}

function SideScene({ anim, t, ghosts, cue }: { anim: SideAnim; t: number; ghosts: boolean; cue: BodyPart | null }) {
  const keys = useMemo(() => normalize(anim.keys, SIDE_DEFAULT), [anim])
  const k = sample(keys, t)
  // Camera volgt de rider, zodat hij groot en in beeld blijft. Het terrein schuift mee.
  const camX = Math.max(wx(-0.95) + 20, Math.min(wx(0.95) - 20, wx(k.x)))
  const vx = camX - VIEW_W / 2
  // verticaal: grond onderin beeld, maar mee omhoog bij sprongen
  const vy = Math.min(GROUND + 24 - VIEW_H, wy(k.y) - 112)
  const shadowW = Math.max(12, 40 - k.y * 26)
  const onBox = anim.obstacle === 'box' && Math.abs(k.x) < 0.4
  return (
    <svg viewBox={`${vx} ${vy} ${VIEW_W} ${VIEW_H}`} className="h-full w-full" role="img" aria-label="Animatie van de trick">
      <g transform={`rotate(${anim.slope ?? 0} 160 ${GROUND})`}>
        <rect x={-500} y={GROUND} width={1400} height={120} fill="var(--surface-2)" opacity={0.6} />
        <line x1={-500} y1={GROUND} x2={900} y2={GROUND} stroke="var(--line)" strokeWidth={1.5} />
        {Array.from({ length: 40 }, (_, i) => (
          <line key={i} x1={i * 30 - 400} y1={GROUND + 9} x2={i * 30 - 388} y2={GROUND + 9} stroke="var(--line)" strokeWidth={1.2} />
        ))}
        <ObstacleShape type={anim.obstacle} />
        <ellipse cx={wx(k.x)} cy={GROUND - (onBox ? 15 : 0)} rx={shadowW} ry={2.5} fill="var(--text)" opacity={0.1} />
        {ghosts && [0.14, 0.07].map((d) => (t - d > 0 ? <Rider key={d} k={sample(keys, t - d)} opacity={0.13} /> : null))}
        <Rider k={k} cue={cue} />
        {anim.obstacle === 'pipe' && (
          <path
            d={`M-500,${GROUND - 4} ${Array.from({ length: 50 }, (_, i) => `Q${i * 28 - 486},${GROUND - 13 - (i % 2) * 4} ${i * 28 - 472},${GROUND - 4}`).join(' ')} L900,${GROUND + 30} L-500,${GROUND + 30} Z`}
            fill="var(--surface)"
            opacity={0.94}
          />
        )}
      </g>
    </svg>
  )
}

// ── Bovenaanzicht ───────────────────────────────────────────────────────────

const tpx = (x: number) => 160 + x * 120
const tpy = (y: number) => 132 + y * 88

/** Punten in het board-assenstelsel (bovenaanzicht) omzetten naar scherm. */
function topPoint(k: FullTopKey, lx0: number, ly0: number): P2 {
  const lx = lx0 * 1.35
  const ly = ly0 * 1.35
  const a = (k.angle * Math.PI) / 180
  return [tpx(k.x) + lx * Math.cos(a) - ly * Math.sin(a), tpy(k.y) + lx * Math.sin(a) + ly * Math.cos(a)]
}

function TopScene({ anim, t, cue }: { anim: TopAnim & { trail?: 'skid' | 'carve' }; t: number; cue: BodyPart | null }) {
  const keys = useMemo(() => normalize(anim.keys, TOP_DEFAULT), [anim])
  const k = sample(keys, t, ['y'])
  const trail: string[] = []
  for (let s = 0; s <= t; s += 0.008) {
    const q = sample(keys, s, ['y'])
    trail.push(`${tpx(q.x)},${tpy(q.y)}`)
  }
  const carve = anim.trail === 'carve'
  const edgeColor = k.edge === 'heel' ? 'var(--heel)' : k.edge === 'toe' ? 'var(--toe)' : 'transparent'
  // heel edge = -y, toe edge = +y (regular); rider kijkt naar de toe-kant
  const cueAt: Partial<Record<BodyPart, P2>> = {
    'heel-edge': topPoint(k, 0, -8),
    'toe-edge': topPoint(k, 0, 8),
    board: topPoint(k, 0, 0),
    nose: topPoint(k, 26, 0),
    tail: topPoint(k, -26, 0),
    head: topPoint(k, 0, 1),
    shoulders: topPoint(k, 0, 1),
    hips: topPoint(k, 0, 0),
    knees: topPoint(k, 0, 4),
    'front-foot': topPoint(k, 11, 0),
    'back-foot': topPoint(k, -11, 0),
  }
  return (
    <svg viewBox="0 0 320 240" className="h-full w-full" role="img" aria-label="Bovenaanzicht van de bocht">
      {/* valrichting */}
      <g stroke="var(--line)" strokeWidth={1.5} fill="none">
        <line x1={18} y1={30} x2={18} y2={214} strokeDasharray="3 5" />
        <path d="M12,206 L18,216 L24,206" />
      </g>
      {anim.scenery === 'trees' &&
        [
          [44, 62],
          [272, 44],
          [62, 192],
          [286, 172],
          [152, 28],
          [214, 120],
          [104, 120],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={14} fill="var(--accent-soft)" />
            <circle cx={x} cy={y} r={3} fill="var(--muted)" />
          </g>
        ))}
      {anim.scenery === 'moguls' &&
        Array.from({ length: 12 }, (_, i) => (
          <ellipse
            key={i}
            cx={56 + (i % 4) * 72 + (Math.floor(i / 4) % 2) * 34}
            cy={46 + Math.floor(i / 4) * 74}
            rx={24}
            ry={14}
            fill="var(--surface-2)"
          />
        ))}
      {anim.scenery === 'lift' && (
        <line x1={tpx(-0.15) + 14} y1={0} x2={tpx(-0.15) + 14} y2={240} stroke="var(--muted)" strokeDasharray="4 6" strokeWidth={1.5} />
      )}
      <polyline
        points={trail.join(' ')}
        fill="none"
        stroke="var(--text)"
        strokeOpacity={carve ? 0.5 : 0.1}
        strokeWidth={carve ? 2 : 14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform={`translate(${tpx(k.x)} ${tpy(k.y)}) rotate(${k.angle}) scale(1.35)`}>
        <rect x={-26} y={-7.5} width={52} height={15} rx={7.5} fill="var(--text)" />
        <line
          x1={-20}
          y1={k.edge === 'toe' ? 7 : -7}
          x2={20}
          y2={k.edge === 'toe' ? 7 : -7}
          stroke={edgeColor}
          strokeWidth={4}
          strokeLinecap="round"
        />
        {/* bindingen in duck stance */}
        <line x1={9} y1={-6} x2={13} y2={6} stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />
        <line x1={-9} y1={-6} x2={-13} y2={6} stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />
        {/* rider: schouders langs het board, hoofd, borst wijst naar de toe-kant */}
        <rect x={-10} y={-3.5} width={20} height={7} rx={3.5} fill="var(--jacket)" />
        <circle cx={0} cy={1} r={5.5} fill="var(--text)" stroke="var(--bg)" strokeWidth={1.5} />
        <path d="M-3,6.5 L0,10.5 L3,6.5 Z" fill="var(--accent)" />
        <circle cx={25} cy={0} r={2.2} fill="var(--accent)" />
      </g>
      {cue && <CueRing at={cueAt[cue] ?? null} />}
    </svg>
  )
}

// ── Meters ──────────────────────────────────────────────────────────────────

function Meter({
  label,
  value,
  left,
  right,
  mode = 'center',
}: {
  label: string
  value: number
  left: string
  right: string
  mode?: 'center' | 'fill'
}) {
  const pct = mode === 'center' ? ((value + 1) / 2) * 100 : value * 100
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-[12px] text-muted">
        <span>{label}</span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-2">
        {mode === 'fill' ? (
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
        ) : (
          <>
            <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
            <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${pct}%` }} />
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  )
}

function SideMeters({ anim, t }: { anim: SideAnim; t: number }) {
  const keys = useMemo(() => normalize(anim.keys, SIDE_DEFAULT), [anim])
  const k = sample(keys, t)
  const spins = anim.keys.some((x) => x.spin && Math.abs(x.spin) >= 90)
  const flips = anim.keys.some((x) => x.flip && Math.abs(x.flip) >= 180)
  const deg = Math.round(Math.abs(spins ? k.spin : k.flip) / 10) * 10
  return (
    <div className="grid grid-cols-3 gap-4">
      <Meter label="Gewicht" value={Math.max(-1, Math.min(1, k.lean))} left="tail" right="neus" />
      <Meter label="Knieën" value={k.crouch} left="gestrekt" right="diep" mode="fill" />
      {spins || flips ? (
        <div>
          <div className="text-[12px] text-muted">{spins ? 'Rotatie' : 'Flip'}</div>
          <div className="display num mt-0.5 text-[24px]">{deg}°</div>
        </div>
      ) : (
        <div>
          <div className="text-[12px] text-muted">Hoogte</div>
          <div className="mt-1 text-[15px] font-semibold">{k.y > 0.06 ? 'In de lucht' : k.down ? 'Op de sneeuw' : 'Op het board'}</div>
        </div>
      )}
    </div>
  )
}

function TopMeters({ anim, t }: { anim: TopAnim; t: number }) {
  const keys = useMemo(() => normalize(anim.keys, TOP_DEFAULT), [anim])
  const k = sample(keys, t, ['y'])
  const across = Math.abs((((k.angle % 180) + 180) % 180) - 90) // 0 = valrichting, 90 = dwars
  const dir = across > 60 ? 'Dwars (remmen)' : across > 25 ? 'Schuin' : 'Valrichting (snelheid)'
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-[12px] text-muted">Edge</div>
        <div className="mt-1.5 flex gap-1">
          {(['heel', 'flat', 'toe'] as const).map((e) => (
            <span
              key={e}
              className={cx(
                'flex-1 rounded-md py-1 text-center text-[12px] font-semibold transition-colors duration-150',
                k.edge === e
                  ? e === 'heel'
                    ? 'bg-heel text-white'
                    : e === 'toe'
                      ? 'bg-toe text-white'
                      : 'bg-text text-bg'
                  : 'bg-surface-2 text-muted',
              )}
            >
              {e === 'flat' ? 'plat' : e}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[12px] text-muted">Board t.o.v. helling</div>
        <div className="mt-1 text-[15px] font-semibold">{dir}</div>
      </div>
    </div>
  )
}

// ── Speler ──────────────────────────────────────────────────────────────────

const SPEEDS = [0.25, 0.5, 1] as const
const HOLD_MS = 1100

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        'flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-150',
        on ? 'bg-accent-soft text-accent-text' : 'bg-surface text-muted',
      )}
    >
      {children}
    </button>
  )
}

export function TrickAnimation({ anim, compact = false, stepList = true }: { anim: Anim; compact?: boolean; stepList?: boolean }) {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(compact ? 1 : 0.5)
  const [ghosts, setGhosts] = useState(false)
  const [learn, setLearn] = useState(!compact)
  const goofy = settingsStore.use().goofy
  const raf = useRef<number>(0)
  const last = useRef<number | null>(null)
  const tRef = useRef(0)
  const holdUntil = useRef(0)

  useEffect(() => {
    if (!playing) {
      last.current = null
      return
    }
    const tick = (now: number) => {
      if (last.current != null && now >= holdUntil.current) {
        const dt = Math.min(0.05, (now - last.current) / 1000)
        const prev = tRef.current
        let next = prev + (dt * speed) / anim.duration
        // Lesmodus: even stilstaan op het begin van elke stap
        if (learn && !compact) {
          const crossed = anim.steps.find((s) => s.t > prev && s.t <= next && s.t > 0)
          if (crossed) {
            next = crossed.t
            holdUntil.current = now + HOLD_MS
          }
        }
        if (next > 1.2) {
          next = 0
          if (learn && !compact) holdUntil.current = now + HOLD_MS
        }
        tRef.current = next
        setT(next)
      }
      last.current = now
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, speed, anim, learn, compact])

  const tt = Math.min(1, t)
  const stepIdx = currentStep(anim.steps, tt)
  const step = anim.steps[stepIdx]
  const cue = compact ? null : cueFor(step)

  const jump = useCallback((v: number) => {
    tRef.current = v
    holdUntil.current = 0
    setT(v)
  }, [])
  const goStep = (i: number) => {
    sfx.tap()
    const idx = Math.max(0, Math.min(anim.steps.length - 1, i))
    jump(anim.steps[idx].t)
    setPlaying(false)
  }

  const scene =
    anim.view === 'side' ? <SideScene anim={anim} t={tt} ghosts={ghosts} cue={cue} /> : <TopScene anim={anim} t={tt} cue={cue} />

  if (compact)
    return (
      <div className="card relative aspect-[4/3] overflow-hidden">
        <div className="absolute inset-0" style={{ transform: goofy ? 'scaleX(-1)' : undefined }}>
          {scene}
        </div>
      </div>
    )

  return (
    <div>
      <div className="card relative aspect-[4/3] overflow-hidden">
        <div className="absolute inset-0" style={{ transform: goofy ? 'scaleX(-1)' : undefined }}>
          {scene}
        </div>
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="text-[12px] text-muted">
            {anim.view === 'side' ? 'Zijaanzicht' : 'Bovenaanzicht'} · {goofy ? 'goofy' : 'regular'}
          </span>
          {cue && (
            <span key={cue} className="pop-in rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold text-accent-ink">
              Let op: {CUE_LABEL[cue].toLowerCase()}
            </span>
          )}
        </div>
      </div>

      {/* Huidige stap, groot en leesbaar */}
      <div className="mt-3 min-h-[76px] rounded-[14px] bg-surface px-4 py-3" aria-live="polite">
        <div className="text-[13px] text-muted">
          Stap {Math.max(1, stepIdx + 1)} van {anim.steps.length}
        </div>
        <div key={stepIdx} className="pop-in mt-0.5 text-[17px] font-semibold leading-snug">
          {step ? step.label : anim.steps[0]?.label}
        </div>
      </div>

      {/* Bediening */}
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
          onClick={() => {
            sfx.tap()
            if (!playing && tRef.current >= 1) jump(0)
            setPlaying((p) => !p)
          }}
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

      {/* Tijdlijn met stapmarkeringen */}
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
          {anim.steps.map((s, i) => (
            <span
              key={i}
              className={cx('absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-full', i <= stepIdx ? 'bg-accent' : 'bg-line')}
              style={{ left: `${s.t * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* Meters: wat je lichaam op dit moment doet */}
      <div className="mt-5 rounded-[14px] bg-surface p-4">
        {anim.view === 'side' ? <SideMeters anim={anim} t={tt} /> : <TopMeters anim={anim} t={tt} />}
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
        {anim.view === 'side' && (
          <Toggle on={ghosts} onClick={() => setGhosts((g) => !g)}>
            <Icon name="trail" size={14} /> Sporen
          </Toggle>
        )}
        <Toggle on={goofy} onClick={() => updateSettings({ goofy: !goofy })}>
          <Icon name="mirror" size={14} /> Goofy
        </Toggle>
      </div>

      {stepList && (
        <ol className="card mt-4 divide-y divide-[var(--line)] overflow-hidden">
          {anim.steps.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => goStep(i)}
                className={cx('flex w-full items-start gap-3 px-4 py-3 text-left text-[15px]', i === stepIdx ? 'text-text' : 'text-muted')}
              >
                <span
                  className={cx(
                    'num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                    i === stepIdx ? 'bg-accent text-accent-ink' : i < stepIdx ? 'bg-accent-soft text-accent-text' : 'bg-surface-2',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex-1">{s.label}</span>
                {cueFor(s) && <span className="shrink-0 text-[12px] text-muted">{CUE_LABEL[cueFor(s)!]}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
