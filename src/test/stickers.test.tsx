// Stickers voor stemmingen en crew-reacties.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MoodPick, MoodSticker, REACTION_ART, ReactionSticker } from '../design/Stickers'
import { Mood, MOOD_LABELS } from '../design/icons'
import { REACTIONS } from '../lib/crew'

afterEach(() => cleanup())

describe('stickers', () => {
  it('elke stemming heeft een eigen sticker met de naam erbij; buiten 1-5 wordt hij afgerond', () => {
    const html = [1, 2, 3, 4, 5].map((v) => {
      const { container, unmount } = render(<Mood value={v} />)
      expect(screen.getByRole('img', { name: MOOD_LABELS[v - 1] })).toBeTruthy()
      const out = container.innerHTML
      unmount()
      return out
    })
    expect(new Set(html).size).toBe(5)
    const { container } = render(<MoodSticker value={9} />)
    expect(container.innerHTML).toBe(html[4].replace(/ role="img" aria-label="Episch"/, ' aria-hidden="true"'))
  })

  it('elke crew-reactie heeft een sticker; een onbekende sleutel tekent niks', () => {
    for (const r of REACTIONS) expect(REACTION_ART[r.key]).toBeTruthy()
    const { container } = render(<ReactionSticker kind="bestaat-niet" />)
    expect(container.innerHTML).toBe('')
  })

  it('in de kiezer klapt de gekozen sticker erop, de rest staat grijzig', () => {
    const { container } = render(
      <>
        <MoodPick value={4} on />
        <MoodPick value={2} on={false} />
      </>,
    )
    const [on, off] = container.querySelectorAll(':scope > span')
    expect(on.className).toContain('slap')
    expect(off.className).toContain('grayscale')
  })
})
