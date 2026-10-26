import { describe, expect, it } from 'vitest'
import { isSecretSupabaseKey, pickSupabaseKey } from '../lib/supabaseKey'

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.handtekening`

describe('supabase key check', () => {
  it('blokkeert secret en service_role keys', () => {
    expect(isSecretSupabaseKey('sb_secret_abc123')).toBe(true)
    expect(isSecretSupabaseKey(jwt({ role: 'service_role', ref: 'x' }))).toBe(true)
  })
  it('laat publieke keys door', () => {
    expect(isSecretSupabaseKey('sb_publishable_abc123')).toBe(false)
    expect(isSecretSupabaseKey(jwt({ role: 'anon', ref: 'x' }))).toBe(false)
    expect(isSecretSupabaseKey('')).toBe(false)
    expect(isSecretSupabaseKey(undefined)).toBe(false)
  })
})

describe('key kiezen uit env', () => {
  it('slaat secret keys over en pakt de publieke', () => {
    const r = pickSupabaseKey({ VITE_SUPABASE_ANON_KEY: 'sb_secret_x', SUPABASE_ANON_KEY: 'sb_publishable_y' })
    expect(r.key).toBe('sb_publishable_y')
    expect(r.source).toBe('SUPABASE_ANON_KEY')
    expect(r.secretVars).toEqual(['VITE_SUPABASE_ANON_KEY'])
  })
  it('geeft niks als er alleen secrets zijn', () => {
    expect(pickSupabaseKey({ SUPABASE_ANON_KEY: 'sb_secret_x' }).key).toBe('')
  })
})
