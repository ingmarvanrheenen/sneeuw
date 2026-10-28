// Rendert public/icons/icon.svg naar de PNG's die iOS en het PWA-manifest nodig hebben.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// Playwright hoeft geen dependency van het project te zijn; een globale installatie is genoeg.
const { chromium } = createRequire(import.meta.url)('playwright')

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8')
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, square: false },
  { file: 'icon-512.png', size: 512, pad: 0, square: false },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.12, square: true },
  // iOS maakt zelf ronde hoeken, dus hier een vierkant icoon zonder transparantie
  { file: 'apple-touch-icon.png', size: 180, pad: 0, square: true },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const t of targets) {
  const inner = t.square ? svg.replaceAll('rx="112"', 'rx="0"') : svg
  const pad = Math.round(t.size * t.pad)
  await page.setViewportSize({ width: t.size, height: t.size })
  await page.setContent(
    `<body style="margin:0;background:${t.square ? '#0d0d0f' : 'transparent'}">
      <div style="width:${t.size}px;height:${t.size}px;padding:${pad}px;box-sizing:border-box">
        ${inner.replace('<svg ', '<svg width="100%" height="100%" ')}
      </div></body>`,
  )
  await page.screenshot({ path: new URL(`../public/icons/${t.file}`, import.meta.url).pathname, omitBackground: !t.square })
}
await browser.close()
console.log('iconen klaar')
