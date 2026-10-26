/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// BASE_PATH is gezet door de GitHub Pages workflow (bijv. "/sneeuw/").
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
})
