// Crew-awards aan het eind van een trip: uitgerekend uit de dagen die de crew gedeeld heeft.
// Puur (geen netwerk) en afgeleid, zoals XP: niets wordt opgeslagen. Bij gelijkspel winnen ze samen.
import type { IconName } from '../design/icons'
import { TRICK_BY_ID } from '../content/tricks'
import type { SharedDay } from './crewTrips'

export interface Award {
  id: string
  title: string
  icon: IconName
  /** winnaar(s), bij gelijkspel meer */
  userIds: string[]
  /** wat ze haalden, kort: "14 u", "Ollie" */
  value: string
  blurb: string
}

interface Rider {
  userId: string
  days: number
  hours: number
  falls: number
  moodSum: number
  landed: Set<string>
  black: number
  powder: number
  pains: number
  /** eerste dag waarop iemand een trick landde, met die trick */
  firstLanded?: { date: string; trick: string }
}

const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')

/** Iedereen met de hoogste (of laagste) score; niemand als de beste score 0 is of iedereen gelijk staat. */
function leaders(riders: Rider[], score: (r: Rider) => number | null, low = false): Rider[] {
  const scored = riders.map((r) => ({ r, s: score(r) })).filter((x): x is { r: Rider; s: number } => x.s !== null)
  if (scored.length < 2) return []
  const best = low ? Math.min(...scored.map((x) => x.s)) : Math.max(...scored.map((x) => x.s))
  if (!low && best <= 0) return []
  const top = scored.filter((x) => x.s === best).map((x) => x.r)
  return top.length === scored.length ? [] : top
}

export function crewAwards(days: SharedDay[]): Award[] {
  const by = new Map<string, Rider>()
  for (const { user_id, data: s } of [...days].sort((a, b) => a.data.date.localeCompare(b.data.date))) {
    const r = by.get(user_id) ?? {
      userId: user_id,
      days: 0,
      hours: 0,
      falls: 0,
      moodSum: 0,
      landed: new Set<string>(),
      black: 0,
      powder: 0,
      pains: 0,
    }
    r.days++
    r.hours += s.hours || 0
    r.falls += s.falls || 0
    r.moodSum += s.mood || 0
    for (const t of s.landed ?? []) r.landed.add(t)
    if (s.pistes?.includes('zwart')) r.black++
    if (s.snow === 'poeder' || s.snow === 'vers') r.powder++
    r.pains += s.pains?.length ?? 0
    if (!r.firstLanded && s.landed?.length) r.firstLanded = { date: s.date, trick: s.landed[0] }
    by.set(user_id, r)
  }
  const riders = [...by.values()]
  if (riders.length < 2) return []

  const awards: Award[] = []
  const add = (a: Omit<Award, 'userIds' | 'value'>, top: Rider[], value: (r: Rider) => string) => {
    if (top.length) awards.push({ ...a, userIds: top.map((r) => r.userId), value: value(top[0]) })
  }
  const trick = (id: string) => TRICK_BY_ID.get(id)?.name ?? id

  add(
    { id: 'uren', title: 'Langst op de plank', icon: 'clock', blurb: 'Eerste lift, laatste lift.' },
    leaders(riders, (r) => r.hours),
    (r) => `${oneDecimal(r.hours)} u`,
  )
  add(
    { id: 'tricks', title: 'Trickmachine', icon: 'bolt', blurb: 'De meeste verschillende tricks geland.' },
    leaders(riders, (r) => r.landed.size),
    (r) => `${r.landed.size} tricks`,
  )
  // eerste nieuwe trick: wie het vroegst in de trip iets landde
  const withFirst = riders.filter((r) => r.firstLanded)
  if (withFirst.length) {
    const first = withFirst.reduce((a, r) => (r.firstLanded!.date < a ? r.firstLanded!.date : a), withFirst[0].firstLanded!.date)
    const top = withFirst.filter((r) => r.firstLanded!.date === first)
    if (top.length < riders.length)
      add({ id: 'eerste', title: 'Eerste nieuwe trick', icon: 'star', blurb: 'Zette de toon voor de rest.' }, top, (r) =>
        trick(r.firstLanded!.trick),
      )
  }
  add(
    { id: 'vallen', title: 'Valkampioen', icon: 'impact', blurb: 'Wie niet valt, probeert niks. Respect.' },
    leaders(riders, (r) => r.falls),
    (r) => `${r.falls}x`,
  )
  // minste vallen per uur, alleen wie echt gereden heeft
  add(
    { id: 'plakband', title: 'Zat erop geplakt', icon: 'check', blurb: 'Minste valpartijen per uur.' },
    leaders(riders, (r) => (r.hours >= 3 ? r.falls / r.hours : null), true),
    (r) => `${oneDecimal(r.falls / r.hours)} per uur`,
  )
  add(
    { id: 'mood', title: 'Zonnetje van de crew', icon: 'sun', blurb: 'Hoogste mood, ook bij slecht zicht.' },
    leaders(riders, (r) => Math.round((r.moodSum / r.days) * 10) / 10),
    (r) => `${oneDecimal(r.moodSum / r.days)} gemiddeld`,
  )
  add(
    { id: 'zwart', title: 'Zwartrijder', icon: 'mountain', blurb: 'Vaakst op een zwarte piste.' },
    leaders(riders, (r) => r.black),
    (r) => `${r.black} ${r.black === 1 ? 'dag' : 'dagen'}`,
  )
  add(
    { id: 'poeder', title: 'Poedersnuiver', icon: 'snowflake', blurb: 'Vond de verse sneeuw.' },
    leaders(riders, (r) => r.powder),
    (r) => `${r.powder} ${r.powder === 1 ? 'dag' : 'dagen'}`,
  )
  add(
    { id: 'pijn', title: 'Ibuprofen-award', icon: 'bandage', blurb: 'Meeste pijntjes gelogd. Beterschap.' },
    leaders(riders, (r) => r.pains),
    (r) => `${r.pains}x`,
  )
  add(
    { id: 'trouw', title: 'Elke dag erop', icon: 'calendar', blurb: 'Meeste dagen gelogd.' },
    leaders(riders, (r) => r.days),
    (r) => `${r.days} dagen`,
  )
  return awards
}
