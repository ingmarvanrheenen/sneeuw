// Crew-doel van de week: één gezamenlijk doel per crew per week (ma t/m zo), gevuld met de dagen die je met de
// crew deelt. Afgeleid, niets opgeslagen: iedereen in de crew krijgt dezelfde keuze (seed = crew + week), en de
// doelen schalen mee met hoeveel jullie zijn.
import { parseISO } from './format'
import { pick, seeded } from './random'
import type { Session } from './types'

export type CrewGoalKind = 'uren' | 'dagen' | 'tricks' | 'rood' | 'iedereen'

export interface CrewGoal {
  kind: CrewGoalKind
  title: string
  target: number
  /** eenheid achter het getal ("uur", "dagen", ...) */
  unit: string
}

export interface CrewGoalProgress {
  value: number
  target: number
  done: boolean
  /** bijdrage per crewlid, hoogste eerst (alleen wie iets bijdroeg) */
  perMember: { userId: string; value: number }[]
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** De week (maandag t/m zondag) waar deze dag in valt. `key` is de maandag. */
export function weekOf(today: string): { from: string; to: string; key: string; daysLeft: number } {
  const d = parseISO(today)
  const back = (d.getDay() + 6) % 7 // maandag = 0
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back)
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
  return { from: iso(mon), to: iso(sun), key: iso(mon), daysLeft: 6 - back }
}

const KINDS: CrewGoalKind[] = ['uren', 'dagen', 'tricks', 'rood', 'iedereen']

/** Het doel van deze crew voor deze week. Met z'n tweeën of meer; doelen schalen mee met de crew. */
export function crewGoal(crewId: string, weekKey: string, members: number): CrewGoal {
  const n = Math.max(2, members)
  const kind = pick(KINDS, 1, seeded(`crewdoel:${crewId}:${weekKey}`))[0]
  switch (kind) {
    case 'uren':
      return { kind, title: `Samen ${n * 4} uur op de plank`, target: n * 4, unit: 'uur' }
    case 'dagen':
      return { kind, title: `Samen ${n * 2} dagen op de plank`, target: n * 2, unit: 'dagen' }
    case 'tricks':
      return { kind, title: `Samen ${n * 2} tricks geland`, target: n * 2, unit: 'tricks' }
    case 'rood':
      return { kind, title: `Samen ${n * 2} dagen rood of zwart`, target: n * 2, unit: 'dagen' }
    case 'iedereen':
      // hier telt de echte crew: met z'n tweeën rekenen kan alleen als je ook met z'n tweeën bent
      return { kind, title: 'Iedereen minstens één dag op de plank', target: Math.max(1, members), unit: 'riders' }
  }
}

/** Hoe ver de crew is, uit de gedeelde dagen van deze week. Dubbele dagen (zelfde rider en datum) tellen één keer. */
export function crewGoalProgress(
  goal: CrewGoal,
  days: { userId: string; session: Pick<Session, 'date' | 'hours' | 'landed' | 'pistes'> }[],
  week: { from: string; to: string },
): CrewGoalProgress {
  const seen = new Set<string>()
  const per = new Map<string, number>()
  const add = (u: string, v: number) => {
    if (v) per.set(u, (per.get(u) ?? 0) + v)
  }
  const tricks = new Map<string, Set<string>>()
  for (const { userId, session: s } of days) {
    if (s.date < week.from || s.date > week.to) continue
    const k = `${userId}:${s.date}`
    if (seen.has(k)) continue
    seen.add(k)
    if (goal.kind === 'uren') add(userId, s.hours || 0)
    else if (goal.kind === 'dagen') add(userId, 1)
    else if (goal.kind === 'rood') add(userId, (s.pistes ?? []).some((p) => p === 'rood' || p === 'zwart') ? 1 : 0)
    else if (goal.kind === 'iedereen') per.set(userId, 1)
    else {
      // een trick die je twee keer landt telt één keer
      const mine = tricks.get(userId) ?? new Set<string>()
      for (const t of s.landed ?? [])
        if (!mine.has(t)) {
          mine.add(t)
          add(userId, 1)
        }
      tricks.set(userId, mine)
    }
  }
  const perMember = [...per].map(([userId, value]) => ({ userId, value: Math.round(value * 10) / 10 })).sort((a, b) => b.value - a.value)
  const value = Math.round(perMember.reduce((a, m) => a + m.value, 0) * 10) / 10
  return { value, target: goal.target, done: value >= goal.target, perMember }
}
