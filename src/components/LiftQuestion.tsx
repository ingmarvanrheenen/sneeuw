// Liftpraat op Home: de liftvraag van vandaag, je antwoord, een weetje en je streak.
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../design/icons'
import { cx } from './ui'
import { answerLift, factFor, liftStreak, loadLift, questionFor, type LiftLog } from '../lib/liftpraat'
import { todayISO } from '../lib/ids'
import { sfx } from '../lib/sounds'

const dagen = (n: number) => (n === 1 ? '1 dag' : `${n} dagen`)

export function LiftQuestion() {
  const today = todayISO()
  const q = useMemo(() => questionFor(today), [today])
  const [log, setLog] = useState<LiftLog | null>(null)

  useEffect(() => {
    void loadLift().then(setLog)
  }, [])

  if (!log) return null
  const answer = log[today]
  const streak = liftStreak(log, today)

  async function choose(opt: string) {
    if (answer) return
    if (opt === q.answer) sfx.success()
    else sfx.wrong()
    setLog(await answerLift(today, opt))
  }

  return (
    <section className="mt-8" aria-labelledby="liftpraat">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id="liftpraat" className="text-[20px] font-semibold tracking-tight">
          Liftpraat
        </h2>
        {streak.current > 0 && (
          <span className="flex items-center gap-1 text-[15px] text-accent-text">
            <Icon name="flame" size={16} /> {dagen(streak.current)} op rij
          </span>
        )}
      </div>
      <div className="card p-4">
        <p className="text-[17px] font-semibold leading-snug">{q.prompt}</p>
        <div className="mt-3 space-y-2" role="group" aria-label="Antwoorden">
          {q.options.map((o) => {
            const isAnswer = o === q.answer
            const isChosen = o === answer?.chosen
            return (
              <button
                key={o}
                type="button"
                disabled={!!answer}
                onClick={() => void choose(o)}
                aria-pressed={isChosen}
                className={cx(
                  'flex w-full items-start gap-2 rounded-xl border px-3.5 py-3 text-left text-[15px] transition-colors duration-150',
                  !answer && 'hairline active:bg-surface-2',
                  answer && isAnswer && 'border-accent bg-accent-soft',
                  answer && isChosen && !isAnswer && 'border-danger bg-danger/10',
                  answer && !isAnswer && !isChosen && 'hairline opacity-50',
                )}
              >
                {answer && isAnswer && <Icon name="check" size={18} className="mt-0.5 shrink-0 text-accent-text" />}
                {answer && isChosen && !isAnswer && <Icon name="close" size={18} className="mt-0.5 shrink-0 text-danger" />}
                <span>{o}</span>
              </button>
            )
          })}
        </div>
        {answer && (
          <div className="pop-in mt-4 space-y-3 text-[15px]">
            <p className={answer.correct ? 'text-accent-text' : 'text-text'}>
              <span className="font-semibold">{answer.correct ? 'Goed.' : 'Bijna.'}</span> {q.explain}
            </p>
            <p className="flex gap-2 text-muted">
              <Icon name="lift" size={18} className="mt-0.5 shrink-0" />
              <span>{factFor(today)}</span>
            </p>
            <p className="text-[13px] text-muted">
              Morgen een nieuwe vraag.{streak.best > streak.current ? ` Je record: ${dagen(streak.best)} op rij.` : ''}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
