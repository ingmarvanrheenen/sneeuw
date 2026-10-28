// Season Wrapped: je seizoen als een reeks story-kaarten, uitgerekend uit je gelogde dagen.
// Puur en afgeleid, zoals XP: niets wordt opgeslagen. Een seizoen loopt van juli t/m juni (zie seasonOf in format.ts).
import type { IconName } from '../design/icons'
import { MOOD_LABELS } from '../design/icons'
import { TRICK_BY_ID } from '../content/tricks'
import { PISTES, SNOW } from '../content/logOptions'
import { fmtShort, seasonOf } from './format'
import { levelFor, totalXP, type ProgressInput } from './progress'
import type { Session } from './types'

export interface WrappedCard {
  id: string
  icon: IconName
  /** groot getal of woord, in de display-letter */
  big: string
  title: string
  body: string
}

/** Seizoenslabel van een dag, bijv. "26/27". */
export { seasonOf }

/** Seizoenen waarin je iets gelogd hebt, nieuwste eerst. */
export function seasonsWithData(sessions: Session[]): string[] {
  return [...new Set(sessions.filter((s) => !s.deleted).map((s) => seasonOf(s.date)))].sort().reverse()
}

const round1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Meest voorkomende waarde, met aantal. Bij gelijkspel wint wat het eerst voorkwam. */
function most<T>(xs: T[]): { value: T; count: number } | null {
  const counts = new Map<T, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  let best: { value: T; count: number } | null = null
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count }
  return best
}

const PISTE_ON: Record<string, string> = {
  groen: 'groene pistes',
  blauw: 'blauwe pistes',
  rood: 'rode pistes',
  zwart: 'zwarte pistes',
  park: 'het park',
  offpiste: 'off-piste',
}

const SNOW_LINES: Record<string, string> = {
  poeder: 'Je zocht de poeder op, en vond hem.',
  vers: 'Verse sneeuw onder je board. Lucky.',
  groomed: 'Corduroy-liefhebber: strak geprepareerd.',
  hard: 'Harde pistes. Je edges hebben het zwaar gehad.',
  ijs: 'IJs. Respect dat je bleef staan.',
  slush: 'Slush en zon: lente-snowboarder.',
  crud: 'Crud gereden en overleefd.',
  indoor: 'Indoorhal-held: sneeuw onder een dak.',
}

