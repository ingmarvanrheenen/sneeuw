import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../design/icons'
import {
  currentStep,
  normalize,
  sample,
  SIDE_DEFAULT,
  TOP_DEFAULT,
  type Anim,
  type FullSideKey,
  type Obstacle,
  type SideAnim,
  type TopAnim,
} from './engine'
import { pose } from './pose'
import { cx } from '../components/ui'
import { settingsStore, updateSettings } from '../lib/settings'
import { sfx } from '../lib/sounds'

const GROUND = 150
const wx = (x: number) => 160 + x * 130
const wy = (y: number) => GROUND - y * 75

function Rider({ k, opacity = 1 }: { k: FullSideKey; opacity?: number }) {
  const p = pose(k)
  const ox = wx(k.x)
  const oy = wy(k.y)
  const boardPath = `M${p.board.pts.map((q) => q.join(',')).join(' L')} Z`
  const body = p.segs.map((s, i) => (
    <line key={i} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="var(--text)" strokeWidth={s.w} strokeLinecap="round" />
  ))
  const headEl = (
    <g>
      <circle cx={p.head.x} cy={p.head.y} r={p.head.r} fill="var(--text)" />
      {p.head.facing > 0.25 && <rect x={p.head.x - 6} y={p.head.y - 3} width={12} height={5} rx={2.5} fill="var(--accent)" />}
      {Math.abs(p.head.facing) <= 0.25 && (
        <rect
          x={p.head.x + (k.spin % 360 > 0 || k.spin < -180 ? 2 : -7)}
          y={p.head.y - 3}
          width={5}
          height={5}
          rx={2}
          fill="var(--accent)"
        />
      )}
    </g>
  )
  // Board vóór of achter het lichaam tekenen afhankelijk van diepte
  const bodyInFront = p.segs.reduce((a, s) => a + s.z, 0) / p.segs.length > -2
  const boardEl = (
    <g>
      <path d={boardPath} fill="var(--accent)" stroke="var(--accent)" strokeWidth={5} strokeLinejoin="round" />
      <circle cx={p.board.nose[0]} cy={p.board.nose[1]} r={2.6} fill="var(--accent-ink)" />
    </g>
  )
  return (
    <g transform={`translate(${ox} ${oy})`} opacity={opacity}>
      {bodyInFront ? boardEl : null}
      {body}
      {headEl}
      {!bodyInFront ? boardEl : null}
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
      <g stroke="var(--muted)" strokeWidth={3} strokeLinecap="round">
        <line x1={wx(-0.4)} y1={wy(0.3)} x2={wx(0.4)} y2={wy(0.3)} />
        <line x1={wx(-0.3)} y1={wy(0.3)} x2={wx(-0.3)} y2={GROUND} strokeWidth={2} />
        <line x1={wx(0.3)} y1={wy(0.3)} x2={wx(0.3)} y2={GROUND} strokeWidth={2} />
      </g>
    )
  if (type === 'object') return <rect x={wx(-0.12)} y={GROUND - 10} width={20} height={10} rx={4} fill={fill} stroke={stroke} />
  return null
}

function SideScene({ anim, t, ghosts }: { anim: SideAnim; t: number; ghosts: boolean }) {
  const keys = useMemo(() => normalize(anim.keys, SIDE_DEFAULT), [anim])
  const k = sample(keys, t)
  const shadowW = Math.max(14, 46 - k.y * 30)
  const powder = anim.obstacle === 'pipe'
  return (
    <svg viewBox="0 0 320 190" className="h-full w-full" role="img" aria-label="Animatie van de trick">
      <g transform={`rotate(${anim.slope ?? 0} 160 ${GROUND})`}>
        <line x1={-40} y1={GROUND} x2={360} y2={GROUND} stroke="var(--line)" strokeWidth={2} />
        {Array.from({ length: 14 }, (_, i) => (
          <line key={i} x1={i * 26 - 10} y1={GROUND + 8} x2={i * 26 + 2} y2={GROUND + 8} stroke="var(--line)" strokeWidth={1} />
        ))}
        <ObstacleShape type={anim.obstacle} />
        <ellipse
          cx={wx(k.x)}
          cy={GROUND - (anim.obstacle === 'box' && Math.abs(k.x) < 0.4 ? 15 : 0)}
          rx={shadowW}
          ry={3}
          fill="var(--text)"
          opacity={0.08}
        />
        {ghosts && [0.12, 0.06].map((d) => (t - d > 0 ? <Rider key={d} k={sample(keys, t - d)} opacity={0.14} /> : null))}
        <Rider k={k} />
        {powder && (
          <path
            d={`M-40,${GROUND - 4} ${Array.from({ length: 18 }, (_, i) => `Q${i * 24 - 28},${GROUND - 12 - (i % 2) * 4} ${i * 24 - 16},${GROUND - 4}`).join(' ')} L360,${GROUND + 20} L-40,${GROUND + 20} Z`}
            fill="var(--surface)"
            opacity={0.92}
          />
        )}
      </g>
    </svg>
  )
}

