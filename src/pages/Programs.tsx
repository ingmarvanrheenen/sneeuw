// Programma's: kant-en-klare reeksen van een paar dagen. Overzicht op /programmas, de dagen op /programmas/:id.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, List, Page, PageHeader, Row, cx } from '../components/ui'
import { Segments, Stamp } from '../components/Poster'
import { Icon } from '../design/icons'
import { PROGRAM_BY_ID, PROGRAMS, type Program } from '../content/programs'
import { TRICK_BY_ID } from '../content/tricks'
import { PISTES } from '../content/logOptions'
import { doneCount, isComplete, loadPrograms, nextDay, programStore, setDayDone, startProgram, stopProgram } from '../lib/programs'
import { fmtShort } from '../lib/format'
import { sfx } from '../lib/sounds'

const PISTE_ADJ: Record<string, string> = { groen: 'Groene', blauw: 'Blauwe', rood: 'Rode', zwart: 'Zwarte' }

export default function Programs() {
  const { id } = useParams()
  const state = programStore.use()
  useEffect(() => void loadPrograms(), [])
  const p = id ? PROGRAM_BY_ID.get(id) : undefined
  if (id)
    return p ? (
      <ProgramPage p={p} />
    ) : (
      <Page>
        <PageHeader title="Niet gevonden" back="/programmas" />
      </Page>
    )

  return (
    <Page>
      <PageHeader title="Programma's" subtitle="Een paar dagen, een duidelijk doel" back />
      <List>
        {PROGRAMS.map((x) => {
          const run = state.runs[x.id]
          const n = doneCount(run)
          const status =
            state.active === x.id
              ? `Bezig: dag ${(nextDay(x, run) ?? 0) + 1} van ${x.days.length}`
              : isComplete(x, run)
                ? 'Af'
                : `${x.days.length} dagen`
          return (
            <Row
              key={x.id}
              icon={isComplete(x, run) ? 'check' : 'target'}
              title={x.name}
              detail={`${status} · ${x.blurb}`}
              value={n ? `${n}/${x.days.length}` : undefined}
              to={`/programmas/${x.id}`}
            />
          )
        })}
      </List>
    </Page>
  )
}

function ProgramPage({ p }: { p: Program }) {
  const state = programStore.use()
  const run = state.runs[p.id]
  const active = state.active === p.id
  const next = nextDay(p, run)
  const complete = isComplete(p, run)
  const [open, setOpen] = useState<number | null>(null)
  const shown = open ?? (active ? next : null)

  return (
    <Page>
      <PageHeader title={p.name} subtitle={`${p.days.length} dagen`} back="/programmas" />
      <p className="text-[15px]">{p.blurb}</p>
      <p className="mt-1 text-[13px] text-muted">{p.start}</p>

      {complete && (
        <div role="group" aria-label="Programma af" className="relative mt-4 overflow-hidden rounded-[6px] bg-block p-5 text-block-ink">
          <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">{p.name}</div>
          <div className="display rise mt-1 text-[48px] uppercase leading-[0.9]">Af</div>
          <Stamp className="absolute right-4 top-4" tilt={8}>
            Gehaald
          </Stamp>
        </div>
      )}

      {(active || complete) && <Segments value={doneCount(run) / p.days.length} count={p.days.length * 3} className="mt-4 text-text" />}

      {!active && (
        <Button
          size="lg"
          className="mt-4 w-full"
          icon={<Icon name="play" size={20} />}
          onClick={() => {
            sfx.success()
            void startProgram(p.id)
            setOpen(null)
          }}
        >
          {run ? 'Opnieuw beginnen' : 'Start'}
        </Button>
      )}

      <List className="mt-6">
        {p.days.map((d, i) => {
          const doneOn = run?.done[i]
          const isNext = active && i === next
          const expanded = shown === i
          const piste = PISTES.find((x) => x.id === d.piste)
          return (
            <div key={i} className={cx(isNext && 'bg-accent-soft')}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? -1 : i)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className={cx('display num w-9 shrink-0 text-[26px]', doneOn ? 'text-muted' : '')}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{d.title}</span>
                  <span className="block text-[13px] text-muted">{doneOn ? `Gedaan op ${fmtShort(doneOn)}` : d.goal}</span>
                </span>
                {doneOn ? (
                  <Icon name="check" size={20} className="shrink-0 text-accent-text" />
                ) : (
                  <Icon name="chevron" size={18} className={cx('shrink-0 text-muted transition-transform', expanded && 'rotate-90')} />
                )}
              </button>
              {expanded && (
                <div className="px-4 pb-4 pt-1">
                  {doneOn && <p className="mb-2 text-[15px]">{d.goal}</p>}
                  {piste && (
                    <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
                      <span className="size-2.5 rounded-full ring-1 ring-[var(--line)]" style={{ background: piste.color }} />
                      {PISTE_ADJ[piste.id] ?? piste.label} piste
                    </div>
                  )}
                  <ul className="space-y-2">
                    {d.tasks.map((t) => (
                      <li key={t} className="flex gap-2 text-[15px]">
                        <Icon name="target" size={16} className="mt-0.5 shrink-0 text-accent-text" />
                        {t}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {d.tricks.map((t) => (
                      <Link key={t} to={`/tricks/${t}`} className="rounded-full border hairline px-3 py-1 text-[13px] font-medium">
                        {TRICK_BY_ID.get(t)?.name ?? t}
                      </Link>
                    ))}
                  </div>
                  {(active || doneOn) && (
                    <Button
                      variant={doneOn ? 'ghost' : 'primary'}
                      className="mt-4 w-full"
                      icon={<Icon name={doneOn ? 'replay' : 'check'} size={18} />}
                      onClick={() => {
                        if (!doneOn) sfx.success()
                        void setDayDone(p.id, i, !doneOn)
                        setOpen(null)
                      }}
                    >
                      {doneOn ? 'Toch nog niet' : 'Dag gedaan'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </List>

      {active && (
        <button type="button" onClick={() => void stopProgram()} className="mb-6 mt-4 w-full py-2 text-center text-[15px] text-muted">
          Stoppen met dit programma
        </button>
      )}
      <div className="h-4" />
    </Page>
  )
}
