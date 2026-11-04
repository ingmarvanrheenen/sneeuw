// Potje van de trip: uitgaven van de crew (wie betaalde, voor wie, gelijk of in delen) en wie nog wie moet betalen.
// In euro of CHF: een CHF-uitgave krijgt de vaste koers van de trip, en telt in de stand in euro's
// (zie migratie 20261120000000_crew_trip_expenses_more).
// Bedragen in centen (geen afrondingsgedoe). De stand en de terugbetalingen rekent de app uit; de database
// bewaakt dat iedereen in de crew zit (zie migratie 20261110000000_crew_trip_expenses).
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import type { CrewMember } from './crew'
import { db } from './db'
import type { MediaMeta } from './types'

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
  currency?: Currency
  /** wat je echt betaalde, in centen van de valuta (alleen bij CHF) */
  orig_cents?: number | null
  /** euro per frank */
  rate?: number | null
  /** delen per persoon, in de volgorde van split_between; leeg = gelijk */
  weights?: number[] | null
  /** foto van het bonnetje (media-id) */
  receipt?: string | null
}

export type Currency = 'EUR' | 'CHF'

export interface ExpenseInput {
  title: string
  amount_cents: number
  paid_by: string
  split_between: string[]
  spent_on?: string | null
  currency?: Currency
  orig_cents?: number | null
  rate?: number | null
  weights?: number[] | null
  receipt?: string | null
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

/**
 * Verdelen in centen: gelijk, of naar delen per persoon (`weights` in de volgorde van `ids`). Wat overblijft gaat
 * cent voor cent naar wie het dichtst bij een cent meer zat, en bij gelijk op id: overal dezelfde uitkomst.
 */
export function shares(cents: number, ids: string[], weights?: number[] | null): Map<string, number> {
  const w = new Map<string, number>()
  ids.forEach((id, i) => {
    if (!w.has(id)) w.set(id, weights && weights.length === ids.length ? Math.max(1, Math.round(weights[i])) : 1)
  })
  const sorted = [...w.keys()].sort()
  const out = new Map<string, number>()
  if (!sorted.length) return out
  const total = sorted.reduce((a, id) => a + w.get(id)!, 0)
  const exact = sorted.map((id) => ({ id, v: (cents * w.get(id)!) / total }))
  for (const x of exact) out.set(x.id, Math.floor(x.v))
  let rest = cents - [...out.values()].reduce((a, b) => a + b, 0)
  for (const x of [...exact].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || a.id.localeCompare(b.id))) {
    if (rest-- <= 0) break
    out.set(x.id, out.get(x.id)! + 1)
  }
  return out
}

/** De vaste koers van de trip: die van de eerste CHF-uitgave, of null als er nog geen is. */
export function tripRate(expenses: Pick<Expense, 'currency' | 'rate' | 'created_at'>[]): number | null {
  const chf = expenses.filter((e) => e.currency === 'CHF' && e.rate).sort((a, b) => a.created_at.localeCompare(b.created_at))
  return chf[0]?.rate ?? null
}

/** CHF naar euro-centen met de koers (euro per frank). */
export const toEuro = (chfCents: number, rate: number) => Math.round(chfCents * rate)

/** "1,06" of "1.06" → 1.06; ongeldig (of buiten 0..10) → null. */
export function parseRate(input: string): number | null {
  const s = input.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null
  const r = parseFloat(s)
  return r > 0 && r < 10 ? r : null
}

/** 1250 → "CHF 12,50" */
export const fmtChf = (cents: number) => fmtEuro(cents).replace('€', 'CHF')

/** Stand per persoon: positief = krijgt nog geld, negatief = moet nog betalen. Telt altijd op tot 0. */
export function balances(expenses: Pick<Expense, 'amount_cents' | 'paid_by' | 'split_between' | 'weights'>[]): Map<string, number> {
  const b = new Map<string, number>()
  const add = (id: string, c: number) => b.set(id, (b.get(id) ?? 0) + c)
  for (const e of expenses) {
    add(e.paid_by, e.amount_cents)
    for (const [id, c] of shares(e.amount_cents, e.split_between, e.weights)) add(id, -c)
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
    mine: real.reduce((n, e) => n + (shares(e.amount_cents, e.split_between, e.weights).get(me) ?? 0), 0),
  }
}

/** De stand als regels voor de deelkaart: "Noor betaalt Sam" en het bedrag, of iedereen quitte. */
export function potLines(payments: Payment[], name: (id: string) => string): { text: string; amount: string }[] {
  return payments.map((p) => ({ text: `${name(p.from)} betaalt ${name(p.to)}`, amount: fmtEuro(p.cents) }))
}

/** Mag jij deze aanpassen of weghalen? (zelfde regel als de database) */
export const canChange = (e: Pick<Expense, 'created_by' | 'paid_by'>, me: string, tripOwner?: string) =>
  e.created_by === me || e.paid_by === me || tripOwner === me

// ── Data ──────────────────────────────────────────────────────────────────────

function need() {
  if (!supabase) throw new Error('Het potje werkt alleen met een gekoppelde server.')
  return supabase
}

const COLS =
  'id, trip_id, crew_id, kind, title, amount_cents, paid_by, split_between, spent_on, created_by, created_at, currency, orig_cents, rate, weights, receipt'
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

const clean = (i: ExpenseInput) => {
  const split = [...new Set(i.split_between)]
  const chf = i.currency === 'CHF' && i.orig_cents && i.rate
  // delen alleen bewaren als ze niet allemaal gelijk zijn
  const weights = i.weights && i.weights.length === split.length && new Set(i.weights).size > 1 ? i.weights : null
  return {
    title: i.title.trim().slice(0, 80),
    amount_cents: chf ? toEuro(i.orig_cents!, i.rate!) : i.amount_cents,
    paid_by: i.paid_by,
    split_between: split,
    spent_on: i.spent_on ?? null,
    currency: chf ? ('CHF' as const) : ('EUR' as const),
    orig_cents: chf ? i.orig_cents! : null,
    rate: chf ? i.rate! : null,
    weights,
    receipt: i.receipt ?? null,
  }
}

export function checkInput(i: ExpenseInput): string | null {
  if (!i.title.trim()) return 'Waar was het voor?'
  if (i.currency === 'CHF' && !(i.orig_cents && i.rate)) return 'Vul het bedrag in CHF en de koers in'
  // bij CHF telt het euro-bedrag dat uit de koers komt
  const eur = i.currency === 'CHF' ? toEuro(i.orig_cents!, i.rate!) : i.amount_cents
  if (!Number.isInteger(eur) || eur <= 0 || eur > MAX_CENTS) return 'Vul een bedrag in'
  if (!i.split_between.length) return 'Kies voor wie het was'
  if (i.weights && i.weights.some((w) => !Number.isInteger(w) || w < 1 || w > 20)) return 'Delen per persoon: 1 tot 20'
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

/** Het bonnetje bij een uitgave: van dit toestel, of (van een crewgenoot) met de crew gedeeld op de server. */
export async function loadReceipt(id: string): Promise<MediaMeta | null> {
  const local = (await db.records.get(id)) as MediaMeta | undefined
  if (local && !local.deleted) return local
  if (!supabase) return null
  const { data } = await supabase.from('records').select('user_id, data').eq('id', id).eq('kind', 'media').maybeSingle()
  const row = data as { user_id: string; data: MediaMeta } | null
  return row ? { ...row.data, userId: row.data.userId ?? row.user_id } : null
}
