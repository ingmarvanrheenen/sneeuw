// Maakt een VAPID-sleutelpaar voor push-meldingen, als env-bestand op stdout:
//   VAPID_PUBLIC_KEY=...  (ruwe P-256-punt, base64url)
//   VAPID_PRIVATE_KEY=... (d, base64url)
// Gebruikt door .github/workflows/deploy-functions.yml, die het meteen als Supabase secret zet.
// Niet in een log of chat plakken: met de private key kan iedereen je gebruikers pushen.
const b64u = (buf) => Buffer.from(buf).toString('base64url')
const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
const pub = await crypto.subtle.exportKey('raw', k.publicKey)
const { d } = await crypto.subtle.exportKey('jwk', k.privateKey)
process.stdout.write(`VAPID_PUBLIC_KEY=${b64u(pub)}\nVAPID_PRIVATE_KEY=${d}\n`)
