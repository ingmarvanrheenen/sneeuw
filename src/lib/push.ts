// Push-meldingen op deze telefoon: aanmelden, voorkeuren, uitzetten, en de crew een seintje geven.
// Versturen doet de Edge Function `push`; die checkt alles nog een keer (alleen jouw eigen dag of vinkje).
// iOS: alleen als de app op je beginscherm staat (iOS 16.4+), en toestemming vragen kan alleen na een tik.
import { supabase } from './supabase'
import { isIOS, isStandalone } from './pwa'

export type PushPref = 'crew_days' | 'goals' | 'reminder' | 'pow' | 'challenge'
export type PushPrefs = Record<PushPref, boolean>
export type PushStatus = 'unsupported' | 'install' | 'denied' | 'off' | 'on'

export class PushDenied extends Error {
  constructor() {
    super('Meldingen zijn niet toegestaan')
  }
}

const fnUrl = () => `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/push`

export function pushAvailability(): 'ok' | 'install' | 'unsupported' {
  const can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (can) return 'ok'
  // Safari op iOS kan het wel, maar pas vanaf het beginscherm
  return isIOS() && !isStandalone() ? 'install' : 'unsupported'
}

/** Voorkeuren uit een rij; een soort die (nog) niet in de rij staat, staat aan, net als de standaard in de database. */
function toPrefs(row: Partial<Record<PushPref, boolean>>): PushPrefs {
  const on = (p: PushPref) => row[p] ?? true
  return { crew_days: on('crew_days'), goals: on('goals'), reminder: on('reminder'), pow: on('pow'), challenge: on('challenge') }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function getPushState(): Promise<{ status: PushStatus; prefs?: PushPrefs }> {
  const avail = pushAvailability()
  if (avail !== 'ok' || !supabase) return { status: avail === 'ok' ? 'unsupported' : avail }
  if (Notification.permission === 'denied') return { status: 'denied' }
  const sub = await currentSubscription()
  if (!sub) return { status: 'off' }
  // alles, zodat een nieuwe soort die nog niet in de database staat de rest niet breekt
  const { data } = await supabase.from('push_subscriptions').select('*').eq('endpoint', sub.endpoint).maybeSingle()
  // staat de telefoon nog op een ander account (of is hij opgeruimd): dan voor jou uit
  return data ? { status: 'on', prefs: toPrefs(data) } : { status: 'off' }
}

function toKey(b64u: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Moet direct vanuit een tik aangeroepen worden: iOS vraagt alleen dan om toestemming. */
export async function enablePush(): Promise<PushPrefs> {
  if (!supabase) throw new Error('Meldingen werken alleen met een account')
  // eerst toestemming, vóór elke andere await, anders is de tik "verbruikt"
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new PushDenied()
  const res = await fetch(fnUrl())
  const { publicKey } = (await res.json().catch(() => ({}))) as { publicKey?: string | null }
  if (!res.ok || !publicKey) throw new Error('Meldingen staan op de server nog niet aan')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }))
  const json = sub.toJSON()
  const { data, error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
  })
  if (error) throw error
  return toPrefs(data as Partial<PushPrefs>)
}

export async function setPushPref(pref: PushPref, on: boolean) {
  const sub = await currentSubscription()
  if (!supabase || !sub) throw new Error('Meldingen staan uit')
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ [pref]: on })
    .eq('endpoint', sub.endpoint)
  if (error) throw error
}

/** Uit op deze telefoon (ook bij uitloggen, zodat je geen meldingen van je oude account krijgt). */
export async function disablePush() {
  if (pushAvailability() !== 'ok') return
  const sub = await currentSubscription()
  if (!sub) return
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

async function call(body: Record<string, unknown>): Promise<Response | null> {
  if (!supabase) return null
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) return null
  return fetch(fnUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Seintje aan de server na een gedeelde dag of een afgevinkt crew-doel. Mag nooit iets breken. */
export async function notifyCrew(event: 'day' | 'goal', id: string) {
  try {
    await call({ event, id })
  } catch {
    /* geen bereik: dan geen melding, de rest werkt gewoon */
  }
}

export async function sendTestPush() {
  const res = await call({ event: 'test' })
  if (!res) throw new Error('Log eerst in')
  if (res.status === 429) throw new Error('Even wachten, je kreeg net een testmelding')
  if (!res.ok)
    throw new Error(((await res.json().catch(() => ({}))) as { error?: string; reason?: string }).reason ?? 'Testmelding lukte niet')
}
