import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSecretSupabaseKey, supabaseKeyKind } from './supabaseKey'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
// Vangnet: een secret key wordt nooit gebruikt (de build blokkeert hem ook al).
const key = isSecretSupabaseKey(rawKey) ? undefined : rawKey

/** null = geen backend geconfigureerd → app draait 100% lokaal. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sd-auth' },
      })
    : null

export const hasBackend = supabase !== null

/** Voor het Verbinding-kaartje in Instellingen: nooit de key zelf tonen. */
export const backendInfo = {
  host: url ? url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '',
  keyKind: supabaseKeyKind(rawKey),
  keySource: (import.meta.env.VITE_SUPABASE_KEY_SOURCE as string | undefined) || (rawKey ? 'VITE_SUPABASE_ANON_KEY' : ''),
}
export const MEDIA_BUCKET = 'media'
