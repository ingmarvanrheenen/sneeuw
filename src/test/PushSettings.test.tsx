import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => {
  class PushDenied extends Error {}
  return {
    PushDenied,
    getPushState: vi.fn(),
    enablePush: vi.fn(),
    disablePush: vi.fn(),
    setPushPref: vi.fn(),
    sendTestPush: vi.fn(),
  }
})
vi.mock('../lib/push', () => api)

import { PushNudge, PushSettings } from '../components/PushSettings'
import { db } from '../lib/db'
import { toastStore } from '../lib/toast'

const PREFS = { crew_days: true, goals: true, reminder: true }
const switchFor = (name: string) => screen.getByRole('switch', { name: new RegExp(name) })

beforeEach(async () => {
  await db.kv.clear()
  toastStore.set([])
  api.getPushState.mockResolvedValue({ status: 'off' })
  api.enablePush.mockResolvedValue(PREFS)
  for (const f of [api.disablePush, api.setPushPref, api.sendTestPush]) f.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('meldingen in Instellingen', () => {
  it('niet op het beginscherm: uitleg hoe je hem installeert', async () => {
    api.getPushState.mockResolvedValue({ status: 'install' })
    render(<PushSettings />)
    expect(await screen.findByText('Zet de app eerst op je beginscherm')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('geweigerd: waar je het in iOS aanzet', async () => {
    api.getPushState.mockResolvedValue({ status: 'denied' })
    render(<PushSettings />)
    expect(await screen.findByText(/Instellingen, Meldingen, Sneeuw Daddy/)).toBeTruthy()
  })

  it('aanzetten: daarna per soort te kiezen en een testmelding', async () => {
    const user = userEvent.setup()
    render(<PushSettings />)
    await user.click(await screen.findByRole('switch', { name: /Meldingen op deze telefoon/ }))
    expect(api.enablePush).toHaveBeenCalled()
    expect(await screen.findByRole('switch', { name: /Crew deelt een dag/ })).toBeTruthy()
    expect(switchFor('Crew-doelen').getAttribute('aria-checked')).toBe('true')
    expect(switchFor('Log je dag').getAttribute('aria-checked')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Stuur een testmelding' }))
    expect(api.sendTestPush).toHaveBeenCalled()
  })

  it('aanzetten maar toestemming geweigerd: laat zien hoe het wel kan', async () => {
    const user = userEvent.setup()
    api.enablePush.mockRejectedValue(new api.PushDenied())
    render(<PushSettings />)
    await user.click(await screen.findByRole('switch', { name: /Meldingen op deze telefoon/ }))
    expect(await screen.findByText(/Instellingen, Meldingen, Sneeuw Daddy/)).toBeTruthy()
  })

  it('soort uitzetten wordt opgeslagen; mislukt het, dan terug', async () => {
    const user = userEvent.setup()
    api.getPushState.mockResolvedValue({ status: 'on', prefs: PREFS })
    render(<PushSettings />)
    await user.click(await screen.findByRole('switch', { name: /Log je dag/ }))
    expect(api.setPushPref).toHaveBeenCalledWith('reminder', false)
    expect(switchFor('Log je dag').getAttribute('aria-checked')).toBe('false')

    api.setPushPref.mockRejectedValue(new Error('nope'))
    await user.click(switchFor('Crew-doelen'))
    await waitFor(() => expect(switchFor('Crew-doelen').getAttribute('aria-checked')).toBe('true'))
    expect(toastStore.get().some((t) => t.title === 'Niet opgeslagen')).toBe(true)
  })

  it('helemaal uit', async () => {
    const user = userEvent.setup()
    api.getPushState.mockResolvedValue({ status: 'on', prefs: PREFS })
    render(<PushSettings />)
    await user.click(await screen.findByRole('switch', { name: /Meldingen op deze telefoon/ }))
    expect(api.disablePush).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('switch', { name: /Crew deelt een dag/ })).toBeNull())
  })
})

describe('duwtje op de crew-pagina', () => {
  it('vraagt het één keer; "Niet nu" onthoudt hij', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<PushNudge />)
    await user.click(await screen.findByRole('button', { name: 'Niet nu' }))
    expect(screen.queryByText('Weten wat je crew doet?')).toBeNull()
    unmount()
    render(<PushNudge />)
    await waitFor(() => expect(api.getPushState).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Weten wat je crew doet?')).toBeNull()
  })

  it('"Meldingen aan" zet ze aan en verdwijnt', async () => {
    const user = userEvent.setup()
    render(<PushNudge />)
    await user.click(await screen.findByRole('button', { name: 'Meldingen aan' }))
    expect(api.enablePush).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Weten wat je crew doet?')).toBeNull())
  })

  it('niet tonen als meldingen al aan staan of niet kunnen', async () => {
    api.getPushState.mockResolvedValue({ status: 'install' })
    render(<PushNudge />)
    await waitFor(() => expect(api.getPushState).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('Weten wat je crew doet?')).toBeNull()
  })
})
