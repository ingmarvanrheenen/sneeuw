// Park-stijl: de tabbalk met de schuivende pil, en de kleur-tokens.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TabBar, activeTab } from '../App'
import { Button, Section } from '../components/ui'

afterEach(() => cleanup())

const bar = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TabBar />
    </MemoryRouter>,
  )
const pill = () => screen.getByTestId('tab-pill')

describe('tabbalk', () => {
  it('de pil staat onder de tab waar je bent, ook op een subpagina', () => {
    expect(activeTab('/')).toBe(0)
    expect(activeTab('/log/abc')).toBe(1)
    expect(activeTab('/tricks/ollie')).toBe(2)
    expect(activeTab('/crew')).toBe(3)
    expect(activeTab('/stats')).toBe(-1)
    expect(activeTab('/logboek-bestaat-niet')).toBe(-1)
  })

  it('schuift mee als je van tab wisselt', async () => {
    const user = userEvent.setup()
    bar('/')
    expect(pill().style.transform).toBe('translateX(0%)')
    await user.click(screen.getByRole('link', { name: /Crew/ }))
    expect(pill().style.transform).toBe('translateX(300%)')
    expect(screen.getByRole('link', { name: /Crew/ }).getAttribute('aria-current')).toBe('page')
  })

  it('op een pagina zonder tab is de pil weg; in de editor en bij de coach geen tabbalk', () => {
    bar('/stats')
    expect(pill().className).toContain('opacity-0')
    cleanup()
    bar('/coach')
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

describe('basis-componenten', () => {
  it('primaire knop heeft de harde schaduw; sectiekop heeft een lijn', () => {
    render(
      <Section title="Dagopdracht">
        <Button>Log je dag</Button>
      </Section>,
    )
    expect(screen.getByRole('button', { name: 'Log je dag' }).className).toContain('shadow-hard')
    expect(screen.getByRole('heading', { name: 'Dagopdracht' }).nextElementSibling?.className).toContain('rule')
  })
})

describe('kleur-tokens', () => {
  const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8')
  const tokens = (from: string, to: string) => {
    const block = css.slice(css.indexOf(from), css.indexOf(to, css.indexOf(from)))
    return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]))
  }
  const light = tokens(':root {', '}')
  const darkMedia = tokens('@media (prefers-color-scheme: dark)', '\n}\n')
  const darkForced = tokens(":root[data-theme='dark']", '}')

  it('licht en donker hebben dezelfde tokens, en de twee donker-blokken zijn gelijk', () => {
    expect(Object.keys(darkMedia).sort()).toEqual(Object.keys(light).sort())
    expect(darkForced).toEqual(darkMedia)
  })

  it('de tab-pil is in beide modi lime', () => {
    expect(light['--tab-pill']).toBe('#d7ff3c')
    expect(darkMedia['--tab-pill']).toBe('#d7ff3c')
  })
})

describe('design-pagina', () => {
  it('toont de poster, alle stickers, en "Opnieuw" speelt de animaties opnieuw af', async () => {
    const { default: DesignSystem } = await import('../pages/DesignSystem')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DesignSystem />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('group', { name: /^Level 4,/ }).length).toBeGreaterThan(0)
    for (const label of ['Kapot', 'Meh', 'Prima', 'Chill', 'Episch']) expect(screen.getByRole('button', { name: label })).toBeTruthy()
    const rise = screen.getByText('Rise')
    await user.click(screen.getByRole('button', { name: 'Opnieuw' }))
    expect(screen.getByText('Rise')).not.toBe(rise)
    await user.click(screen.getByRole('button', { name: 'Kapot' }))
    expect(screen.getByRole('button', { name: 'Kapot' }).getAttribute('aria-pressed')).toBe('true')
  })
})
