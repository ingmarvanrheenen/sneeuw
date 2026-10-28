// Liftpraat: elke dag één korte vraag voor in de lift, plus een weetje. De vraag hangt af van de datum, dus
// vandaag blijft het dezelfde vraag. Je streak telt hoeveel dagen op rij je hem beantwoord hebt (goed of fout).
// Alleen lokaal, net als je quizscore; een goed antwoord telt mee voor je quiz-XP.
import { kvGet, kvSet } from './db'
import { seeded } from './random'
import { textQuestion, type QuizQuestion } from './quizQuestions'
import { LIFT_FACTS } from '../content/liftFacts'

export interface LiftAnswer {
  /** het gekozen antwoord */
  chosen: string
  correct: boolean
}

export type LiftLog = Record<string, LiftAnswer>

const KEY = 'liftpraat'

export const questionFor = (date: string): QuizQuestion => textQuestion(seeded(`lift:${date}`))
export const factFor = (date: string): string => LIFT_FACTS[Math.floor(seeded(`feit:${date}`)() * LIFT_FACTS.length)]

const DAY = 86_400_000
const dayNum = (date: string) => Math.round(Date.parse(`${date}T12:00:00Z`) / DAY)

/** Huidige streak (tot vandaag, of tot gisteren als je vandaag nog niet geantwoord hebt) en je beste ooit. */
export function liftStreak(log: LiftLog, today: string): { current: number; best: number } {
  const days = new Set(Object.keys(log).map(dayNum))
  const t = dayNum(today)
  let start = days.has(t) ? t : t - 1
  let current = 0
  while (days.has(start)) {
    current++
    start--
  }
  const sorted = [...days].sort((a, b) => a - b)
  let best = 0
  let run = 0
  sorted.forEach((n, i) => {
    run = i && n === sorted[i - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  })
  return { current, best }
}

export function loadLift(): Promise<LiftLog> {
  return kvGet<LiftLog>(KEY, {})
}

/** Slaat je antwoord van vandaag op. Alleen het eerste antwoord telt; goed = +1 voor je quiz-XP. */
export async function answerLift(date: string, chosen: string): Promise<LiftLog> {
  const log = await loadLift()
  if (log[date]) return log
  const correct = chosen === questionFor(date).answer
  const next = { ...log, [date]: { chosen, correct } }
  await kvSet(KEY, next)
  if (correct) await kvSet('quizCorrect', (await kvGet('quizCorrect', 0)) + 1)
  return next
}
