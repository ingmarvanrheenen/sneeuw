// Design-regel: nooit emoji in de app. Iconen komen uit src/design/icons.tsx.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(p) ? [p] : []
  })
}

describe('design system', () => {
  it('bevat geen emoji', () => {
    const offenders = files(join(__dirname, '..')).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => (EMOJI.test(line) && !f.endsWith('design.test.ts') ? `${f}:${i + 1}` : null))
        .filter(Boolean),
    )
    expect(offenders).toEqual([])
  })
})