function TopScene({ anim, t }: { anim: TopAnim & { trail?: 'skid' | 'carve' }; t: number }) {
  const keys = useMemo(() => normalize(anim.keys, TOP_DEFAULT), [anim])
  const k = sample(keys, t)
  const px = (x: number) => 160 + x * 120
  const py = (y: number) => 132 + y * 88
  const trail: string[] = []
  for (let s = 0; s <= t; s += 0.01) {
    const q = sample(keys, s)
    trail.push(`${px(q.x)},${py(q.y)}`)
  }
  const carve = anim.trail === 'carve'
  const edgeColor = k.edge === 'heel' ? 'var(--heel)' : k.edge === 'toe' ? 'var(--toe)' : 'var(--muted)'
  return (
    <svg viewBox="0 0 320 240" className="h-full w-full" role="img" aria-label="Bovenaanzicht van de bocht">
      {anim.scenery === 'trees' &&
        [
          [40, 60],
          [270, 40],
          [60, 190],
          [285, 170],
          [150, 30],
          [210, 120],
          [100, 120],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={14} fill="var(--accent-soft)" stroke="var(--accent-text)" strokeOpacity={0.4} />
            <circle cx={x} cy={y} r={3} fill="var(--muted)" />
          </g>
        ))}
      {anim.scenery === 'moguls' &&
        Array.from({ length: 12 }, (_, i) => (
          <ellipse
            key={i}
            cx={50 + (i % 4) * 75 + (Math.floor(i / 4) % 2) * 35}
            cy={45 + Math.floor(i / 4) * 75}
            rx={24}
            ry={14}
            fill="var(--surface-2)"
            stroke="var(--line)"
          />
        ))}
      {anim.scenery === 'lift' && (
        <g stroke="var(--muted)" strokeDasharray="4 6" strokeWidth={1.5}>
          <line x1={px(-0.15) + 14} y1={0} x2={px(-0.15) + 14} y2={240} />
        </g>
      )}
      <polyline
        points={trail.join(' ')}
        fill="none"
        stroke="var(--text)"
        strokeOpacity={carve ? 0.55 : 0.12}
        strokeWidth={carve ? 2 : 14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform={`translate(${px(k.x)} ${py(k.y)}) rotate(${k.angle})`}>
        <rect x={-24} y={-7} width={48} height={14} rx={7} fill="var(--accent)" />
        {/* heel edge = -y, toe edge = +y (regular) */}
        <line
          x1={-18}
          y1={k.edge === 'toe' ? 7 : -7}
          x2={18}
          y2={k.edge === 'toe' ? 7 : -7}
          stroke={edgeColor}
          strokeWidth={k.edge === 'flat' ? 0 : 3.5}
          strokeLinecap="round"
        />
        <circle cx={22} cy={0} r={2.6} fill="var(--accent-ink)" />
        <line x1={-11} y1={0} x2={11} y2={0} stroke="var(--text)" strokeWidth={6} strokeLinecap="round" />
        <circle cx={0} cy={2} r={6} fill="var(--text)" />
      </g>
    </svg>
  )
}

const SPEEDS = [0.25, 0.5, 1] as const

