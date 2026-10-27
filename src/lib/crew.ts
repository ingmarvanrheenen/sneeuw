// Crew = je vriendengroep. Gedeelde dagen, tricks en media zie je in de feed.
// De feed werkt alleen online (het is sociaal). De lijst met je crews wordt lokaal bewaard,
// zodat je op de berg zonder bereik je dag toch met je crew kunt delen.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import type { AnyRecord, MediaMeta, Session, TrickProgress } from './types'
import type { IconName } from '../design/icons'

export interface Crew {
  id: string
  name: string
  invite_code: string
  created_by: string
}

export interface CrewMember {
  user_id: string
  role: string
  display_name: string
  stats: { xp?: number; level?: number; levelName?: string; days?: number; hours?: number; tricksLanded?: number; falls?: number }
}

export interface FeedItem {
  id: string
  user_id: string
  kind: 'session' | 'trick' | 'media'
  data: AnyRecord
  updated_at: string
}

export interface Reaction {
  record_id: string
  user_id: string
  emoji: string
}

/** Crew-reacties. `key` wordt opgeslagen, het icoon komt uit ons eigen design system. */
export const REACTIONS: { key: string; icon: IconName; label: string }[] = [
  { key: 'vuur', icon: 'flame', label: 'Vuur' },
  { key: 'stomp', icon: 'stomp', label: 'Stomped' },
  { key: 'lol', icon: 'lol', label: 'Haha' },
  { key: 'rip', icon: 'skull', label: 'RIP' },
  { key: 'goat', icon: 'crown', label: 'GOAT' },
]

function need() {
  if (!supabase) throw new Error('Crew werkt alleen met een gekoppelde server (zie Instellingen).')
  return supabase
}

/** Laatst bekende crews, ook zonder bereik. */
export function cachedCrews(): Promise<Crew[]> {
  return kvGet<Crew[]>('crews', [])
}

async function cacheCrews(list: Crew[]) {
  await kvSet('crews', list)
  await kvSet('inCrew', list.length > 0)
}

export async function myCrews(): Promise<Crew[]> {
  const sb = need()
  const { data, error } = await sb.from('crews').select('id, name, invite_code, created_by').order('created_at')
  if (error) throw error
  await cacheCrews(data ?? [])
  return data ?? []
}

export async function createCrew(name: string): Promise<Crew> {
  const sb = need()
  const { data, error } = await sb.rpc('create_crew', { crew_name: name })
  if (error) throw error
  await cacheCrews([...(await cachedCrews()), data as Crew])
  return data as Crew
}

export async function joinCrew(code: string): Promise<Crew> {
  const sb = need()
  const { data, error } = await sb.rpc('join_crew', { code: code.trim().toUpperCase() })
  if (error) throw error
  const crew = data as Crew
  await cacheCrews([...(await cachedCrews()).filter((c) => c.id !== crew.id), crew])
  return crew
}

export async function leaveCrew(crewId: string) {
  const sb = need()
  const { data: u } = await sb.auth.getUser()
  const { error } = await sb
    .from('crew_members')
    .delete()
    .eq('crew_id', crewId)
    .eq('user_id', u.user?.id ?? '')
  if (error) throw error
  await cacheCrews((await cachedCrews()).filter((c) => c.id !== crewId))
  if ((await kvGet<string | null>('lastCrewId', null)) === crewId) await kvSet('lastCrewId', null)
}

export async function crewMembers(crewId: string): Promise<CrewMember[]> {
  const sb = need()
  const { data, error } = await sb.rpc('crew_members_with_stats', { cid: crewId })
  if (error) throw error
  return (data ?? []) as CrewMember[]
}

export async function crewFeed(crewId: string): Promise<FeedItem[]> {
  const sb = need()
  const { data, error } = await sb
    .from('records')
    .select('id, user_id, kind, data, updated_at')
    .eq('crew_id', crewId)
    .eq('deleted', false)
    .in('kind', ['session', 'trick', 'media'])
    .order('updated_at', { ascending: false })
    .limit(150)
  if (error) throw error
  return (data ?? []) as FeedItem[]
}

export async function reactionsFor(ids: string[]): Promise<Reaction[]> {
  if (!ids.length) return []
  const sb = need()
  const { data, error } = await sb.from('reactions').select('record_id, user_id, emoji').in('record_id', ids)
  if (error) throw error
  return data ?? []
}

export async function toggleReaction(recordId: string, emoji: string, mine: boolean) {
  const sb = need()
  const { data: u } = await sb.auth.getUser()
  const uid = u.user?.id
  if (!uid) return
  if (mine) await sb.from('reactions').delete().match({ record_id: recordId, user_id: uid, emoji })
  else await sb.from('reactions').insert({ record_id: recordId, user_id: uid, emoji })
}

/** Groepeert feed-items tot posts: een dag met zijn media, of een gelande trick. */
export interface FeedPost {
  id: string
  userId: string
  at: string
  session?: Session
  trick?: TrickProgress
  media: MediaMeta[]
}

export function toPosts(items: FeedItem[]): FeedPost[] {
  const media = items.filter((i) => i.kind === 'media').map((i) => i.data as MediaMeta)
  const posts: FeedPost[] = []
  for (const i of items) {
    if (i.kind === 'session') {
      const s = i.data as Session
      posts.push({ id: i.id, userId: i.user_id, at: s.date, session: s, media: media.filter((m) => m.sessionId === s.id) })
    } else if (i.kind === 'trick') {
      const t = i.data as TrickProgress
      if (t.status !== 'geland' && t.status !== 'beheerst') continue
      posts.push({
        id: i.id,
        userId: i.user_id,
        at: t.firstLandedAt ?? i.updated_at.slice(0, 10),
        trick: t,
        media: media.filter((m) => m.trickId === t.trickId && m.userId === i.user_id),
      })
    }
  }
  return posts.sort((a, b) => b.at.localeCompare(a.at))
}
