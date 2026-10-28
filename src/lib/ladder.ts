// Seizoensladder: het crew-klassement per seizoen, uit de seizoens-XP die iedereen met zijn stats synct.
// Afgeleid, niets opgeslagen. Het podium van vorig seizoen staat als medaille op de skipas.
import { seasonOf } from './format'
import { todayISO } from './ids'
import { crewMembers, myCrews, type CrewMember } from './crew'
import { kvGet, kvSet } from './db'

export interface LadderRow {
  user_id: string
  name: string
  xp: number
  /** gedeelde plek bij gelijke XP */
  rank: number
}

/** Seizoen van vandaag, en het seizoen daarvoor. */
export function currentSeason(today = todayISO()): string {
  return seasonOf(today)
}
export function previousSeason(season: string): string {
  const y = Number(season.slice(0, 2))
  const p = (n: number) => String((n + 100) % 100).padStart(2, '0')
  return `${p(y - 1)}/${p(y)}`
}

/** Klassement van een crew voor één seizoen ('altijd' = je totale XP). In een seizoen staat wie 0 XP heeft er niet in. */
export function ladder(members: CrewMember[], season: string | 'altijd'): LadderRow[] {
  const rows = members
    .map((m) => ({
      user_id: m.user_id,
      name: m.display_name,
      xp: Math.round(season === 'altijd' ? (m.stats.xp ?? 0) : (m.stats.seasonXP?.[season] ?? 0)),
    }))
    .filter((r) => season === 'altijd' || r.xp > 0)
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name))
  return rows.map((r) => ({ ...r, rank: rows.findIndex((x) => x.xp === r.xp) + 1 }))
}

export interface Podium {
  crewId: string
  crewName: string
  season: string
  rank: 1 | 2 | 3
  /** met hoeveel je in dat klassement stond */
  of: number
}

/** Podiumplekken van een rider in een seizoen, in alle crews waar je samen in zit. Pas vanaf 2 man. */
export function podiums(riderId: string, crews: { id: string; name: string; members: CrewMember[] }[], season: string): Podium[] {
  const out: Podium[] = []
  for (const c of crews) {
    const rows = ladder(c.members, season)
    const me = rows.find((r) => r.user_id === riderId)
    if (!me || rows.length < 2 || me.rank > 3) continue
    out.push({ crewId: c.id, crewName: c.name, season, rank: me.rank as 1 | 2 | 3, of: rows.length })
  }
  return out.sort((a, b) => a.rank - b.rank)
}

// ── Data: podiums van vorig seizoen, uit de crews die je deelt ────────────────

const podiumKey = (riderId: string) => `podiums:${riderId}`

export function cachedPodiums(riderId: string): Promise<Podium[]> {
  return kvGet<Podium[]>(podiumKey(riderId), [])
}

/** Podiumplekken van vorig seizoen in je crews (waar deze rider ook in zit). Laatst bekende blijft lokaal. */
export async function loadPodiums(riderId: string, season = previousSeason(currentSeason())): Promise<Podium[]> {
  const crews = await myCrews()
  const withMembers = await Promise.all(crews.map(async (c) => ({ id: c.id, name: c.name, members: await crewMembers(c.id) })))
  const list = podiums(
    riderId,
    withMembers.filter((c) => c.members.some((m) => m.user_id === riderId)),
    season,
  )
  await kvSet(podiumKey(riderId), list)
  return list
}
