// Drill van de dag op Home: Coach Daddy kiest één oefening op basis van je laatste dagen en doelen.
// Op verzoek (kost één coach-bericht), en daarna blijft hij die dag staan.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Heading } from './ui'
import { Stamp } from './Poster'
import { Icon, Spinner } from '../design/icons'
import { CoachError, askDrill, cachedDrill, type SavedDrill } from '../lib/coach'
import { create, useKind } from '../lib/repo'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import { todayISO } from '../lib/ids'
import { errMsg } from '../lib/errors'
import { toast } from '../lib/toast'
import { TRICK_BY_ID } from '../content/tricks'

export function DailyDrill() {
  const today = todayISO()
  const { user } = authStore.use()
  const goals = useKind('goal')
  const [drill, setDrill] = useState<SavedDrill | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void cachedDrill(today).then(setDrill)
  }, [today])

  const canAsk = hasBackend && !!user
  // nog niet geladen, of geen drill en ook geen coach: niks tonen
  if (drill === undefined || (!drill && !canAsk)) return null

  async function ask() {
    setBusy(true)
    setError('')
    try {
      setDrill(await askDrill(today))
    } catch (e) {
      setError(e instanceof CoachError ? e.message : errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const trick = drill?.trickId ? TRICK_BY_ID.get(drill.trickId) : undefined
  const hasGoal = !!trick && (goals ?? []).some((g) => g.trickId === trick.id && !g.done)

  return (
    <section className="mt-8" aria-labelledby="drill">
      <Heading id="drill">Drill van de dag</Heading>
      {!drill ? (
        <div className="card p-4">
          <p className="text-[15px] text-muted">Coach Daddy kiest één oefening voor vandaag, op basis van je laatste dagen en je doelen.</p>
          <Button
            className="mt-3 w-full"
            icon={busy ? <Spinner size={18} /> : <Icon name="chat" size={18} />}
            onClick={() => void ask()}
            disabled={busy}
          >
            {busy ? 'Coach denkt na…' : 'Geef me een drill'}
          </Button>
          {error && (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="card relative p-4">
          <Stamp className="absolute -top-3 right-3" tilt={6}>
            {drill.minuten} min
          </Stamp>
          <h3 className="display pr-16 text-[26px] uppercase">{drill.titel}</h3>
          {drill.waarom && <p className="mt-1.5 text-[15px] text-muted">{drill.waarom}</p>}
          <ol className="mt-3 space-y-2">
            {drill.stappen.map((st, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-snug">
                <span className="display grid size-6 shrink-0 place-items-center rounded-[4px] bg-accent text-[15px] text-accent-ink">
                  {i + 1}
                </span>
                <span className="pt-0.5">{st}</span>
              </li>
            ))}
          </ol>
          {trick && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t hairline pt-3">
              <Link to={`/tricks/${trick.id}`} className="mr-auto flex items-center gap-1.5 text-[15px] font-semibold text-accent-text">
                <Icon name="book" size={16} /> {trick.name}
              </Link>
              {hasGoal ? (
                <span className="flex items-center gap-1.5 text-[13px] text-muted">
                  <Icon name="check" size={14} /> Staat bij je doelen
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Icon name="target" size={16} />}
                  onClick={async () => {
                    await create('goal', { title: `${trick.name} leren`, trickId: trick.id, done: false })
                    toast({ title: 'Doel gezet', body: `${trick.name} staat bij je doelen`, icon: 'target', tone: 'success' })
                  }}
                >
                  Zet als doel
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
