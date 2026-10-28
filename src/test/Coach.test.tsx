import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const coach = vi.hoisted(() => ({ streamCoach: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: null, hasBackend: true, backendInfo: {} }))
vi.mock('../lib/coach', async (orig) => ({ ...(await orig<typeof import('../lib/coach')>()), streamCoach: coach.streamCoach }))

import Coach, { techniqueQuestion } from '../pages/Coach'
import { CoachError, addMemory, listMemory, type CoachAction, type Conversation, type StreamHandlers } from '../lib/coach'
import { authStore } from '../lib/auth'
import { setCurrentUserId } from '../lib/auth-state'
import { db } from '../lib/db'
import { create, listKind } from '../lib/repo'
import type { User } from '@supabase/supabase-js'

/** Nep-coach: schrijft tekst en zet knoppen neer, zoals de echte stream. */
function answers(text: string, actions: CoachAction[] = []) {
  coach.streamCoach.mockImplementationOnce(async (_c: Conversation, h: StreamHandlers) => {
    h.onText(text)
    for (const a of actions) h.onAction?.(a)
    return { text, actions }
  })
}

const sent = (call = 0) => coach.streamCoach.mock.calls[call][0] as Conversation

const open = (url = '/coach') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Coach />
    </MemoryRouter>,
  )

beforeEach(async () => {
  await db.records.clear()
  await db.kv.clear()
  await db.blobs.clear()
  setCurrentUserId('me')
  authStore.set({ user: { id: 'me' } as User, ready: true })
  coach.streamCoach.mockReset()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,QUJD')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('startscherm', () => {
  it('techniek-check, vragen en geheugen als lijsten, zonder label boven de titels', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'Techniek-check' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Vraag maar raak' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Wat de coach van je weet' })).toBeTruthy()
    expect(screen.queryByText('Probeer')).toBeNull()
    expect(screen.getByRole('button', { name: /Maak een oefenplan voor mijn trip/ })).toBeTruthy()
  })
})

