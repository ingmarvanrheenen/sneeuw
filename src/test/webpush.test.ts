// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { b64u, encrypt, fromB64u, generateVapidKeys, importPair, sendPush, vapidToken } from '../../supabase/functions/push/webpush'

// RFC 8291, Appendix A
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
}

const enc = new TextEncoder()
afterEach(() => vi.unstubAllGlobals())

describe('web push-versleuteling (RFC 8291)', () => {
  it('geeft exact de uitkomst van de testvector', async () => {
    const pair = await importPair(RFC.asPublic, RFC.asPrivate)
    const out = await encrypt(enc.encode(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { pair, salt: fromB64u(RFC.salt) })
    expect(b64u(out.slice(0, 86))).toBe(RFC.header)
    expect(b64u(out.slice(86))).toBe(RFC.ciphertext)
  })

  it('nieuwe sleutel en salt per bericht', async () => {
    const t = { p256dh: RFC.uaPublic, auth: RFC.auth }
    const [a, b] = await Promise.all([encrypt(enc.encode('x'), t), encrypt(enc.encode('x'), t)])
    expect(b64u(a.slice(0, 16))).not.toBe(b64u(b.slice(0, 16)))
    expect(b64u(a.slice(21, 86))).not.toBe(b64u(b.slice(21, 86)))
  })
})

describe('VAPID (RFC 8292)', () => {
  it('maakt een geldig ES256-token voor de origin van de push-dienst', async () => {
    const keys = await generateVapidKeys()
    expect(fromB64u(keys.publicKey)).toHaveLength(65)
    expect(fromB64u(keys.privateKey)).toHaveLength(32)
    const now = Date.UTC(2026, 9, 27, 12)
    const jwt = await vapidToken('https://web.push.apple.com/abc', { ...keys, subject: 'https://sneeuw.vercel.app' }, now)
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromB64u(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(fromB64u(c)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: now / 1000 + 12 * 3600,
      sub: 'https://sneeuw.vercel.app',
    })
    const pub = await crypto.subtle.importKey('raw', fromB64u(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64u(s), enc.encode(`${h}.${c}`))
    expect(ok).toBe(true)
  })
})

describe('sendPush', () => {
  it('stuurt versleuteld met de juiste headers en meldt verlopen abonnementen', async () => {
    const keys = await generateVapidKeys()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 410 }))
    vi.stubGlobal('fetch', fetchMock)
    const target = { endpoint: 'https://web.push.apple.com/xyz', p256dh: RFC.uaPublic, auth: RFC.auth }
    const vapid = { ...keys, subject: 'https://sneeuw.vercel.app' }

    expect(await sendPush(target, '{"title":"Hoi"}', vapid, { topic: 'day:abc-123' })).toEqual({ ok: true, status: 201, gone: false })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(target.endpoint)
    expect(init.headers['Content-Encoding']).toBe('aes128gcm')
    expect(init.headers.TTL).toBe('86400')
    expect(init.headers.Topic).toBe('dayabc-123')
    expect(init.headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`))
    expect((init.body as Uint8Array).length).toBe(86 + '{"title":"Hoi"}'.length + 1 + 16)

    expect(await sendPush(target, 'x', vapid)).toEqual({ ok: false, status: 410, gone: true })
  })
})

describe('scripts/vapid-keys.mjs', () => {
  it('maakt een bruikbaar sleutelpaar in env-formaat', async () => {
    const { execFileSync } = await import('node:child_process')
    const { resolve } = await import('node:path')
    const out = execFileSync(process.execPath, [resolve(__dirname, '../../scripts/vapid-keys.mjs')], { encoding: 'utf8' })
    const env = Object.fromEntries(
      out
        .trim()
        .split('\n')
        .map((l) => l.split('=') as [string, string]),
    )
    expect(Object.keys(env)).toEqual(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'])
    expect(fromB64u(env.VAPID_PUBLIC_KEY)).toHaveLength(65)
    expect(fromB64u(env.VAPID_PRIVATE_KEY)).toHaveLength(32)
    // het paar hoort bij elkaar: een token ermee is te verifiëren met de publieke key
    const jwt = await vapidToken('https://web.push.apple.com/x', {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: 'https://sneeuw.vercel.app',
    })
    const [h, c, s] = jwt.split('.')
    const pub = await crypto.subtle.importKey('raw', fromB64u(env.VAPID_PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'verify',
    ])
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64u(s), enc.encode(`${h}.${c}`))).toBe(true)
  })
})
