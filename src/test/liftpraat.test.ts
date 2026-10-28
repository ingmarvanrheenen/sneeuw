import { beforeEach, describe, expect, it } from 'vitest'
import { answerLift, factFor, liftStreak, loadLift, questionFor } from '../lib/liftpraat'
import { quizRound, textQuestion } from '../lib/quizQuestions'
import { seeded } from '../lib/random'
import { LIFT_FACTS } from '../content/liftFacts'
import { BADGES, type ProgressInput } from '../lib/progress'
import { db, kvGet } from '../lib/db'

const valid = (q: { options: string[]; answer: string }) => {
  expect(q.options).toHaveLength(4)
  expect(new Set(q.options).size).toBe(4)
  expect(q.options).toContain(q.answer)
}

describe('vragen', () => {
  it('een quizronde heeft altijd 10 verschillende vragen, ook als er dubbele of lege tussen zaten', () => {
    for (let n = 0; n < 400; n++) {
      const round = quizRound(seeded(`ronde-${n}`))
      expect(round, `seed ronde-${n}`).toHaveLength(10)
      expect(new Set(round.map((q) => q.prompt + q.answer)).size).toBe(10)
    }
  })

  it('liftvraag: elke dag één geldige vraag zonder animatie, en vandaag blijft hij hetzelfde', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2027-02-${String(d).padStart(2, '0')}`
      const q = questionFor(date)
      valid(q)
      expect(q.anim).toBeUndefined()
      expect(questionFor(date)).toEqual(q)
    }
    // niet elke dag dezelfde
    expect(new Set(Array.from({ length: 10 }, (_, i) => questionFor(`2027-03-0${i}`).prompt)).size).toBeGreaterThan(5)
  })

  it('quizronde: 10 geldige vragen zonder dubbele', () => {
    for (let r = 0; r < 20; r++) {
      const qs = quizRound(seeded(`ronde${r}`))
      expect(qs.length).toBeGreaterThanOrEqual(8)
      qs.forEach(valid)
      expect(new Set(qs.map((q) => q.prompt + q.answer)).size).toBe(qs.length)
    }
  })

  it('tekstvraag met dezelfde seed: dezelfde vraag', () => {
    expect(textQuestion(seeded('x'))).toEqual(textQuestion(seeded('x')))
  })

  it('weetjes: per dag vast, kort genoeg, geen emoji', () => {
    expect(factFor('2027-01-16')).toBe(factFor('2027-01-16'))
    expect(LIFT_FACTS).toContain(factFor('2027-01-16'))
    for (const f of LIFT_FACTS) {
      expect(f.length).toBeLessThanOrEqual(140)
      expect(f).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})

describe('streak', () => {
  const a = { chosen: 'x', correct: true }
  it('dagen op rij, ook als je vandaag nog niet geantwoord hebt', () => {
    const log = { '2027-01-14': a, '2027-01-15': a, '2027-01-16': a }
    expect(liftStreak(log, '2027-01-16')).toEqual({ current: 3, best: 3 })
    // vandaag nog niks: de streak van tot gisteren leeft nog
    expect(liftStreak(log, '2027-01-17')).toEqual({ current: 3, best: 3 })
    // een dag overgeslagen: weg
    expect(liftStreak(log, '2027-01-18')).toEqual({ current: 0, best: 3 })
  })

  it('beste reeks ooit, ook over een maandgrens', () => {
    const log = Object.fromEntries(['2027-01-29', '2027-01-30', '2027-01-31', '2027-02-01', '2027-02-05'].map((d) => [d, a]))
    expect(liftStreak(log, '2027-02-05')).toEqual({ current: 1, best: 4 })
  })
})

describe('antwoorden', () => {
  beforeEach(async () => {
    await db.kv.clear()
  })

  it('alleen je eerste antwoord telt; goed geeft quiz-XP, fout niet', async () => {
    const q = questionFor('2027-01-16')
    const wrong = q.options.find((o) => o !== q.answer)!
    await answerLift('2027-01-16', wrong)
    await answerLift('2027-01-16', q.answer)
    expect((await loadLift())['2027-01-16']).toEqual({ chosen: wrong, correct: false })
    expect(await kvGet('quizCorrect', 0)).toBe(0)
    const q2 = questionFor('2027-01-17')
    await answerLift('2027-01-17', q2.answer)
    expect((await loadLift())['2027-01-17'].correct).toBe(true)
    expect(await kvGet('quizCorrect', 0)).toBe(1)
  })

  it('badge bij 7 dagen op rij', () => {
    const badge = BADGES.find((b) => b.id === 'liftpraat-7')!
    const input = { liftBest: 6 } as ProgressInput
    expect(badge.test(input)).toBe(false)
    expect(badge.test({ ...input, liftBest: 7 })).toBe(true)
  })
})
