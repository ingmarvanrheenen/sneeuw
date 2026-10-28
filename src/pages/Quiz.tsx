import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Page, PageHeader, Progress, cx } from '../components/ui'
import { Icon } from '../design/icons'
import { TrickAnimation } from '../anim/TrickAnimation'
import { quizRound } from '../lib/quizQuestions'
import { kvGet, kvSet } from '../lib/db'
import { sfx } from '../lib/sounds'
import { celebrate } from '../lib/toast'

export default function Quiz() {
  const nav = useNavigate()
  const [round, setRound] = useState(0)
  const questions = useMemo(() => quizRound(), [round])
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
