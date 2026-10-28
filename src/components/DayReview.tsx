// Dagreview van Coach Daddy: opt-in per dag (kost een coach-bericht), bewaard bij de dag.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Heading, List, cx } from './ui'
import { Icon, Spinner } from '../design/icons'
import { CoachError, reviewDay } from '../lib/coach'
import { create, update, useKind } from '../lib/repo'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'
import { TRICK_BY_ID } from '../content/tricks'
import type { Session } from '../lib/types'

function Item({ label, children, tone }: { label: string; children: string; tone?: 'warn' }) {
  return (
    <div className="px-4 py-3">
      <div className={cx('text-[13px] font-medium', tone === 'warn' ? 'text-warn' : 'text-muted')}>{label}</div>
      <p className="mt-0.5 text-[15px] leading-relaxed">{children}</p>
    </div>
  )
}

export function DayReview({ session }: { session: Session }) {
  const { user } = authStore.use()
  const goals = useKind('goal')
  const [busy, setBusy] = useState(false)
  const r = session.review

  const canAsk = hasBackend && !!user
  // een bestaande review blijft altijd zichtbaar; aanvragen kan alleen ingelogd
  if (!r && !canAsk) return null

  async function run() {
    setBusy(true)
    try {
      const review = await reviewDay(session)
      await update(session, { review })
    } catch (e) {
      toast({ title: 'Review lukte niet', body: e instanceof CoachError ? e.message : errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  if (!r)
    return (
      <div className="card mt-8 flex items-center gap-3 p-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-[6px] bg-accent-soft text-accent-text">
          <Icon name="chat" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">Review van Coach Daddy</div>
          <div className="text-[13px] text-muted">Wat ging goed, één focuspunt en een oefening voor de volgende keer</div>
        </div>
        <Button size="sm" variant="ghost" onClick={run} disabled={busy}>
          {busy ? <Spinner size={16} /> : 'Vraag'}
        </Button>
      </div>
    )

  const trick = r.trickId ? TRICK_BY_ID.get(r.trickId) : undefined
  const hasGoal = !!trick && (goals ?? []).some((g) => g.trickId === trick.id && !g.done)

  return (
    <section className="mt-8">
      <Heading
        action={
          canAsk && (
            <button onClick={run} disabled={busy} className="-my-2.5 -mr-2 px-2 py-2.5 text-[15px] text-accent-text disabled:opacity-50">
              {busy ? 'Bezig…' : 'Opnieuw'}
            </button>
          )
        }
      >
        Coach-review
      </Heading>
      <List>
        <Item label="Ging goed">{r.goed}</Item>
        <Item label="Focus voor de volgende keer">{r.focus}</Item>
        <Item label="Oefening">{r.oefening}</Item>
        {r.veiligheid && (
          <Item label="Let op" tone="warn">
            {r.veiligheid}
          </Item>
        )}
      </List>
      {trick && (
        <List className="mt-3">
          <Link to={`/tricks/${trick.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
            <Icon name="book" size={20} className="shrink-0 text-accent-text" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-muted">Volgende trick</span>
              <span className="block truncate text-[17px] font-semibold">{trick.name}</span>
            </span>
            <Icon name="chevron" size={14} stroke={2.2} className="shrink-0 text-muted/60" />
          </Link>
          <div className="px-4 py-3">
            {hasGoal ? (
              <span className="flex items-center gap-2 text-[15px] text-muted">
                <Icon name="check" size={16} /> Staat al bij je doelen
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                icon={<Icon name="target" size={16} />}
                onClick={async () => {
                  await create('goal', { title: `${trick.name} leren`, trickId: trick.id, tripId: session.tripId, done: false })
                  toast({ title: 'Doel gezet', body: `${trick.name} staat bij je doelen`, icon: 'target', tone: 'success' })
                }}
              >
                Zet als doel
              </Button>
            )}
          </div>
        </List>
      )}
    </section>
  )
}
