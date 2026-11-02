// Stickers cadeau doen: geven, het weeklimiet, plakken op je pas en wat er op de skipas staat.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeSupabase } from './fakeSupabase'

const sb = vi.hoisted(() => ({ ref: null as ReturnType<typeof fakeSupabase> | null }))
vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase')
  sb.ref = fakeSupabase()
  return { supabase: sb.ref.client, hasBackend: true, backendInfo: {} }
})

import { GiveSheet, PassStickers, ReceivedStickers } from '../components/GiftParts'
import { SkiPass } from '../components/RiderParts'
import { giftsLeft, giveSticker, pinnedFor, type Gift } from '../lib/gifts'
import { setCurrentUserId } from '../lib/auth-state'

const fake = () => sb.ref!
const gift = (over: Partial<Gift> = {}): Gift => ({
  id: 'g1',
  from_user: 'daan',
  to_user: 'me',
  sticker: 'goat',
  note: 'die 180 was ziek',
  pinned: false,
  created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  ...over,
})

beforeEach(() => {
  setCurrentUserId('me')
  fake().calls.length = 0
  fake().respond(() => ({ data: [] }))
})
afterEach(() => cleanup())

describe('stickers-logica', () => {
  it('nog over deze week: 3 min wat je de laatste 7 dagen gaf', async () => {
    fake().respond(() => ({ data: [{ id: 'a' }, { id: 'b' }] }))
    expect(await giftsLeft(Date.parse('2027-01-14T12:00:00Z'))).toBe(1)
    const call = fake().calls.at(-1)!
    expect(call.filters).toContainEqual(['eq', 'from_user', 'me'])
    expect(call.filters).toContainEqual(['gt', 'created_at', '2027-01-07T12:00:00.000Z'])
  })

  it('geven: berichtje getrimd en max 60, leeg wordt null; fout van de database in gewone taal', async () => {
    await giveSticker('daan', 'vuur', '  lekker gereden  ')
    expect(fake().calls.at(-1)).toMatchObject({ op: 'insert', payload: { to_user: 'daan', sticker: 'vuur', note: 'lekker gereden' } })
    await giveSticker('daan', 'vuur', '   ')
    expect((fake().calls.at(-1)!.payload as { note: unknown }).note).toBeNull()
    fake().respond(() => ({ error: { code: '23514', message: 'Je hebt deze week al 3 stickers weggegeven' } }))
    await expect(giveSticker('daan', 'rip', '')).rejects.toThrow('Je hebt deze week al 3 stickers weggegeven')
  })

  it('op de pas van een crewgenoot: alleen wat geplakt is', async () => {
    await pinnedFor('daan')
    expect(fake().calls.at(-1)!.filters).toEqual([
      ['eq', 'to_user', 'daan'],
      ['eq', 'pinned', true],
    ])
  })
})

describe('geef een sticker', () => {
  it('kiezen, berichtje erbij, geven', async () => {
    const user = userEvent.setup()
    const sent = vi.fn()
    render(<GiveSheet open name="Daan" toUser="daan" left={2} onClose={() => {}} onSent={sent} />)
    expect(screen.getByText(/nog 2 van de 3/)).toBeTruthy()
    const give = screen.getByRole('button', { name: 'Geef' }) as HTMLButtonElement
    expect(give.disabled).toBe(true)
    await user.click(within(screen.getByRole('group', { name: 'Kies een sticker' })).getByRole('button', { name: /GOAT/ }))
    await user.type(screen.getByLabelText(/Berichtje/), 'die 180')
    await user.click(give)
    await waitFor(() => expect(sent).toHaveBeenCalled())
    expect(fake().calls.at(-1)).toMatchObject({ op: 'insert', payload: { to_user: 'daan', sticker: 'goat', note: 'die 180' } })
  })

  it('deze week op: knop dicht; fout van de server: melding in het scherm', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<GiveSheet open name="Daan" toUser="daan" left={0} onClose={() => {}} onSent={() => {}} />)
    expect((screen.getByRole('button', { name: 'Deze week op' }) as HTMLButtonElement).disabled).toBe(true)
    unmount()
    fake().respond(() => ({ error: { message: 'Je hebt deze week al 3 stickers weggegeven' } }))
    render(<GiveSheet open name="Daan" toUser="daan" left={1} onClose={() => {}} onSent={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Vuur/ }))
    await user.click(screen.getByRole('button', { name: 'Geef' }))
    expect((await screen.findByRole('alert')).textContent).toContain('al 3 stickers')
  })
})

describe('stickers van je crew', () => {
  it('van wie, met berichtje; plakken kan tot er 3 op je pas zitten', async () => {
    const user = userEvent.setup()
    const onPin = vi.fn()
    const gifts = [
      gift(),
      gift({ id: 'g2', sticker: 'vuur', pinned: true }),
      gift({ id: 'g3', sticker: 'lol', pinned: true }),
      gift({ id: 'g4', sticker: 'rip', pinned: true }),
    ]
    render(<ReceivedStickers gifts={gifts} names={{ daan: 'Daan' }} onPin={onPin} onRemove={() => {}} />)
    expect(screen.getByText('GOAT van Daan')).toBeTruthy()
    expect(screen.getAllByText(/“die 180 was ziek” · 3 uur geleden/)).toHaveLength(4)
    // al 3 op de pas: de GOAT kan er niet meer bij
    expect((screen.getByRole('button', { name: 'Plak' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getAllByRole('button', { name: 'Op je pas' })[0])
    expect(onPin).toHaveBeenCalledWith(gifts[1])
  })

  it('geplakte stickers staan op de skipas', () => {
    render(
      <SkiPass
        userId="me"
        name="Ingmar"
        profile={{}}
        level={4}
        levelName="Falling Leaf"
        stickers={[gift({ pinned: true }), gift({ id: 'g2', sticker: 'mood5' })]}
      />,
    )
    const pass = screen.getByRole('group', { name: 'Skipas van Ingmar' })
    expect(within(pass).getByRole('img', { name: 'Geplakt: GOAT, Episch' })).toBeTruthy()
    const { container } = render(<PassStickers gifts={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
