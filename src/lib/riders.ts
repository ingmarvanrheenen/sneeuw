// Profielen van je crew (online, met de laatst bekende lokaal voor offline), highlights,
// bijnaam-voorstellen en je profielfoto klein maken.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { getCurrentUserId } from './auth-state'
import { getProfile, saveProfile } from './auth'
import { scheduleSync } from './sync'
import type { RiderStats } from './rider'
import type { MediaMeta, Profile } from './types'

export interface CrewRider {
  userId: string
  name: string
  profile: Partial<Profile>
  stats: Partial<RiderStats>
}

export interface NicknameSuggestion {
  id: string
  from_user: string
  fromName: string
  nickname: string
}

function need() {
  if (!supabase) throw new Error('Profielen van je crew werken alleen met een gekoppelde server.')
  return supabase
}

const riderKey = (id: string) => `rider:${id}`

export function cachedRider(userId: string): Promise<CrewRider | null> {
  return kvGet<CrewRider | null>(riderKey(userId), null)
}

/** Profiel van een crewgenoot. RLS laat alleen je crew (en jezelf) door. */
export async function loadRider(userId: string): Promise<CrewRider | null> {
  const { data, error } = await need().from('profiles').select('user_id, display_name, data, stats').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const rider: CrewRider = { userId: data.user_id, name: data.display_name, profile: data.data ?? {}, stats: data.stats ?? {} }
  await kvSet(riderKey(userId), rider)
  return rider
}

/** Profielen (naam + foto) voor de crew-feed, in één query. */
export async function riderProfiles(userIds: string[]): Promise<Record<string, CrewRider>> {
  if (!userIds.length) return {}
  const { data, error } = await need().from('profiles').select('user_id, display_name, data, stats').in('user_id', userIds)
  if (error) throw error
  return Object.fromEntries(
    (data ?? []).map((d) => [d.user_id, { userId: d.user_id, name: d.display_name, profile: d.data ?? {}, stats: d.stats ?? {} }]),
  )
}

/** Clips en foto's die deze rider met een crew deelde, nieuwste eerst. */
export async function riderMedia(userId: string, limit = 9): Promise<MediaMeta[]> {
  const { data, error } = await need()
    .from('records')
    .select('data')
    .eq('user_id', userId)
    .eq('kind', 'media')
    .eq('deleted', false)
    .not('crew_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => r.data as MediaMeta)
}

// ── Bijnamen ────────────────────────────────────────────────────────────────

export async function suggestNickname(toUser: string, nickname: string) {
  const clean = nickname.trim().slice(0, 30)
  if (!clean) throw new Error('Typ een bijnaam')
  const { error } = await need().from('nicknames').insert({ to_user: toUser, nickname: clean })
  if (error) {
    if (error.code === '23505') throw new Error('Die heb je al voorgesteld')
    if (error.code === '42501') throw new Error('Kan niet: max 3 open voorstellen, en alleen aan je crew')
    throw error
  }
}

/** Open voorstellen voor jou, met de naam van wie het voorstelde. */
export async function nicknameInbox(): Promise<NicknameSuggestion[]> {
  const sb = need()
  const me = getCurrentUserId()
  if (!me) return []
  const { data, error } = await sb
    .from('nicknames')
    .select('id, from_user, nickname')
    .eq('to_user', me)
    .eq('status', 'open')
    .order('created_at')
  if (error) throw error
  const rows = data ?? []
  if (!rows.length) return []
  const names = await riderProfiles([...new Set(rows.map((r) => r.from_user))])
  return rows.map((r) => ({ ...r, fromName: names[r.from_user]?.name ?? 'Iemand' }))
}

/** Ja: wordt je bijnaam (in je profiel, synct mee). Nee: weg. */
export async function answerNickname(s: Pick<NicknameSuggestion, 'id' | 'nickname'>, ok: boolean) {
  const { error } = await need()
    .from('nicknames')
    .update({ status: ok ? 'ok' : 'nee' })
    .eq('id', s.id)
  if (error) throw error
  if (ok) {
    await saveProfile({ ...(await getProfile()), nickname: s.nickname })
    scheduleSync()
  }
}

// ── Profielfoto ─────────────────────────────────────────────────────────────

export const AVATAR_SIZE = 192
const MAX_AVATAR_CHARS = 60_000

/** Vierkant uitsnijden (midden) en klein maken: past in je profiel en synct mee. */
export async function makeAvatar(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Deze foto kan ik niet lezen'))
      i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = AVATAR_SIZE
    canvas
      .getContext('2d')!
      .drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    for (const q of [0.8, 0.6, 0.4]) {
      const out = canvas.toDataURL('image/jpeg', q)
      if (out.length <= MAX_AVATAR_CHARS) return out
    }
    throw new Error('Foto is te groot')
  } finally {
    URL.revokeObjectURL(url)
  }
}
