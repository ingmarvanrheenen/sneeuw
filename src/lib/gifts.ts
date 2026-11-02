// Stickers cadeau doen: een sticker (stemming of crew-reactie) met een kort berichtje aan een crewgenoot.
// Max 3 per week weggeven; wie hem krijgt plakt er max 3 op de eigen skipas. De database bewaakt beide.
import { supabase } from './supabase'
import { kvGet, kvSet } from './db'
import { getCurrentUserId } from './auth-state'

export type GiftStickerId = 'goat' | 'vuur' | 'stomp' | 'lol' | 'rip' | 'mood5' | 'mood4' | 'mood3' | 'mood2' | 'mood1'

export const GIFT_STICKERS: { id: GiftStickerId; label: string }[] = [
  { id: 'goat', label: 'GOAT' },
  { id: 'vuur', label: 'Vuur' },
  { id: 'stomp', label: 'Stomped' },
  { id: 'lol', label: 'Haha' },
  { id: 'rip', label: 'RIP' },
  { id: 'mood5', label: 'Episch' },
  { id: 'mood4', label: 'Chill' },
  { id: 'mood3', label: 'Prima' },
  { id: 'mood2', label: 'Meh' },
  { id: 'mood1', label: 'Kapot' },
]
export const GIFT_LABEL = new Map(GIFT_STICKERS.map((s) => [s.id, s.label]))

export const WEEK_LIMIT = 3
export const PIN_MAX = 3

export interface Gift {
  id: string
  from_user: string
  to_user: string
  sticker: GiftStickerId
  note: string | null
  pinned: boolean
  created_at: string
}

const COLS = 'id, from_user, to_user, sticker, note, pinned, created_at'
const KEY = 'gifts:mine'

function need() {
  if (!supabase) throw new Error('Stickers geven werkt alleen met een gekoppelde server.')
  return supabase
}

/** Fouten van de database in gewone taal (de triggers geven al Nederlandse tekst). */
export function giftError(e: unknown): Error {
  const err = e as { message?: string; code?: string }
  return new Error(err?.message || 'Dat lukte niet.')
}

export const cachedGifts = () => kvGet<Gift[]>(KEY, [])

/** Stickers die jij kreeg, nieuwste eerst. */
export async function myGifts(): Promise<Gift[]> {
  const { data, error } = await need()
    .from('sticker_gifts')
    .select(COLS)
    .eq('to_user', getCurrentUserId() ?? '')
    .order('created_at', { ascending: false })
  if (error) throw error
  await kvSet(KEY, data ?? [])
  return (data ?? []) as Gift[]
}

/** Wat een crewgenoot op de eigen skipas plakte. */
export async function pinnedFor(userId: string): Promise<Gift[]> {
  const { data, error } = await need().from('sticker_gifts').select(COLS).eq('to_user', userId).eq('pinned', true)
  if (error) throw error
  return (data ?? []) as Gift[]
}

/** Hoeveel je deze week nog kunt weggeven. */
export async function giftsLeft(now = Date.now()): Promise<number> {
  const since = new Date(now - 7 * 864e5).toISOString()
  const { data, error } = await need()
    .from('sticker_gifts')
    .select('id')
    .eq('from_user', getCurrentUserId() ?? '')
    .gt('created_at', since)
  if (error) throw error
  return Math.max(0, WEEK_LIMIT - (data?.length ?? 0))
}

export async function giveSticker(toUser: string, sticker: GiftStickerId, note: string) {
  const { error } = await need()
    .from('sticker_gifts')
    .insert({ to_user: toUser, sticker, note: note.trim().slice(0, 60) || null })
  if (error) throw giftError(error)
}

export async function setPinned(id: string, pinned: boolean) {
  const { error } = await need().from('sticker_gifts').update({ pinned }).eq('id', id)
  if (error) throw giftError(error)
}

export async function removeGift(id: string) {
  const { error } = await need().from('sticker_gifts').delete().eq('id', id)
  if (error) throw giftError(error)
}
