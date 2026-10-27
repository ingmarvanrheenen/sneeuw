const DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export function parseISO(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function fmtDate(d: string, withDay = false) {
  const date = parseISO(d)
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
  return withDay ? `${DAYS[date.getDay()]} ${base}` : base
}

export function fmtShort(d: string) {
  const date = parseISO(d)
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`
}

export function daysUntil(d: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((parseISO(d).getTime() - today.getTime()) / 86400000)
}

/** "1 dag", "3 dagen". */
export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** Winterseizoen loopt van augustus t/m juli: "25/26". */
export function seasonOf(d: string) {
  const date = parseISO(d)
  const y = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1
  return `${String(y).slice(2)}/${String(y + 1).slice(2)}`
}
