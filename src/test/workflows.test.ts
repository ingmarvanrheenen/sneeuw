// De migratie-workflow: alleen handmatig, en elke migratie moet een naam hebben die hij accepteert.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const wf = readFileSync(join(root, '.github', 'workflows', 'run-migration.yml'), 'utf8')
const NAME = /^[0-9]{14}_[a-z0-9_]+\.sql$/

describe('run-migration workflow', () => {
  it('draait alleen handmatig, op één bestand, met de token uit de secrets', () => {
    expect(wf).toMatch(/on:\s*\n\s*workflow_dispatch:/)
    expect(wf).not.toMatch(/^\s*(push|pull_request|schedule):/m)
    expect(wf).toContain('secrets.SUPABASE_ACCESS_TOKEN')
    expect(wf).toContain('^[0-9]{14}_[a-z0-9_]+\\.sql$')
  })

  it('elke migratie heeft een naam die de workflow accepteert (geen paden of rare tekens)', () => {
    const files = readdirSync(join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(f).toMatch(NAME)
    expect('../../etc/passwd.sql').not.toMatch(NAME)
  })
})
