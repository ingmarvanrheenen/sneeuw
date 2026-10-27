import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PageHeader } from '../components/ui'

const scrollTo = (y: number) =>
  act(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
    window.dispatchEvent(new Event('scroll'))
  })

afterEach(() => {
  cleanup()
  scrollTo(0)
})

function setup() {
  render(
    <MemoryRouter>
      <PageHeader title="Trips" back right={<button>Trip</button>} />
    </MemoryRouter>,
  )
}

describe('paginakop', () => {
  it('bovenaan: knoppen bestaan maar één keer (de verborgen compacte balk telt niet mee)', () => {
    setup()
    expect(screen.getAllByRole('button', { name: 'Trip' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Terug/ })).toHaveLength(1)
  })

  it('na scrollen: de compacte balk is bruikbaar', () => {
    setup()
    scrollTo(200)
    expect(screen.getAllByRole('button', { name: 'Trip' }).length).toBeGreaterThanOrEqual(1)
    const bar = screen.getAllByRole('button', { name: 'Trip' })[0].closest('[aria-hidden]')
    expect(bar?.getAttribute('aria-hidden')).toBe('false')
  })
})
