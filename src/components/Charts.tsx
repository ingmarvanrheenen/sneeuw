// Kleine, rustige SVG-charts. Eén serie per chart (accentkleur), dunne marks,
// afgeronde data-eindes op de baseline, recessieve as, tik voor de waarde.
import { useState, type ReactNode } from 'react'
import { cx } from './ui'

interface Datum {
  label: string
  value: number
  /** optioneel eigen x-label element (bijv. een icoon) */
  tick?: ReactNode
  detail?: string
}

export function BarChart({
  data,
  height = 140,
  unit = '',
  ariaLabel,
}: {
  data: Datum[]
  height?: number
  unit?: string
  ariaLabel: string
}) {
  const [sel, setSel] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const W = 320
  const H = height
  const pad = { t: 22, b: 4 }
  const gap = 2
  const bw = Math.max(4, (W - gap * (data.length - 1)) / data.length)
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b)
  const active = sel ?? data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
        <line x1={0} x2={W} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" strokeWidth={1} />
        {[0.5, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 4" />
        ))}
        {data.map((d, i) => {
          const x = i * (bw + gap)
          const top = y(d.value)
          const h = H - pad.b - top
          const r = Math.min(4, bw / 2, h)
          return (
            <g key={i} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              {d.value > 0 && (
                <path
                  d={`M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - pad.b} Z`}
                  fill="var(--accent-text)"
                  opacity={i === active ? 1 : 0.45}
                />
              )}
              {i === active && d.value > 0 && (
                <text x={x + bw / 2} y={top - 6} textAnchor="middle" fill="var(--text)" style={{ font: '600 12px var(--font-sans)' }}>
                  {Number.isInteger(d.value) ? d.value : d.value.toFixed(1)}
                  {unit}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex" style={{ gap }}>
        {data.map((d, i) => (
          <button
            key={i}
            onClick={() => setSel(i)}
            className={cx('label flex-1 truncate text-center !text-[9px]', i === active && '!text-text')}
          >
            {d.tick ?? d.label}
          </button>
        ))}
      </div>
      {data[active]?.detail && <div className="mt-2 text-xs text-muted">{data[active].detail}</div>}
    </div>
  )
}

export function LineChart({
  data,
  height = 140,
  ariaLabel,
  unit = '',
}: {
  data: Datum[]
  height?: number
  ariaLabel: string
  unit?: string
}) {
  const [sel, setSel] = useState<number | null>(null)
  if (data.length < 2) return <div className="py-8 text-center text-sm text-muted">Minstens 2 dagen nodig voor een lijn.</div>
  const W = 320
  const H = height
  const pad = { t: 22, b: 8, l: 6, r: 6 }
  const max = Math.max(0.5, ...data.map((d) => d.value))
  const x = (i: number) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b)
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const active = sel ?? data.length - 1
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const rel = ((e.clientX - rect.left) / rect.width) * W
          setSel(Math.max(0, Math.min(data.length - 1, Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (data.length - 1)))))
        }}
      >
        <line x1={0} x2={W} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" />
        <line x1={x(active)} x2={x(active)} y1={pad.t - 6} y2={H - pad.b} stroke="var(--line)" strokeDasharray="2 3" />
        <polyline points={pts} fill="none" stroke="var(--accent-text)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(active)} cy={y(data[active].value)} r={5} fill="var(--accent-text)" stroke="var(--surface)" strokeWidth={2} />
        <text
          x={active > data.length / 2 ? W - 2 : 2}
          y={12}
          textAnchor={active > data.length / 2 ? 'end' : 'start'}
          fill="var(--text)"
          style={{ font: '600 12px var(--font-sans)' }}
        >
          {data[active].label} · {data[active].value.toFixed(1)}
          {unit}
        </text>
      </svg>
    </div>
  )
}

export function HBar({ label, value, total, right }: { label: string; value: number; total: number; right?: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="num text-muted">{right ?? `${value}/${total}`}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent-text" style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
      </div>
    </div>
  )
}