describe('gesprek', () => {
  it('antwoord met een doel-knop: tikken zet het doel en de knop wordt "Gezet"', async () => {
    const user = userEvent.setup()
    answers('Focus eerst op je ollie.', [{ kind: 'doel', titel: 'Ollie landen', trickId: 'ollie' }])
    open()
    await user.click(await screen.findByRole('button', { name: /Wat moet ik als volgende trick leren/ }))
    expect(await screen.findByText('Focus eerst op je ollie.')).toBeTruthy()
    expect(sent().messages.at(-1)).toEqual({ role: 'user', content: 'Wat moet ik als volgende trick leren?' })
    expect(screen.getByText('Ollie landen')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Zet als doel' }))
    expect(await screen.findByText('Gezet')).toBeTruthy()
    const goals = await listKind('goal')
    expect(goals.map((g) => [g.title, g.trickId])).toEqual([['Ollie landen', 'ollie']])
    // ook na opnieuw openen van het gesprek blijft hij gezet
    const saved = (await db.kv.get('coach:conversations'))!.value as Conversation[]
    expect(saved[0].messages[1].applied).toEqual([0])
  })

  it('oefenplan als kaart; "Zet als doelen" maakt een doel per dag', async () => {
    const user = userEvent.setup()
    answers('Hier is je plan.', [
      {
        kind: 'plan',
        titel: 'Plan voor Tignes',
        dagen: [
          { dag: 'Dag 1', focus: 'Heelside turns', oefeningen: ['Falling leaf'] },
          { dag: 'Dag 2', focus: 'Bochten linken', oefeningen: [] },
        ],
      },
    ])
    open()
    await user.click(await screen.findByRole('button', { name: /Maak een oefenplan/ }))
    expect(await screen.findByText('Plan voor Tignes')).toBeTruthy()
    expect(screen.getByText('Falling leaf')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Zet als doelen' }))
    expect(await screen.findByText('Bij je doelen')).toBeTruthy()
    expect((await listKind('goal')).map((g) => g.title).sort()).toEqual(['Dag 1: Heelside turns', 'Dag 2: Bochten linken'])
  })

  it('trick-knop linkt naar de bijbel; onthouden komt meteen in het geheugen', async () => {
    const user = userEvent.setup()
    answers('Check de animatie.', [
      { kind: 'trick', trickId: 'ollie' },
      { kind: 'onthoud', feit: 'Heeft last van zijn linkerpols' },
    ])
    open()
    await user.type(await screen.findByRole('textbox', { name: 'Bericht aan de coach' }), 'Mijn pols doet pijn bij ollies')
    await user.click(screen.getByRole('button', { name: 'Verstuur' }))
    expect((await screen.findByRole('link', { name: /Bekijk de Ollie/ })).getAttribute('href')).toBe('/tricks/ollie')
    expect(screen.getByText('Onthouden: Heeft last van zijn linkerpols')).toBeTruthy()
    await waitFor(async () => expect((await listMemory()).map((m) => m.text)).toEqual(['Heeft last van zijn linkerpols']))
  })

  it('fout van de coach: melding, en wat er al stond blijft staan', async () => {
    const user = userEvent.setup()
    coach.streamCoach.mockImplementationOnce(async (_c: Conversation, h: StreamHandlers) => {
      h.onText('Eerste stuk')
      throw new CoachError('Coach is even overbelast, probeer het zo nog eens.')
    })
    open()
    await user.click(await screen.findByRole('button', { name: /Hoe overleef ik een sleeplift/ }))
    expect(await screen.findByText('Coach is even overbelast, probeer het zo nog eens.')).toBeTruthy()
    expect(screen.getByText('Eerste stuk')).toBeTruthy()
  })
})

describe('geheugen', () => {
  it('laat zien wat de coach weet en je kunt het wissen', async () => {
    const user = userEvent.setup()
    await addMemory('Rijdt goofy')
    open()
    await user.click(await screen.findByRole('button', { name: /Geheugen/ }))
    const sheet = screen.getByRole('dialog', { name: 'Wat de coach van je weet' })
    expect(within(sheet).getByText('Rijdt goofy')).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Vergeet: Rijdt goofy' }))
    expect(await within(sheet).findByText('Nog niks onthouden.')).toBeTruthy()
    expect(await listMemory()).toEqual([])
  })
})

describe('techniek-check', () => {
  it('foto kiezen, trick erbij, en de coach krijgt de foto met de vraag', async () => {
    const user = userEvent.setup()
    answers('Je knieën zijn te gestrekt.')
    open()
    await user.click(await screen.findByRole('button', { name: /Laat de coach meekijken/ }))
    const sheet = screen.getByRole('dialog', { name: 'Techniek-check' })
    await user.upload(within(sheet).getByLabelText('Foto of video kiezen'), new File(['x'], 'ollie.jpg', { type: 'image/jpeg' }))
    expect(within(sheet).getByRole('img', { name: 'Gekozen foto' })).toBeTruthy()
    await user.selectOptions(within(sheet).getByRole('combobox'), 'ollie')
    await user.click(within(sheet).getByRole('button', { name: 'Laat de coach kijken' }))

    expect(await screen.findByText('Je knieën zijn te gestrekt.')).toBeTruthy()
    const q = sent().messages.at(-1)!
    expect(q.image).toEqual({ mediaType: 'image/jpeg', data: 'QUJD' })
    expect(q.content).toBe(techniqueQuestion('ollie'))
    expect(screen.getByRole('img', { name: 'Jouw foto voor de coach' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Techniek-check' })).toBeNull()
  })

  it('vanuit een clip in je kluis: de sheet opent met die video en een schuif voor het moment', async () => {
    const m = await create('media', { type: 'video', mime: 'video/mp4', trickId: 'nollie' })
    await db.blobs.put({ id: m.id, blob: new Blob(['v'], { type: 'video/mp4' }) })
    open(`/coach?media=${m.id}`)
    const sheet = await screen.findByRole('dialog', { name: 'Techniek-check' })
    expect(await within(sheet).findByLabelText('Gekozen video')).toBeTruthy()
    expect(within(sheet).getByRole('slider', { name: 'Moment in de video' })).toBeTruthy()
    // de trick van de clip staat al ingevuld
    expect((within(sheet).getByRole('combobox') as HTMLSelectElement).value).toBe('nollie')
  })

  it('vanuit een trick: sheet open met de trick ingevuld', async () => {
    open('/coach?check=ollie')
    const sheet = await screen.findByRole('dialog', { name: 'Techniek-check' })
    expect(within(sheet).getByRole('button', { name: 'Kies foto of video' })).toBeTruthy()
  })

  it('de vraag noemt de trick en het moment in de video', () => {
    expect(techniqueQuestion('ollie', 1.25)).toBe(
      'Techniek-check: kijk naar mijn Ollie. Dit is een frame uit een video, op 1,3 s. Wat zie je en wat moet ik anders doen?',
    )
    expect(techniqueQuestion(null)).toBe('Techniek-check: kijk naar mijn techniek. Wat zie je en wat moet ik anders doen?')
    expect(techniqueQuestion(null, undefined, 'Ik val steeds')).toContain('\n\nIk val steeds')
  })
})
