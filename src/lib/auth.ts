import { scheduleSync } from './sync'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { setCurrentUserId } from './auth-state'
import { createStore } from './store'
import { db, kvGet, kvSet } from './db'
import type { Profile } from './types'

export const authStore = createStore<{ user: User | null; ready: boolean }>({ user: null, ready: !supabase })

async function claimLocalRecords(userId: string) {
  // Alles wat je offline/zonder account hebt gelogd hoort nu bij jou en moet naar de cloud.
  await db.records
    .filter((r) => !r.userId)
    .modify((r) => {
      r.userId = userId
      r.dirty = 1
    })
}

export async function initAuth() {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user ?? null
  setCurrentUserId(user?.id ?? null)
  if (user) await claimLocalRecords(user.id)
  authStore.set({ user, ready: true })

  supabase.auth.onAuthStateChange(async (_event, session) => {
    const u = session?.user ?? null
    const prev = authStore.get().user
    setCurrentUserId(u?.id ?? null)
    if (u && u.id !== prev?.id) await claimLocalRecords(u.id)
    authStore.set({ user: u, ready: true })
    // net ingelogd: meteen je data ophalen en wat lokaal klaarstaat wegschrijven
    // (via een timer, zodat de sync niet binnen deze auth-callback draait)
    if (u && u.id !== prev?.id) scheduleSync(100)
  })
}

export async function signUp(email: string, password: string, displayName: string) {
  if (!supabase) throw new Error('Geen server gekoppeld')
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } })
  if (error) throw error
  const profile = await getProfile()
  if (!profile.displayName) await saveProfile({ ...profile, displayName })
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Geen server gekoppeld')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Uitloggen wist de lokale data van dit apparaat (die staat veilig in de cloud). */
export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
  await db.transaction('rw', db.records, db.blobs, db.kv, async () => {
    await db.records.clear()
    await db.blobs.clear()
    await db.kv.clear()
  })
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

const EMPTY_PROFILE: Profile = { displayName: '', stance: 'onbekend', favoriteResorts: [] }

export async function getProfile(): Promise<Profile> {
  return { ...EMPTY_PROFILE, ...(await kvGet<Partial<Profile>>('profile', {})) }
}

export async function saveProfile(p: Profile) {
  await kvSet('profile', p)
  await kvSet('profileDirty', true)
}
