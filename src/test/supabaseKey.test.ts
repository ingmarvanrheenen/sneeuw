import { describe, expect, it } from 'vitest'
import { isSecretSupabaseKey } from '../lib/supabaseKey'

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
