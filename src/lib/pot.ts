// Potje van de trip: uitgaven van de crew (wie betaalde, voor wie, gelijk verdeeld) en wie nog wie moet betalen.
// Bedragen in centen (geen afrondingsgedoe). De stand en de terugbetalingen rekent de app uit; de database
// bewaakt dat iedereen in de crew zit (zie migratie 20261110000000_crew_trip_expenses).
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import type { CrewMember } from './crew'

export interface Expense {
  id: string
  trip_id: string
  crew_id: string
  kind: 'expense' | 'transfer'
  title: string
  amount_cents: number
  paid_by: string
  split_between: string[]
  spent_on: string | null
  created_by: string
  created_at: string
}

export interface ExpenseInput {
  title: string
  amount_cents: number
  paid_by: string
  split_between: string[]
  spent_on?: string | null
}

export interface Payment {
  from: string
  to: string
  cents: number
}

export const MAX_CENTS = 10_000_000

/** "12,50", "12.5", "€ 12", "1.234,50" → centen. Ongeldig of niet positief: null. */
export function parseEuro(input: string): number | null {
  let s = input.replace(/[€\s]/g, '')
  if (!s) return null
  // 1.234,50 → 1234.50; 1,234.50 → 1234.50
  if (s.includes(',') && s.includes('.'))
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else s = s.replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(parseFloat(s) * 100)
  return cents > 0 && cents <= MAX_CENTS ? cents : null
}

/** 1250 → "€ 12,50", 1200 → "€ 12" */
export function fmtEuro(cents: number): string {
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100).toLocaleString('nl-NL')
  const rest = abs % 100
  return `${cents < 0 ? '-' : ''}€ ${whole}${rest ? ',' + String(rest).padStart(2, '0') : ''}`
}

/** Gelijk verdelen in centen; wat overblijft gaat cent voor cent naar de eersten (op id, dus overal hetzelfde). */
export function shares(cents: number, ids: string[]): Map<string, number> {
  const sorted = [...new Set(ids)].sort()
  const out = new Map<string, number>()
  if (!sorted.length) return out
  const base = Math.floor(cents / sorted.length)
  let rest = cents - base * sorted.length
  for (const id of sorted) out.set(id, base + (rest-- > 0 ? 1 : 0))
  return out
}

/** Stand per persoon: positief = krijgt nog geld, negatief = moet nog betalen. Telt altijd op tot 0. */
export function balances(expenses: Pick<Expense, 'amount_cents' | 'paid_by' | 'split_between'>[]): Map<string, number> {
  const b = new Map<string, number>()
  const add = (id: string, c: number) => b.set(id, (b.get(id) ?? 0) + c)
  for (const e of expenses) {
    add(e.paid_by, e.amount_cents)
    for (const [id, c] of shares(e.amount_cents, e.split_between)) add(id, -c)
  }
  return b
}

/**
 * Wie betaalt wie: steeds de grootste schuld naar het grootste tegoed. Zo zijn het er hooguit (mensen - 1), en
 * meestal minder. Gelijke bedragen: op id, zodat iedereen dezelfde lijst ziet.
 */
export function settle(b: Map<string, number>): Payment[] {
  const pos = [...b].filter(([, c]) => c > 0).map(([id, c]) => ({ id, c }))
  const neg = [...b].filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c }))
  const order = (a: { id: string; c: number }, z: { id: string; c: number }) => z.c - a.c || a.id.localeCompare(z.id)
  const out: Payment[] = []
  for (;;) {
    pos.sort(order)
    neg.sort(order)
    const to = pos[0]
    const from = neg[0]
    if (!to || !from) break
    const cents = Math.min(to.c, from.c)
    out.push({ from: from.id, to: to.id, cents })
    to.c -= cents
    from.c -= cents
    if (!to.c) pos.shift()
    if (!from.c) neg.shift()
  }
  return out
}

/** Wat de crew uitgaf (zonder terugbetalingen), en wat jouw deel daarvan was. */
export function totals(expenses: Expense[], me: string) {
  const real = expenses.filter((e) => e.kind === 'expense')
  return {
    spent: real.reduce((n, e) => n + e.amount_cents, 0),
    mine: real.reduce((n, e) => n + (shares(e.amount_cents, e.split_between).get(me) ?? 0), 0),
  }
}

/** Mag jij deze aanpassen of weghalen? (zelfde regel als de database) */
export const canChange = (e: Pick<Expense, 'created_by' | 'paid_by'>, me: string, tripOwner?: string) =>
  e.created_by === me || e.paid_by === me || tripOwner === me

// ── Data ──────────────────────────────────────────────────────────────────────

function need() {
  if (!supabase) throw new Error('Het potje werkt alleen met een gekoppelde server.')
  return supabase
}

const COLS = 'id, trip_id, crew_id, kind, title, amount_cents, paid_by, split_between, spent_on, created_by, created_at'
const key = (tripId: string) => `pot:${tripId}`

/** Laatst bekende stand, ook met de namen (op de berg wil je hem ook zonder bereik zien). */
export const cachedPot = (tripId: string) => kvGet<{ expenses: Expense[]; members: CrewMember[] } | null>(key(tripId), null)
export const rememberPot = (tripId: string, expenses: Expense[], members: CrewMember[]) => kvSet(key(tripId), { expenses, members })

export async function listExpenses(tripId: string): Promise<Expense[]> {
  const { data, error } = await need()
    .from('crew_trip_expenses')
    .select(COLS)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Expense[]
}

const clean = (i: ExpenseInput) => ({
  title: i.title.trim().slice(0, 80),
  amount_cents: i.amount_cents,
  paid_by: i.paid_by,
  split_between: [...new Set(i.split_between)],
  spent_on: i.spent_on ?? null,
})

export function checkInput(i: ExpenseInput): string | null {
  if (!i.title.trim()) return 'Waar was het voor?'
  if (!Number.isInteger(i.amount_cents) || i.amount_cents <= 0 || i.amount_cents > MAX_CENTS) return 'Vul een bedrag in'
  if (!i.split_between.length) return 'Kies voor wie het was'
  return null
}

export async function addExpense(crewId: string, tripId: string, i: ExpenseInput) {
  const bad = checkInput(i)
  if (bad) throw new Error(bad)
  const { error } = await need()
    .from('crew_trip_expenses')
    .insert({ trip_id: tripId, crew_id: crewId, kind: 'expense', ...clean(i) })
  if (error) throw error
}

export async function updateExpense(id: string, i: ExpenseInput) {
  const bad = checkInput(i)
  if (bad) throw new Error(bad)
  const { error } = await need().from('crew_trip_expenses').update(clean(i)).eq('id', id)
  if (error) throw error
}

export async function removeExpense(id: string) {
  const { error } = await need().from('crew_trip_expenses').delete().eq('id', id)
  if (error) throw error
}

/** Een terugbetaling vastleggen: `from` gaf `to` dit bedrag. */
export async function recordPayment(crewId: string, tripId: string, p: Payment) {
  const { error } = await need()
    .from('crew_trip_expenses')
    .insert({
      trip_id: tripId,
      crew_id: crewId,
      kind: 'transfer',
      title: 'Terugbetaald',
      amount_cents: p.cents,
      paid_by: p.from,
      split_between: [p.to],
    })
  if (error) throw error
}
