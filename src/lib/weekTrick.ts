// Trick van de week voor je crew: elke week (ma t/m zo) één trick, voor iedereen in de crew dezelfde (seed =
// crew + week, niets opgeslagen). Wie hem filmt deelt de clip met de crew; iedereen stemt één keer per week op de
// beste clip, niet op die van zichzelf. Stemmen: migratie 20261123000000_crew_week_votes.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { seeded } from './random'
import { isVisual } from './memo'
import { TRICKS, type Trick } from '../content/tricks'
import type { MediaMeta } from './types'

/** Tricks die je op een gewone dag kunt filmen: flat, bochten, carven en de makkelijkere park-tricks. */
export const WEEK_TRICKS: Trick[] = TRICKS.filter(
  (t) => (['flat', 'bochten', 'carven'].includes(t.track) && t.level >= 2) || (t.track === 'park' && t.level <= 3),
)

export function weekTrick(crewId: string, weekKey: string): Trick {
  const r = seeded(`weektrick:${crewId}:${weekKey}`)
  return WEEK_TRICKS[Math.floor(r() * WEEK_TRICKS.length)]
}

export interface Entry {
  media: MediaMeta
  userId: string
}

/** De clips van deze week: met de crew gedeeld, bij deze trick, gemaakt in deze week. Nieuwste eerst. */
export function entriesOf(media: MediaMeta[], trickId: string, week: { from: string; to: string }): Entry[] {
  const day = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return media
    .filter((m) => !m.deleted && isVisual(m) && !m.tripFilm && m.trickId === trickId && m.userId)
    .filter((m) => day(m.createdAt) >= week.from && day(m.createdAt) <= week.to)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((m) => ({ media: m, userId: m.userId! }))
}

export interface WeekVote {
  voter: string
  media_id: string
}

/** Stand: stemmen per clip, en de clip(s) met de meeste stemmen. */
export function tally(votes: WeekVote[]) {
  const counts: Record<string, number> = {}
  for (const v of votes) counts[v.media_id] = (counts[v.media_id] ?? 0) + 1
  const best = Math.max(0, ...Object.values(counts))
  return { counts, leaders: best ? Object.keys(counts).filter((id) => counts[id] === best) : [], total: votes.length }
}

function need() {
  if (!supabase) throw new Error('Stemmen werkt alleen met een gekoppelde server.')
  return supabase
}

const key = (crewId: string, week: string) => `weekVotes:${crewId}:${week}`
export const cachedWeekVotes = (crewId: string, week: string) => kvGet<WeekVote[]>(key(crewId, week), [])

export async function weekVotes(crewId: string, week: string): Promise<WeekVote[]> {
  const { data, error } = await need().from('crew_week_votes').select('voter, media_id').eq('crew_id', crewId).eq('week', week)
  if (error) throw error
  const list = (data ?? []) as WeekVote[]
  await kvSet(key(crewId, week), list)
  return list
}

/** Stemmen, of je stem veranderen; nog een keer op dezelfde = intrekken. */
export async function voteWeek(crewId: string, week: string, mediaId: string, mine: WeekVote | undefined) {
  const sb = need()
  if (mine?.media_id === mediaId) {
    const { error } = await sb.from('crew_week_votes').delete().eq('crew_id', crewId).eq('week', week).eq('voter', mine.voter)
    if (error) throw error
  } else if (mine) {
    const { error } = await sb
      .from('crew_week_votes')
      .update({ media_id: mediaId })
      .eq('crew_id', crewId)
      .eq('week', week)
      .eq('voter', mine.voter)
    if (error) throw error
  } else {
    const { error } = await sb.from('crew_week_votes').insert({ crew_id: crewId, week, media_id: mediaId })
    if (error) throw error
  }
}
