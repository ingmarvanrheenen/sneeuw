import { createStore } from './store'

export const updateStore = createStore<{ ready: boolean; apply?: () => void }>({ ready: false })

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const update = registerSW({
        onNeedRefresh() {
          updateStore.set({ ready: true, apply: () => void update(true) })
        },
      })
    })
    .catch(() => {
      /* bijv. in een sandbox zonder service workers */
    })
}

/** Tik op een push-melding terwijl de app al open staat: de service worker vraagt ons die pagina te openen. */
export function listenForNotificationClicks() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; url?: string } | null
    if (d?.type === 'open' && typeof d.url === 'string' && d.url.startsWith('#/')) location.hash = d.url.slice(1)
  })
}

/** iOS heeft geen install-prompt: we leggen het zelf uit. */
export function isIOS() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}
