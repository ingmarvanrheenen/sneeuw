import { describe, expect, it } from 'vitest'
import { dayText } from '../lib/coach'
import { EMPTY_DRAFT } from '../lib/sessions'
import type { Session } from '../lib/types'

const session = (patch: Partial<Session>): Session =>
  ({ ...EMPTY_DRAFT, id: 's1', kind: 'session', createdAt: 0, updatedAt: 0, ...patch }) as Session

describe('dagreview', () => {
  it('beschrijft de dag in gewone taal met tricknamen in plaats van ids', () => {
    const t = dayText(
      session({ resortName: 'Tignes', hours: 5, falls: 3, mood: 5, landed: ['ollie'], practiced: ['ollie', 'nollie'], pistes: ['blauw'] }),
    )
    expect(t).toContain('Waar: Tignes')
    expect(t).toContain('Gevallen: 3x')
    expect(t).toContain('Geland: Ollie')
    expect(t).toContain('Geoefend: Nollie')
    expect(t).toContain('Pistes: Blauw')
    expect(t).not.toContain('ollie,')
  })

  it('laat lege velden weg in plaats van "undefined"', () => {
    const t = dayText(session({}))
    expect(t).not.toMatch(/undefined|null/)
    expect(t).not.toContain('Notities')
  })
})
