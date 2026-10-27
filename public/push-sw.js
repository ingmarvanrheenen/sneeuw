// Push-meldingen in de service worker (geladen via workbox importScripts, zie vite.config.ts).
// iOS trekt je toestemming in als een push geen melding toont, dus er komt altijd een melding.
/* eslint-env serviceworker */

self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = { body: event.data ? event.data.text() : '' }
  }
  const scope = self.registration.scope
  event.waitUntil(
    self.registration.showNotification(msg.title || 'Sneeuw Daddy', {
      body: msg.body || '',
      tag: msg.tag || undefined,
      icon: scope + 'icons/icon-192.png',
      badge: scope + 'icons/icon-192.png',
      data: { url: msg.url || '#/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const hash = (event.notification.data && event.notification.data.url) || '#/'
  const url = new URL(hash, self.registration.scope).href
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const app = open.find((c) => c.url.startsWith(self.registration.scope))
      if (app) {
        // de app staat al open: daarheen en naar de juiste pagina (hash-router)
        app.postMessage({ type: 'open', url: hash })
        return app.focus()
      }
      return self.clients.openWindow(url)
    })(),
  )
})