export function wrapped(input: ProgressInput, season: string): WrappedCard[] {
  const days = input.sessions.filter((s) => !s.deleted && seasonOf(s.date) === season).sort((a, b) => a.date.localeCompare(b.date))
  if (!days.length) return []
  const cards: WrappedCard[] = []
  const resorts = most(days.map((s) => s.resortName).filter(Boolean))
  const resortCount = new Set(days.map((s) => s.resortName).filter(Boolean)).size
  const dayCount = new Set(days.map((s) => s.date)).size

  cards.push({
    id: 'intro',
    icon: 'snowflake',
    big: season,
    title: 'Jouw seizoen',
    body: `${plural(dayCount, 'dag', 'dagen')} op de plank${resortCount ? `, ${plural(resortCount, 'resort', 'resorts')}` : ''}. Tik om door te gaan.`,
  })

  const hours = days.reduce((a, s) => a + (s.hours || 0), 0)
  const longest = [...days].sort((a, b) => b.hours - a.hours)[0]
  if (hours > 0)
    cards.push({
      id: 'uren',
      icon: 'clock',
      big: round1(hours),
      title: 'uur op de plank',
      body: `Dat zijn ${plural(Math.max(1, Math.round(hours / 2)), 'film', 'films')}. Je langste dag: ${round1(longest.hours)} u${longest.resortName ? ` in ${longest.resortName}` : ''}.`,
    })

  const falls = days.reduce((a, s) => a + (s.falls || 0), 0)
  const worst = [...days].sort((a, b) => b.falls - a.falls)[0]
  cards.push({
    id: 'vallen',
    icon: 'impact',
    big: String(falls),
    title: 'keer gevallen',
    body: falls
      ? `Op ${fmtShort(worst.date)} ${worst.falls === 1 ? 'één keer' : `${worst.falls} keer`}${worst.resortName ? ` in ${worst.resortName}` : ''}. En je stond elke keer weer op.`
      : 'Nul keer gevallen. Probeerde je wel iets nieuws?',
  })

  // tricks die je dit seizoen landde, in volgorde van de eerste keer
  const firstLanded = new Map<string, string>()
  for (const s of days) for (const t of s.landed ?? []) if (!firstLanded.has(t)) firstLanded.set(t, s.date)
  if (firstLanded.size) {
    const [firstId, firstDate] = [...firstLanded][0]
    cards.push({
      id: 'tricks',
      icon: 'stomp',
      big: String(firstLanded.size),
      title: firstLanded.size === 1 ? 'trick geland' : 'tricks geland',
      body: `De eerste: ${TRICK_BY_ID.get(firstId)?.name ?? firstId}, op ${fmtShort(firstDate)}.`,
    })
  }

  const best = [...days].sort((a, b) => b.mood - a.mood || b.hours - a.hours || b.date.localeCompare(a.date))[0]
  cards.push({
    id: 'beste-dag',
    icon: 'star',
    big: fmtShort(best.date),
    title: 'je beste dag',
    body:
      [best.resortName, `${round1(best.hours)} u`, `mood: ${MOOD_LABELS[best.mood - 1] ?? best.mood}`].filter(Boolean).join(', ') +
      (best.highlight ? `. "${best.highlight}"` : '.'),
  })

  const piste = most(days.flatMap((s) => s.pistes ?? []))
  if (piste) {
    const black = days.filter((s) => s.pistes?.includes('zwart')).length
    cards.push({
      id: 'piste',
      icon: 'mountain',
      big: PISTES.find((p) => p.id === piste.value)?.label ?? piste.value,
      title: 'je kleur',
      body: `${plural(piste.count, 'dag', 'dagen')} op ${PISTE_ON[piste.value] ?? piste.value}.${black && piste.value !== 'zwart' ? ` En ${plural(black, 'dag', 'dagen')} zwart.` : ''}`,
    })
  }

  const snow = most(days.map((s) => s.snow).filter((x): x is NonNullable<Session['snow']> => !!x))
  if (snow)
    cards.push({
      id: 'sneeuw',
      icon: 'snow',
      big: SNOW.find((x) => x.id === snow.value)?.label ?? snow.value,
      title: 'je sneeuw',
      body: `${SNOW_LINES[snow.value] ?? ''} ${plural(snow.count, 'dag', 'dagen')}.`.trim(),
    })

  const buddy = most(days.flatMap((s) => [...new Set((s.buddies ?? []).map((b) => b.trim()).filter(Boolean))]))
  if (buddy)
    cards.push({
      id: 'maat',
      icon: 'crew',
      big: buddy.value,
      title: 'je maat op de berg',
      body: `${plural(buddy.count, 'dag', 'dagen')} samen op de plank.`,
    })

  if (resorts)
    cards.push({
      id: 'berg',
      icon: 'pin',
      big: resorts.value,
      title: 'je berg',
      body:
        resortCount > 1
          ? `${plural(resorts.count, 'dag', 'dagen')}. Ook geweest: ${[...new Set(days.map((s) => s.resortName))]
              .filter((r) => r && r !== resorts.value)
              .slice(0, 3)
              .join(', ')}.`
          : `${plural(resorts.count, 'dag', 'dagen')}, allemaal hier.`,
    })

  const lvl = levelFor(totalXP(input))
  cards.push({
    id: 'outro',
    icon: 'trophy',
    big: lvl.name,
    title: 'tot volgend seizoen',
    body: `Level ${lvl.level}. Zet je goggles alvast klaar.`,
  })
  return cards
}
