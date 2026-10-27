import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Laadt public/push-sw.js in een nagebootste service worker.
const code = readFileSync(resolve(__dirname, '../../public/push-sw.js'), 'utf8')
const SCOPE = 'https://sneeuw.vercel.app/'
let handlers: Record<string, (e: unknown) => void>
let showNotification: ReturnType<typeof vi.fn>
let clients: { matchAll: ReturnType<typeof vi.fn>; openWindow: ReturnType<typeof vi.fn> }

beforeEach(() => {
  handlers = {}
  showNotification = vi.fn().mockResolvedValue(undefined)
  clients = { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn().mockResolvedValue(null) }
  const self = {
    addEventListener: (t: string, fn: (e: unknown) => void) => (handlers[t] = fn),
    registration: { scope: SCOPE, showNotification },
    clients,
  }
  new Function('self', code)(self)
})

function fire(type: string, extra: Record<string, unknown>) {
  let wait: Promise<unknown> = Promise.resolve()
  handlers[type]({ ...extra, waitUntil: (p: Promise<unknown>) => (wait = p) })
  return wait
}

describe('service worker: push', () => {
  it('toont de melding met titel, tekst, tag en link', async () => {
    const payload = { title: 'Daan heeft een dag gedeeld', body: 'Val Thorens · 5 u', url: '#/crew', tag: 'day-1' }
    await fire('push', { data: { json: () => payload, text: () => '' } })
    expect(showNotification).toHaveBeenCalledWith('Daan heeft een dag gedeeld', {
      body: 'Val Thorens · 5 u',
      tag: 'day-1',
      icon: SCOPE + 'icons/icon-192.png',
      badge: SCOPE + 'icons/icon-192.png',
      data: { url: '#/crew' },
    })
  })

  it('toont altijd iets, ook bij een kapot of leeg bericht (anders trekt iOS de toestemming in)', async () => {
    await fire('push', { data: { json: () => JSON.parse('kapot'), text: () => 'hallo' } })
    expect(showNotification).toHaveBeenLastCalledWith('Sneeuw Daddy', expect.objectContaining({ body: 'hallo', data: { url: '#/' } }))
    await fire('push', { data: null })
    expect(showNotification).toHaveBeenCalledTimes(2)
  })
})

describe('service worker: tik op de melding', () => {
  const click = (url: string) => {
    const close = vi.fn()
    return { close, done: fire('notificationclick', { notification: { close, data: { url } } }) }
  }

  it('app dicht: opent de app op de juiste pagina', async () => {
    const { close, done } = click('#/reizen/crew/t1')
    await done
    expect(close).toHaveBeenCalled()
    expect(clients.openWindow).toHaveBeenCalledWith(SCOPE + '#/reizen/crew/t1')
  })

  it('app open: focus en naar de pagina, geen tweede venster', async () => {
    const app = { url: SCOPE + '#/', postMessage: vi.fn(), focus: vi.fn().mockResolvedValue(undefined) }
    clients.matchAll.mockResolvedValue([app])
    await click('#/crew').done
    expect(app.postMessage).toHaveBeenCalledWith({ type: 'open', url: '#/crew' })
    expect(app.focus).toHaveBeenCalled()
    expect(clients.openWindow).not.toHaveBeenCalled()
  })
})
