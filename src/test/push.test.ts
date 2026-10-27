import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<(typeof import('./fakeSupabase'))['fakeSupabase']> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true }
})
const pwa = vi.hoisted(() => ({ isIOS: vi.fn(() => true), isStandalone: vi.fn(() => true) }))
vi.mock('../lib/pwa', () => pwa)

import { PushDenied, disablePush, enablePush, getPushState, notifyCrew, pushAvailability, sendTestPush, setPushPref } from '../lib/push'

const fake = () => sb.ref!
const ENDPOINT = 'https://web.push.apple.com/abc'
let existing: { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> } | null
let subscribe: ReturnType<typeof vi.fn>
let requestPermission: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>

function phone({ push = true, permission = 'default' }: { push?: boolean; permission?: NotificationPermission } = {}) {
  const sub = () => ({
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'P256', auth: 'AUTH' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  })
  subscribe = vi.fn(async () => (existing = sub()))
  const pushManager = { getSubscription: async () => existing, subscribe }
  const reg = { pushManager }
  if (push) {
    vi.stubGlobal('PushManager', function PushManager() {})
    requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal(
      'Notification',
      Object.assign(function Notification() {}, { permission, requestPermission }),
    )
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => reg, ready: Promise.resolve(reg) },
    })
  }
}

beforeEach(() => {
  fake().reset()
  existing = null
  fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ publicKey: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  // jsdom heeft standaard geen service worker
  Reflect.deleteProperty(navigator, 'serviceWorker')
  pwa.isIOS.mockReturnValue(true)
  pwa.isStandalone.mockReturnValue(true)
})

describe('beschikbaarheid', () => {
  it('iOS in Safari (niet op beginscherm): eerst installeren', () => {
    pwa.isStandalone.mockReturnValue(false)
    expect(pushAvailability()).toBe('install')
  })
  it('browser zonder push: niet ondersteund', () => {
    pwa.isIOS.mockReturnValue(false)
    expect(pushAvailability()).toBe('unsupported')
  })
  it('op het beginscherm met push: ok', () => {
    phone()
    expect(pushAvailability()).toBe('ok')
  })
})

describe('status', () => {
  it('geweigerd in iOS', async () => {
    phone({ permission: 'denied' })
    expect(await getPushState()).toEqual({ status: 'denied' })
  })
  it('nog geen abonnement: uit', async () => {
    phone()
    expect(await getPushState()).toEqual({ status: 'off' })
  })
  it('abonnement op de server: aan, met voorkeuren', async () => {
    phone()
    existing = { endpoint: ENDPOINT, toJSON: () => ({}), unsubscribe: vi.fn() }
    fake().respond(() => ({ data: { crew_days: true, goals: false, reminder: true } }))
    expect(await getPushState()).toEqual({ status: 'on', prefs: { crew_days: true, goals: false, reminder: true } })
    expect(fake().calls[0].filters).toEqual([['eq', 'endpoint', ENDPOINT]])
  })
  it('telefoon hangt nog aan een ander account: voor jou uit', async () => {
    phone()
    existing = { endpoint: ENDPOINT, toJSON: () => ({}), unsubscribe: vi.fn() }
    fake().respond(() => ({ data: null }))
    expect(await getPushState()).toEqual({ status: 'off' })
  })
})

describe('aanzetten', () => {
  it('vraagt eerst toestemming, abonneert met de server-key en slaat op met je tijdzone', async () => {
    phone()
    fake().respond((c) => (c.op === 'rpc' ? { data: { crew_days: true, goals: true, reminder: true } } : {}))
    expect(await enablePush()).toEqual({ crew_days: true, goals: true, reminder: true })
    expect(requestPermission.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0])
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    const rpc = fake().calls.find((c) => c.op === 'rpc')!
    expect(rpc.table).toBe('save_push_subscription')
    expect(rpc.payload).toEqual({ p_endpoint: ENDPOINT, p_p256dh: 'P256', p_auth: 'AUTH', p_tz: expect.any(String) })
  })

  it('geen toestemming: PushDenied, niks opgeslagen', async () => {
    phone()
    requestPermission.mockResolvedValue('denied')
    await expect(enablePush()).rejects.toBeInstanceOf(PushDenied)
    expect(fake().calls).toHaveLength(0)
  })

  it('server heeft nog geen VAPID-key: duidelijke fout', async () => {
    phone()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ publicKey: null }), { status: 200 }))
    await expect(enablePush()).rejects.toThrow('nog niet aan')
  })
})

describe('voorkeuren en uitzetten', () => {
  it('voorkeur aanpassen voor deze telefoon', async () => {
    phone()
    existing = { endpoint: ENDPOINT, toJSON: () => ({}), unsubscribe: vi.fn() }
    await setPushPref('reminder', false)
    expect(fake().calls[0]).toMatchObject({
      table: 'push_subscriptions',
      op: 'update',
      payload: { reminder: false },
      filters: [['eq', 'endpoint', ENDPOINT]],
    })
  })

  it('uitzetten: weg van de server en afmelden bij de push-dienst', async () => {
    phone()
    const unsubscribe = vi.fn().mockResolvedValue(true)
    existing = { endpoint: ENDPOINT, toJSON: () => ({}), unsubscribe }
    await disablePush()
    expect(fake().calls[0]).toMatchObject({ table: 'push_subscriptions', op: 'delete', filters: [['eq', 'endpoint', ENDPOINT]] })
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('uitzetten zonder push-ondersteuning doet niks', async () => {
    pwa.isIOS.mockReturnValue(false)
    await disablePush()
    expect(fake().calls).toHaveLength(0)
  })
})

describe('seintje aan de server', () => {
  it('stuurt het event met je login mee', async () => {
    await notifyCrew('goal', 'g1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/functions\/v1\/push$/)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual({ event: 'goal', id: 'g1' })
  })

  it('geen bereik: geen fout', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await expect(notifyCrew('day', 'd1')).resolves.toBeUndefined()
  })

  it('testmelding: te snel achter elkaar geeft een nette melding', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }))
    await expect(sendTestPush()).rejects.toThrow('Even wachten')
  })
})
