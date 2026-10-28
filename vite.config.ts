/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }
import { pickSupabaseKey } from './src/lib/supabaseKey'

// BASE_PATH: alleen nodig als de app op een subpad draait (bijv. "/sneeuw/").
const base = process.env.BASE_PATH ?? '/'

// Supabase-config accepteert ook de namen die de Vercel-Supabase-integratie zet.
// Bewust alleen de publieke URL en de anon/publishable key, nooit de service-role key.
const first = (env: Record<string, string | undefined>, names: string[]) => names.map((n) => env[n]).find((v) => v) ?? ''

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const supabaseUrl = first(env, ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'])
  const { key: supabaseKey, source: keySource, secretVars } = pickSupabaseKey(env)
  if (secretVars.length && !supabaseKey) {
    // Liever een gefaalde build dan een gelekte key die je hele database openzet.
    throw new Error(
      `Supabase: ${secretVars.join(', ')} bevat een SECRET/service_role key en er is geen publieke key gevonden. ` +
        'Zet de publishable (sb_publishable_...) of anon key in VITE_SUPABASE_ANON_KEY en trek de secret key in via Supabase → Project Settings → API Keys.',
    )
  }
  if (secretVars.length) {
    console.warn(`\n[sneeuw] Let op: ${secretVars.join(', ')} bevat een secret key. Die wordt genegeerd; de app gebruikt ${keySource}.\n`)
  }
  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseKey),
      'import.meta.env.VITE_SUPABASE_KEY_SOURCE': JSON.stringify(keySource),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icons/*.png', 'icons/*.svg'],
        manifest: {
          name: 'Sneeuw Daddy',
          short_name: 'Sneeuw Daddy',
          description: 'Je snowboard logboek, trick-bijbel en crew in één app.',
          lang: 'nl',
          theme_color: '#0b0d0a',
          background_color: '#0b0d0a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Log je dag', short_name: 'Log', url: './#/log/nieuw' },
            { name: 'Tricks', short_name: 'Tricks', url: './#/tricks' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Alleen Latijnse fonts precachen; andere subsets laadt de browser alleen als nodig
          globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
          navigateFallback: 'index.html',
          // push-meldingen tonen en openen (public/push-sw.js)
          importScripts: ['push-sw.js'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.hostname === 'api.open-meteo.com',
              handler: 'NetworkFirst',
              options: { cacheName: 'weer', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 3 } },
            },
            {
              urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/'),
              handler: 'CacheFirst',
              options: { cacheName: 'crew-media', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
          ],
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }
})
