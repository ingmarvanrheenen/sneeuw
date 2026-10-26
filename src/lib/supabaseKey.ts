// Herkent Supabase-keys die NOOIT in de app mogen: de nieuwe secret keys (sb_secret_...)
// en de legacy service_role JWT. Gebruikt door de build (faalt dan) en door de app zelf.
export function isSecretSupabaseKey(key: string | undefined | null): boolean {
  if (!key) return false
  const k = key.trim()
  if (k.startsWith('sb_secret_')) return true
  const parts = k.split('.')
  if (parts.length !== 3) return false
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { role?: string }
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

export type SupabaseKeyKind = 'publishable' | 'anon' | 'secret' | 'onbekend' | 'geen'

export function supabaseKeyKind(key: string | undefined | null): SupabaseKeyKind {
  if (!key) return 'geen'
  if (isSecretSupabaseKey(key)) return 'secret'
  if (key.startsWith('sb_publishable_')) return 'publishable'
  if (key.split('.').length === 3) return 'anon'
  return 'onbekend'
}

export const SUPABASE_KEY_VARS = [
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
] as const

/**
 * Kiest de eerste publieke key uit de bekende variabelen en slaat secret keys over.
 * `secretVars` noemt welke variabelen ten onrechte een secret key bevatten.
 */
export function pickSupabaseKey(env: Record<string, string | undefined>) {
  const secretVars: string[] = []
  for (const name of SUPABASE_KEY_VARS) {
    const v = env[name]?.trim()
    if (!v) continue
    if (isSecretSupabaseKey(v)) {
      secretVars.push(name)
      continue
    }
    return { key: v, source: name, secretVars }
  }
  return { key: '', source: '', secretVars }
}
