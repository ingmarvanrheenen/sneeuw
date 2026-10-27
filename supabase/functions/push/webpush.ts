// Web Push zonder library: RFC 8291 (versleuteling, aes128gcm) en RFC 8292 (VAPID), alleen WebCrypto.
// Draait in Deno (Edge Function) en in Node (vitest). Getest tegen de testvector uit RFC 8291.

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

/** VAPID-sleutels als base64url: publicKey = ruwe P-256-punt (65 bytes), privateKey = d (32 bytes). */
export interface Vapid {
  publicKey: string
  privateKey: string
  /** mailto: of https-URL, zodat de push-dienst weet wie er stuurt */
  subject: string
}

const enc = new TextEncoder()
/** bytes op een gewone ArrayBuffer (wat WebCrypto wil) */
type Bytes = Uint8Array<ArrayBuffer>

export function b64u(bytes: Bytes): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64u(s: string): Bytes {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/** HKDF-SHA256 (extract + één expand-blok, dus max 32 bytes). */
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const prk = await hmac(salt, ikm)
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length)
}

function privateJwk(d: Bytes, publicRaw: Bytes): JsonWebKey {
  return { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(publicRaw.slice(1, 33)), y: b64u(publicRaw.slice(33, 65)), ext: true }
}

/** Een server-sleutelpaar voor één bericht (RFC 8291 wil per bericht een nieuw paar). */
export interface EcdhPair {
  publicRaw: Bytes
  privateKey: CryptoKey
}

async function freshPair(): Promise<EcdhPair> {
  const k = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  return { publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey)), privateKey: k.privateKey }
}

/** Alleen voor de test met de RFC-vector: een vast sleutelpaar inlezen. */
export async function importPair(publicKey: string, privateKey: string): Promise<EcdhPair> {
  const publicRaw = fromB64u(publicKey)
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk(fromB64u(privateKey), publicRaw),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  return { publicRaw, privateKey: key }
}

/** Versleutelt een bericht voor één abonnement (aes128gcm, één record van 4096). */
export async function encrypt(
  plaintext: Bytes,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  fixed?: { pair: EcdhPair; salt: Bytes },
): Promise<Bytes> {
  const pair = fixed?.pair ?? (await freshPair())
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const uaRaw = fromB64u(target.p256dh)
  const uaKey = await crypto.subtle.importKey('raw', uaRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, pair.privateKey, 256))

  const ikm = await hkdf(fromB64u(target.auth), ecdh, concat(enc.encode('WebPush: info\0'), uaRaw, pair.publicRaw), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const padded = concat(plaintext, new Uint8Array([2])) // 0x02 = laatste record, geen extra padding
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, padded))

  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = pair.publicRaw.length
  return concat(header, pair.publicRaw, cipher)
}

/** VAPID-token (JWT, ES256) voor de push-dienst van dit abonnement. */
export async function vapidToken(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const pub = fromB64u(vapid.publicKey)
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk(fromB64u(vapid.privateKey), pub),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const part = (o: unknown) => b64u(enc.encode(JSON.stringify(o)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 3600,
    sub: vapid.subject,
  })}`
  // WebCrypto geeft r||s (64 bytes), precies wat JWS wil
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)))
  return `${unsigned}.${b64u(sig)}`
}

export interface SendResult {
  ok: boolean
  status: number
  /** abonnement bestaat niet meer: weggooien */
  gone: boolean
}

export async function sendPush(
  target: PushTarget,
  payload: string,
  vapid: Vapid,
  opts: { ttl?: number; urgency?: 'low' | 'normal' | 'high'; topic?: string } = {},
): Promise<SendResult> {
  const body = await encrypt(enc.encode(payload), target)
  const headers: Record<string, string> = {
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttl ?? 24 * 3600),
    Urgency: opts.urgency ?? 'normal',
    Authorization: `vapid t=${await vapidToken(target.endpoint, vapid)}, k=${vapid.publicKey}`,
  }
  // Topic: een nieuwer bericht met hetzelfde topic vervangt een nog niet afgeleverd oud bericht
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  const res = await fetch(target.endpoint, { method: 'POST', headers, body })
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 }
}

/** Nieuw VAPID-sleutelpaar (eenmalig, via de deploy-workflow). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const k = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', k.privateKey)
  return { publicKey: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))), privateKey: jwk.d! }
}
