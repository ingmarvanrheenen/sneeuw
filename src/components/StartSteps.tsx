// "Zo begin je" op Home: de eerste stappen in de app, als lijst die zichzelf afvinkt. Weg als alles af is of als
// je hem verbergt.
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Heading, List, Row } from './ui'
import { Segments } from './Poster'
import { getProfile } from '../lib/auth'
import { kvGet } from '../lib/db'
import { listKind } from '../lib/repo'
import { hasBackend } from '../lib/supabase'
import { hideStart, loadStartHidden, startHidden, startSteps, type StartState } from '../lib/onboarding'

export function StartSteps({ className }: { className?: string }) {
  const hidden = startHidden.use()
  const [ready, setReady] = useState(false)
  useEffect(() => void loadStartHidden().then(() => setReady(true)), [])
  const state = useLiveQuery(async (): Promise<StartState> => {
    const [profile, sessions, tricks, crews] = await Promise.all([
      getProfile(),
      listKind('session'),
      listKind('trick'),
      kvGet<unknown[]>('crews', []),
    ])
    return {
      hasPass: !!profile.displayName?.trim() || !!profile.mascot,
      days: sessions.length,
      tricks: tricks.length,
      crews: crews.length,
      backend: hasBackend,
    }
  }, [])
  if (!ready || hidden || !state) return null
  const steps = startSteps(state)
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null

  return (
    <section className={className} aria-label="Zo begin je">
      <Heading
        action={
          <button type="button" onClick={() => void hideStart()} className="text-[13px] font-semibold text-muted">
            Verberg
          </button>
        }
      >
        Zo begin je
      </Heading>
      <Segments value={done / steps.length} count={steps.length * 3} className="mb-3 text-text" />
      <List>
        {steps.map((s) => (
          <Row
            key={s.id}
            icon={s.done ? 'check' : s.icon}
            title={s.done ? <span className="text-muted line-through">{s.title}</span> : s.title}
            detail={s.done ? 'Gedaan' : s.detail}
            to={s.done ? undefined : s.to}
          />
        ))}
      </List>
      <p className="mt-2 text-[13px] text-muted">
        {done} van {steps.length} gedaan
      </p>
    </section>
  )
}
