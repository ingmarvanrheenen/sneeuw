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
