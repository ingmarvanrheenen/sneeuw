// Wekker voor de eerste lift: hoe laat je op moet (eerste lift min reizen, ontbijt en aankleden, en de
// warming-up), en een agenda-item met een melding, want een web-app kan op de iPhone geen echte wekker zetten.
import { kvGet, kvSet } from './db'
import type { Resort } from '../content/resorts'

export interface AlarmPlan {
  /** eerste lift, "08:30" */
  lift: string
  /** van je deur naar de lift, minuten */
  travel: number
  /** ontbijt, aankleden, boots aan, minuten */
  ready: number
  warmup: boolean
}

export const WARMUP_MIN = 5

/** Grove standaard voor de eerste lift: Oostenrijk vroeg, Frankrijk iets later, indoor pas om tien uur. */
export function defaultLift(r?: Pick<Resort, 'country' | 'indoor'>): string {
  if (!r) return '08:30'
  if (r.indoor) return '10:00'
  return r.country === 'FR' ? '09:00' : '08:30'
}

export const DEFAULT_PLAN: AlarmPlan = { lift: '08:30', travel: 15, ready: 45, warmup: true }

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}
const fromMin = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Hoe laat je op moet, "07:25"; ongeldige lifttijd geeft null. */
export function wakeTime(p: AlarmPlan): string | null {
  const lift = toMin(p.lift)
  if (!Number.isFinite(lift)) return null
  return fromMin(lift - p.travel - p.ready - (p.warmup ? WARMUP_MIN : 0))
}

/** Hoeveel minuten je tussen opstaan en de lift hebt, voor de uitleg. */
export const totalMin = (p: AlarmPlan) => p.travel + p.ready + (p.warmup ? WARMUP_MIN : 0)

const stamp = (date: string, hhmm: string) => `${date.replace(/-/g, '')}T${hhmm.replace(':', '')}00`
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

/**
 * Agenda-item (iCalendar) op je wektijd, tien minuten lang, met een melding op dat moment. Tijden zonder
 * tijdzone: je telefoon leest ze als lokale tijd, en dat is waar je bent.
 */
export function alarmIcs(date: string, plan: AlarmPlan, where = ''): string | null {
  const wake = wakeTime(plan)
  if (!wake) return null
  const end = fromMin(toMin(wake) + 10)
  const title = `Opstaan: eerste lift om ${plan.lift}${where ? ` in ${where}` : ''}`
  const body = `${plan.ready} min ontbijt en aankleden, ${plan.travel} min naar de lift${plan.warmup ? `, ${WARMUP_MIN} min warming-up` : ''}.`
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sneeuw Daddy//Wekker//NL',
    'BEGIN:VEVENT',
    `UID:wekker-${date}@sneeuwdaddy.app`,
    `DTSTAMP:${stamp(date, wake)}`,
    `DTSTART:${stamp(date, wake)}`,
    `DTEND:${stamp(date, end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(body)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

/** Opgeslagen: reizen, klaarmaken en warming-up voor alles; de eerste lift per resort. */
interface Saved {
  travel?: number
  ready?: number
  warmup?: boolean
  lifts?: Record<string, string>
}
const KEY = 'alarm'

export async function loadPlan(resort?: Pick<Resort, 'id' | 'country' | 'indoor'>): Promise<AlarmPlan> {
  const s = await kvGet<Saved>(KEY, {})
  return {
    lift: s.lifts?.[resort?.id ?? '-'] ?? defaultLift(resort),
    travel: s.travel ?? DEFAULT_PLAN.travel,
    ready: s.ready ?? DEFAULT_PLAN.ready,
    warmup: s.warmup ?? DEFAULT_PLAN.warmup,
  }
}

export async function savePlan(p: AlarmPlan, resortId?: string) {
  const s = await kvGet<Saved>(KEY, {})
  await kvSet(KEY, { travel: p.travel, ready: p.ready, warmup: p.warmup, lifts: { ...s.lifts, [resortId ?? '-']: p.lift } })
}

/** Voor welke dag de wekker is: morgen, of vandaag als het nog nacht is (voor vijf uur). */
export function alarmDate(now = new Date()): string {
  const d = new Date(now)
  if (d.getHours() >= 5) d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
