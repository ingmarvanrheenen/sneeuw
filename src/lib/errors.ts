// Supabase-fouten zijn vaak plain objects (geen Error), dus "[object Object]" voorkomen.
// Bekende situaties krijgen een uitleg in gewone taal.
export function errMsg(e: unknown): string {
  if (!e) return 'Onbekende fout'
  if (typeof e === 'string') return e
  const o = e as { message?: string; code?: string; details?: string; hint?: string; error_description?: string; error?: string }
  const code = o.code ?? ''
  const msg = o.message ?? o.error_description ?? o.error ?? ''
  const AUTH: Record<string, string> = {
    over_email_send_rate_limit: 'Te veel bevestigingsmails in korte tijd. Probeer het over een uur opnieuw.',
    email_address_invalid: 'Dit e-mailadres wordt niet geaccepteerd. Gebruik een echt adres.',
    user_already_exists: 'Er bestaat al een account met dit e-mailadres. Log in in plaats daarvan.',
    email_exists: 'Er bestaat al een account met dit e-mailadres. Log in in plaats daarvan.',
    invalid_credentials: 'E-mail of wachtwoord klopt niet.',
    email_not_confirmed: 'Bevestig eerst je e-mail via de link in je mailbox.',
    weak_password: 'Wachtwoord is te zwak. Gebruik minstens 6 tekens.',
    over_request_rate_limit: 'Te veel pogingen. Wacht even en probeer opnieuw.',
  }
  if (AUTH[code]) return AUTH[code]
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
