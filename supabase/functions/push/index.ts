// Push-meldingen. De logica staat in handlers.ts (getest), dit koppelt het aan Supabase en Web Push.
// - GET                         publieke VAPID-key voor de app
// - POST {event:'day'|'goal', id}  na een gedeelde dag of afgevinkt crew-doel (ingelogd)
// - POST {event:'test'}            testmelding naar je eigen telefoon (ingelogd)
// - POST {task:'reminder'}         elk uur via pg_cron (supabase/cron/push_reminder.sql); stuurt alleen
//                                  wat om 17:00 lokaal hoort en per user per dag maar één keer, dus open is veilig.
// Deploy met --no-verify-jwt: inloggen checken we hier zelf, zodat pg_cron zonder key kan aanroepen.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandlers, type Pref, type Store, type SubRow } from './handlers.ts'
import { sendPush, type Vapid } from './webpush.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const vapid: Vapid = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject: Deno.env.get('PUSH_SUBJECT') ?? 'https://sneeuw.vercel.app',
}

const SUB_COLS = 'id, user_id, endpoint, p256dh, auth, tz'

const store: Store = {
  async record(id) {
    const { data } = await admin.from('records').select('id, user_id, kind, crew_id, deleted, data').eq('id', id).maybeSingle()
    return data
  },
  async crewMemberIds(crewId) {
    const { data } = await admin.from('crew_members').select('user_id').eq('crew_id', crewId)
    return (data ?? []).map((r) => r.user_id)
  },
  async displayName(userId) {
    const { data } = await admin.from('profiles').select('display_name').eq('user_id', userId).maybeSingle()
    return data?.display_name ?? 'Iemand'
  },
  async goal(id) {
    const { data } = await admin.from('crew_trip_goals').select('id, crew_id, trip_id, title').eq('id', id).maybeSingle()
    return data
  },
  async goalDoneIds(goalId) {
    const { data } = await admin.from('crew_trip_goal_done').select('user_id').eq('goal_id', goalId)
    return (data ?? []).map((r) => r.user_id)
  },
  async subscriptions(pref: Pref | null, userIds?: string[]) {
    let q = admin.from('push_subscriptions').select(SUB_COLS)
    if (pref) q = q.eq(pref, true)
    if (userIds) q = q.in('user_id', userIds)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as SubRow[]
  },
  async tripsAndDays(userIds) {
    const { data, error } = await admin
      .from('records')
      .select('user_id, kind, data')
      .in('user_id', userIds)
      .in('kind', ['trip', 'session'])
      .eq('deleted', false)
    if (error) throw error
    return data ?? []
  },
  async once(key) {
    const { error } = await admin.from('push_log').insert({ key })
    return !error
  },
  async removeSubscription(id) {
    await admin.from('push_subscriptions').delete().eq('id', id)
  },
}

const h = createHandlers(store, async (sub, msg) => {
  const r = await sendPush(sub, JSON.stringify(msg), vapid, { topic: msg.tag, urgency: msg.tag === 'reminder' ? 'normal' : 'low' })
  if (!r.ok && !r.gone) console.error('push mislukt', r.status, new URL(sub.endpoint).host)
  return r
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method === 'GET') return json(200, { publicKey: vapid.publicKey || null })
  if (req.method !== 'POST') return json(405, { error: 'Alleen GET en POST' })
  if (!vapid.publicKey || !vapid.privateKey) return json(503, { error: 'Push is nog niet ingesteld (VAPID-keys ontbreken)' })

  let body: { event?: string; id?: string; task?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Ongeldige JSON' })
  }
  try {
    if (body.task === 'reminder') {
      const r = await h.runReminders()
      return json(r.status, r)
    }

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } }
    const user = data?.user
    if (!user) return json(401, { error: 'Log eerst in' })

    const id = typeof body.id === 'string' ? body.id : ''
    const r =
      body.event === 'day'
        ? await h.onDay(user.id, id)
        : body.event === 'goal'
          ? await h.onGoal(user.id, id)
          : body.event === 'test'
            ? await h.onTest(user.id)
            : { status: 400, sent: 0, reason: 'onbekend event' }
    return json(r.status, r)
  } catch (e) {
    console.error(e)
    return json(500, { error: 'Er ging iets mis' })
  }
})
