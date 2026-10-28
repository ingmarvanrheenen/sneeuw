// Quizvragen uit de bijbel en het woordenboek. De quiz en de liftvraag van de dag gebruiken dezelfde vragen;
// met een seeded `rng` krijg je steeds dezelfde (liftvraag), met Math.random elke keer andere (quiz).
import type { Anim } from '../anim/engine'
import { TERMS } from '../content/terms'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import { pick, shuffle } from './random'

export interface QuizQuestion {
  prompt: string
  anim?: Anim
  options: string[]
  answer: string
  explain: string
}

type Rng = () => number

function termToDef(rng: Rng): QuizQuestion {
  const [t] = pick(TERMS, 1, rng)
  const wrong = pick(
    TERMS.filter((x) => x.id !== t.id && x.cat === t.cat && x.def !== t.def),
    3,
    rng,
  ).map((x) => x.def)
  return { prompt: `Wat betekent “${t.term}”?`, options: shuffle([t.def, ...wrong], rng), answer: t.def, explain: `${t.term}: ${t.def}` }
}

function defToTerm(rng: Rng): QuizQuestion {
  const [t] = pick(TERMS, 1, rng)
  const wrong = pick(
    TERMS.filter((x) => x.id !== t.id && x.term !== t.term),
    3,
    rng,
  ).map((x) => x.term)
  return { prompt: t.def, options: shuffle([t.term, ...wrong], rng), answer: t.term, explain: `Dat is “${t.term}”.` }
}

function prereq(rng: Rng): QuizQuestion | null {
  const [t] = pick(
    TRICKS.filter((x) => x.prereqs.length),
    1,
    rng,
  )
  const right = TRICK_BY_ID.get(t.prereqs[0])!.name
  const wrong = pick(
    TRICKS.filter((x) => !t.prereqs.includes(x.id) && x.id !== t.id && x.level >= t.level),
    3,
    rng,
  ).map((x) => x.name)
  if (wrong.length < 3) return null
  return {
    prompt: `Wat kun je het best eerst leren vóór de ${t.name}?`,
    options: shuffle([right, ...wrong], rng),
    answer: right,
    explain: `Voor de ${t.name} is ${right} de basis.`,
  }
}

function whichTrick(rng: Rng): QuizQuestion {
  const animated = TRICKS.filter((t) => t.anim && (t.track === 'park' || t.track === 'flat'))
  const [t] = pick(animated, 1, rng)
  const wrong = pick(
    animated.filter((x) => x.id !== t.id),
    3,
    rng,
  ).map((x) => x.name)
  return {
    prompt: 'Welke trick zie je hier?',
    anim: t.anim,
    options: shuffle([t.name, ...wrong], rng),
    answer: t.name,
    explain: `Dit is een ${t.name}. ${t.summary}`,
  }
}

/** Een ronde van 10 voor de quiz: woorden, definities, animaties en voorkennis door elkaar. */
export function quizRound(rng: Rng = Math.random): QuizQuestion[] {
  const qs: QuizQuestion[] = []
  for (let i = 0; i < 3; i++) qs.push(termToDef(rng))
  for (let i = 0; i < 3; i++) qs.push(defToTerm(rng))
  for (let i = 0; i < 2; i++) qs.push(whichTrick(rng))
  for (let i = 0; i < 2; i++) {
    const q = prereq(rng)
    if (q) qs.push(q)
  }
  // geen dubbele vragen in één ronde
  const seen = new Set<string>()
  return shuffle(qs, rng)
    .filter((q) => !seen.has(q.prompt + q.answer) && !!seen.add(q.prompt + q.answer))
    .slice(0, 10)
}

/** Eén korte tekstvraag (zonder animatie), voor in de lift. */
export function textQuestion(rng: Rng): QuizQuestion {
  const kind = Math.floor(rng() * 3)
  return (kind === 0 ? termToDef(rng) : kind === 1 ? defToTerm(rng) : prereq(rng)) ?? termToDef(rng)
}
