import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Page, PageHeader, Progress, cx } from '../components/ui'
import { Icon } from '../design/icons'
import { TrickAnimation } from '../anim/TrickAnimation'
import { TERMS } from '../content/terms'
import { TRICKS, TRICK_BY_ID } from '../content/tricks'
import type { Anim } from '../anim/engine'
import { kvGet, kvSet } from '../lib/db'
import { sfx } from '../lib/sounds'
import { celebrate } from '../lib/toast'

interface Q {
  prompt: string
  anim?: Anim
  options: string[]
  answer: string
  explain: string
}

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5)
const pick = <T,>(a: T[], n: number) => shuffle(a).slice(0, n)

function makeQuestions(): Q[] {
  const qs: Q[] = []
  // 1. term → definitie
  for (const t of pick(TERMS, 3)) {
    const wrong = pick(
      TERMS.filter((x) => x.id !== t.id && x.cat === t.cat),
      3,
    ).map((x) => x.def)
    qs.push({ prompt: `Wat betekent “${t.term}”?`, options: shuffle([t.def, ...wrong]), answer: t.def, explain: `${t.term}: ${t.def}` })
  }
  // 2. definitie → term
  for (const t of pick(TERMS, 3)) {
    const wrong = pick(
      TERMS.filter((x) => x.id !== t.id),
      3,
    ).map((x) => x.term)
    qs.push({ prompt: t.def, options: shuffle([t.term, ...wrong]), answer: t.term, explain: `Dat is “${t.term}”.` })
  }
  // 3. welke trick zie je?
  const animated = TRICKS.filter((t) => t.anim && (t.track === 'park' || t.track === 'flat'))
  for (const t of pick(animated, 2)) {
    const wrong = pick(
      animated.filter((x) => x.id !== t.id),
      3,
    ).map((x) => x.name)
    qs.push({
      prompt: 'Welke trick zie je hier?',
      anim: t.anim,
      options: shuffle([t.name, ...wrong]),
      answer: t.name,
      explain: `Dit is een ${t.name}. ${t.summary}`,
    })
  }
  // 4. wat moet je eerst kunnen?
  for (const t of pick(
    TRICKS.filter((t) => t.prereqs.length),
    2,
  )) {
    const right = TRICK_BY_ID.get(t.prereqs[0])!.name
    const wrong = pick(
      TRICKS.filter((x) => !t.prereqs.includes(x.id) && x.id !== t.id && x.level >= t.level),
      3,
    ).map((x) => x.name)
    if (wrong.length < 3) continue
    qs.push({
      prompt: `Wat kun je het best eerst leren vóór de ${t.name}?`,
      options: shuffle([right, ...wrong]),
      answer: right,
      explain: `Voor de ${t.name} is ${right} de basis.`,
    })
  }
  return shuffle(qs).slice(0, 10)
}

export default function Quiz() {
  const nav = useNavigate()
  const [round, setRound] = useState(0)
  const questions = useMemo(() => makeQuestions(), [round])
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const done = i >= questions.length
  const q = questions[i]

  async function choose(opt: string) {
    if (chosen) return
    setChosen(opt)
    const ok = opt === q.answer
    if (ok) {
      sfx.success()
      setScore((s) => s + 1)
      await kvSet('quizCorrect', (await kvGet('quizCorrect', 0)) + 1)
    } else sfx.wrong()
  }

  async function next() {
    const last = i + 1 >= questions.length
    setChosen(null)
    setI(i + 1)
    if (last) {
      const best = await kvGet('quizBest', 0)
      if (score > best) await kvSet('quizBest', score)
      if (score === questions.length) celebrate('goal', 'Perfecte score', `${score}/${questions.length}`, 'trophy')
    }
  }

  if (done)
    return (
      <Page>
        <PageHeader title="Klaar" back="/tricks" />
        <Card className="flex flex-col items-center py-10 text-center">
          <Icon name={score >= 8 ? 'trophy' : score >= 5 ? 'stomp' : 'impact'} size={48} className="text-accent-text" />
          <div className="num mt-4 text-5xl font-semibold">
            {score}
            <span className="text-2xl text-muted">/{questions.length}</span>
          </div>
          <p className="mt-2 text-muted">
            {score >= 8 ? 'Wandelend woordenboek.' : score >= 5 ? 'Netjes, je spreekt de taal.' : 'Yard sale. Nog een rondje?'}
          </p>
          <div className="mt-6 flex gap-2">
            <Button
              onClick={() => {
                setRound((r) => r + 1)
                setI(0)
                setScore(0)
              }}
              icon={<Icon name="replay" size={18} />}
            >
              Nog een keer
            </Button>
            <Button variant="ghost" onClick={() => nav('/tricks')}>
              Terug
            </Button>
          </div>
        </Card>
      </Page>
    )

  return (
    <Page>
      <PageHeader
        subtitle={`Vraag ${i + 1} van ${questions.length}`}
        title="Quiz"
        back="/tricks"
        right={<span className="num text-accent-text">{score}</span>}
      />
      <Progress value={i / questions.length} />
      <div key={i} className="pop-in mt-5">
        {q.anim && (
          <div className="mb-4">
            <TrickAnimation anim={q.anim} compact />
          </div>
        )}
        <h2 className="text-xl font-semibold leading-snug">{q.prompt}</h2>
        <div className="mt-4 space-y-2">
          {q.options.map((o) => {
            const isAnswer = o === q.answer
            const isChosen = o === chosen
            return (
              <button
                key={o}
                onClick={() => choose(o)}
                className={cx(
                  'card w-full p-4 text-left text-sm transition active:scale-[0.99]',
                  chosen && isAnswer && 'border-accent bg-accent-soft',
                  chosen && isChosen && !isAnswer && 'border-danger bg-danger/10',
                  chosen && !isAnswer && !isChosen && 'opacity-50',
                )}
              >
                <span className="flex items-start gap-3">
                  {chosen && isAnswer && <Icon name="check" size={18} className="shrink-0 text-accent-text" />}
                  {chosen && isChosen && !isAnswer && <Icon name="close" size={18} className="shrink-0 text-danger" />}
                  {o}
                </span>
              </button>
            )
          })}
        </div>
        {chosen && (
          <div className="pop-in mt-4">
            <Card className="text-sm text-muted">{q.explain}</Card>
            <Button className="mt-3 w-full" size="lg" onClick={next} icon={<Icon name="arrow" size={18} />}>
              {i + 1 >= questions.length ? 'Uitslag' : 'Volgende'}
            </Button>
          </div>
        )}
      </div>
    </Page>
  )
}