export function TrickAnimation({ anim, compact = false }: { anim: Anim; compact?: boolean }) {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const [ghosts, setGhosts] = useState(true)
  const goofy = settingsStore.use().goofy
  const raf = useRef<number>(0)
  const last = useRef<number | null>(null)
  const tRef = useRef(0)

  useEffect(() => {
    if (!playing) {
      last.current = null
      return
    }
    const tick = (now: number) => {
      if (last.current != null) {
        const dt = (now - last.current) / 1000
        let next = tRef.current + (dt * speed) / anim.duration
        if (next > 1.25) next = 0 // korte pauze aan het eind, dan opnieuw
        tRef.current = next
        setT(next)
      }
      last.current = now
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, speed, anim.duration])

  const tt = Math.min(1, t)
  const stepIdx = currentStep(anim.steps, tt)
  const sideKeys = useMemo(() => (anim.view === 'side' ? normalize(anim.keys, SIDE_DEFAULT) : null), [anim])
  const grab = sideKeys ? sample(sideKeys, tt) : null
  const jump = (v: number) => {
    tRef.current = v
    setT(v)
  }

  return (
    <div>
      <div className={cx('card relative overflow-hidden', compact ? 'aspect-[16/10]' : 'aspect-[16/11]')}>
        <div className="absolute inset-0" style={{ transform: goofy ? 'scaleX(-1)' : undefined }}>
          {anim.view === 'side' ? <SideScene anim={anim} t={tt} ghosts={ghosts} /> : <TopScene anim={anim} t={tt} />}
        </div>
        <div className="label absolute left-3 top-3">
          {anim.view === 'side' ? 'Zijaanzicht' : 'Bovenaanzicht'} · {goofy ? 'goofy' : 'regular'}
        </div>
        {grab?.grab && grab.g > 0.5 && (
          <div className="label absolute right-3 top-3 rounded-full bg-accent px-2 py-0.5 !text-accent-ink">{grab.grab}</div>
        )}
        {anim.view === 'top' && (
          <>
            <div className="label absolute right-3 top-3 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <i className="inline-block size-2 rounded-sm bg-heel" />
                heel
              </span>
              <span className="flex items-center gap-1">
                <i className="inline-block size-2 rounded-sm bg-toe" />
                toe
              </span>
            </div>
            {compact && <div className="label absolute bottom-3 right-3">dal ↓</div>}
            {!compact && <div className="label absolute right-3 top-8">dal ↓</div>}
          </>
        )}
      </div>
      {!compact && (
        <div className="mt-2 flex min-h-12 items-start gap-2 rounded-2xl border hairline bg-surface px-3 py-2.5 text-sm">
          <span className="num text-accent-text">{stepIdx >= 0 ? String(stepIdx + 1).padStart(2, '0') : '00'}</span>
          <span key={stepIdx} className="pop-in">
            {stepIdx >= 0 ? anim.steps[stepIdx].label : 'Klaar voor de start'}
          </span>
        </div>
      )}
      {!compact && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <button
              aria-label={playing ? 'Pauze' : 'Afspelen'}
              onClick={() => {
                sfx.tap()
                setPlaying((p) => !p)
              }}
              className="grid size-11 place-items-center rounded-full bg-accent text-accent-ink active:scale-95"
            >
              <Icon name={playing ? 'pause' : 'play'} size={18} />
            </button>
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
              className="flex-1 accent-[var(--accent)]"
              aria-label="Tijdlijn"
            />
            <button
              aria-label="Opnieuw"
              onClick={() => jump(0)}
              className="grid size-9 place-items-center rounded-full border hairline text-muted"
            >
              <Icon name="replay" size={16} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cx(
                  'num h-8 rounded-full border px-3 text-xs',
                  speed === s ? 'border-accent bg-accent text-accent-ink' : 'hairline text-muted',
                )}
              >
                {s === 1 ? '1×' : `${s}×`}
              </button>
            ))}
            <span className="flex-1" />
            {anim.view === 'side' && (
              <button
                onClick={() => setGhosts((g) => !g)}
                className={cx(
                  'flex h-8 items-center gap-1 rounded-full border px-3 text-xs',
                  ghosts ? 'border-accent text-accent-text' : 'hairline text-muted',
                )}
              >
                <Icon name="trail" size={14} /> Sporen
              </button>
            )}
            <button
              onClick={() => updateSettings({ goofy: !goofy })}
              className={cx(
                'flex h-8 items-center gap-1 rounded-full border px-3 text-xs',
                goofy ? 'border-accent text-accent-text' : 'hairline text-muted',
              )}
            >
              <Icon name="mirror" size={14} /> Goofy
            </button>
          </div>
          <ol className="mt-4 space-y-1.5">
            {anim.steps.map((s, i) => (
              <li key={i}>
                <button
                  onClick={() => {
                    jump(s.t)
                    setPlaying(false)
                  }}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition',
                    i === stepIdx ? 'bg-accent-soft text-text' : 'text-muted',
                  )}
                >
                  <span className={cx('num mt-px text-xs', i === stepIdx ? 'text-accent-text' : '')}>{String(i + 1).padStart(2, '0')}</span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
