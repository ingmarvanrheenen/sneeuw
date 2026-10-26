// Supabase-fouten zijn vaak plain objects (geen Error), dus "[object Object]" voorkomen.
// Bekende situaties krijgen een uitleg in gewone taal.
export function errMsg(e: unknown): string {
  if (!e) return 'Onbekende fout'
  if (typeof e === 'string') return e
  const o = e as { message?: string; code?: string; details?: string; hint?: string; error_description?: string; error?: string }
  const code = o.code ?? ''
  const msg = o.message ?? o.error_description ?? o.error ?? ''
  if (code === 'PGRST205' || code === '42P01' || /schema cache|does not exist/i.test(msg))
    return 'De database is nog niet ingericht. Voer de SQL-migratie uit in Supabase (SQL editor) en probeer opnieuw.'
  if (code === '42501' || /row-level security/i.test(msg)) return 'Geen toegang (Row Level Security). Klopt de migratie en ben je ingelogd?'
  if (/failed to fetch|network/i.test(msg)) return 'Geen verbinding met de server. Ben je online?'
  if (/bucket not found/i.test(msg)) return 'De opslag-bucket "media" ontbreekt. Voer de SQL-migratie uit.'
  if (msg) return code ? `${msg} (${code})` : msg
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}
