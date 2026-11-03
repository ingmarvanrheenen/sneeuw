// Programma's: kant-en-klare reeksen van een paar dagen, en eigen programma's die Coach Daddy op jouw niveau
// maakt. Overzicht op /programmas, de dagen op /programmas/:id.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Field, Heading, List, Page, PageHeader, Row, Segmented, cx, inputCls } from '../components/ui'
import { Segments, Stamp } from '../components/Poster'
import { Icon, Spinner } from '../design/icons'
import { PROGRAMS, type Program } from '../content/programs'
import { TRICK_BY_ID } from '../content/tricks'
import { PISTES } from '../content/logOptions'
import {
  doneCount,
  isComplete,
  loadPrograms,
  nextDay,
  programById,
  programStore,
  removeCustomProgram,
  setDayDone,
  startProgram,
  stopProgram,
  type ProgramState,
} from '../lib/programs'
import { askProgram, CoachError } from '../lib/coach'
import { crewBoard, crewDays, setCrewDay, setSharedCrew, sharedCrew, type CrewDay } from '../lib/crewPrograms'
import { cachedCrews, crewMembers, myCrews, type Crew, type CrewMember } from '../lib/crew'
import { toast } from '../lib/toast'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import { errMsg } from '../lib/errors'
import { fmtShort } from '../lib/format'
import { sfx } from '../lib/sounds'

const PISTE_ADJ: Record<string, string> = { groen: 'Groene', blauw: 'Blauwe', rood: 'Rode', zwart: 'Zwarte' }

export default function Programs() {
  const { id } = useParams()
  const state = programStore.use()
  useEffect(() => void loadPrograms(), [])
  const p = id ? programById(state, id) : undefined
  if (id)
    return p ? (
      <ProgramPage p={p} />
    ) : (
      <Page>
        <PageHeader title="Niet gevonden" back="/programmas" />
      </Page>
    )

  const custom = state.custom ?? []
  return (
    <Page>
      <PageHeader title="Programma's" subtitle="Een paar dagen, een duidelijk doel" back />
      <CoachMaker />
      {custom.length > 0 && (
        <>
          <Heading className="mt-8">Van de coach</Heading>
          <List>
            {custom.map((x) => (
              <ProgramRow key={x.id} p={x} state={state} />
            ))}
          </List>
        </>
      )}
      <Heading className="mt-8">Kant-en-klaar</Heading>
      <List>
        {PROGRAMS.map((x) => (
          <ProgramRow key={x.id} p={x} state={state} />
        ))}
      </List>
      <div className="h-4" />
    </Page>
  )
}

function ProgramRow({ p, state }: { p: Program; state: ProgramState }) {
  const run = state.runs[p.id]
  const n = doneCount(run)
  const status =
    state.active === p.id
      ? `Bezig: dag ${(nextDay(p, run) ?? 0) + 1} van ${p.days.length}`
      : isComplete(p, run)
        ? 'Af'
        : `${p.days.length} dagen`
  return (
    <Row
      icon={isComplete(p, run) ? 'check' : p.coach ? 'chat' : 'target'}
      title={p.name}
      detail={`${status} · ${p.blurb}`}
      value={n ? `${n}/${p.days.length}` : undefined}
      to={`/programmas/${p.id}`}
    />
  )
}

const DAY_OPTIONS = ['3', '5', '7'] as const

/** Coach Daddy maakt een programma op jouw niveau: wat je wilt leren en hoeveel dagen. */
function CoachMaker() {
  const { user } = authStore.use()
  const navigate = useNavigate()
  const [wish, setWish] = useState('')
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>('5')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canAsk = hasBackend && !!user

  async function make() {
    setBusy(true)
    setError('')
    try {
      const p = await askProgram(wish, Number(days))
      sfx.success()
      navigate(`/programmas/${p.id}`)
    } catch (e) {
      setError(e instanceof CoachError ? e.message : errMsg(e))
      setBusy(false)
    }
  }

  return (
    <section className="mt-2">
      <Heading action={busy ? <Spinner size={14} /> : undefined}>Op jouw niveau</Heading>
      <div className="card p-4">
        <p className="text-[15px] text-muted">
          Coach Daddy maakt een programma vanaf waar jij nu staat: per dag een doel, de piste, oefeningen en de tricks erbij.
        </p>
        <div className="mt-3">
          <Field label="Wat wil je leren? (mag leeg)">
            <input
              className={inputCls}
              value={wish}
              maxLength={300}
              onChange={(e) => setWish(e.target.value)}
              placeholder="Bijv. switch rijden, of mijn eerste 180"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Segmented value={days} onChange={setDays} options={DAY_OPTIONS.map((d) => ({ value: d, label: `${d} dagen` }))} />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button className="mt-3 w-full" icon={<Icon name="chat" size={18} />} disabled={!canAsk || busy} onClick={() => void make()}>
          {busy ? 'Coach denkt na…' : 'Maak mijn programma'}
        </Button>
        {!canAsk && <p className="mt-2 text-[13px] text-muted">Log in om de coach een programma te laten maken.</p>}
      </div>
    </section>
  )
}

function ProgramPage({ p }: { p: Program }) {
  const state = programStore.use()
  const run = state.runs[p.id]
  const active = state.active === p.id
  const next = nextDay(p, run)
  const complete = isComplete(p, run)
  const navigate = useNavigate()
  const [open, setOpen] = useState<number | null>(null)
  const shown = open ?? (active ? next : null)
  // samen met je crew (alleen kant-en-klare programma's): met welke crew, en hun dagen
  const [crewId, setCrewId] = useState<string | null>(null)
  const [crewRows, setCrewRows] = useState<CrewDay[]>([])
  useEffect(() => void sharedCrew(p.id).then(setCrewId), [p.id])
  const reloadCrew = (id = crewId) =>
    id &&
    navigator.onLine &&
    void crewDays(id, p.id)
      .then(setCrewRows)
      .catch(() => {})
  useEffect(() => void reloadCrew(), [crewId, p.id])

  /** dag gedaan of weer open: lokaal, en bij je crew als je samen volgt */
  async function toggleDay(i: number, done: boolean) {
    await setDayDone(p.id, i, done)
    if (!crewId) return
    try {
      await setCrewDay(crewId, p.id, i, done)
      reloadCrew()
    } catch (e) {
      toast({ title: 'Niet bij je crew gezet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  return (
    <Page>
      <PageHeader
        title={p.name}
        subtitle={p.coach ? `${p.days.length} dagen, van Coach Daddy` : `${p.days.length} dagen`}
        back="/programmas"
      />
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
                        void toggleDay(i, !doneOn)
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

      {!p.coach && (
        <CrewTogether
          p={p}
          crewId={crewId}
          rows={crewRows}
          onShare={async (id) => {
            await setSharedCrew(p.id, id)
            setCrewId(id)
            if (!id) return setCrewRows([])
            // wat je al deed gaat meteen mee
            try {
              for (const [day, on] of Object.entries(run?.done ?? {})) await setCrewDay(id, p.id, Number(day), true, on)
              reloadCrew(id)
              sfx.success()
            } catch (e) {
              toast({ title: 'Delen met je crew lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
            }
          }}
        />
      )}

      {active && (
        <button type="button" onClick={() => void stopProgram()} className="mb-6 mt-4 w-full py-2 text-center text-[15px] text-muted">
          Stoppen met dit programma
        </button>
      )}
      {p.coach && (
        <button
          type="button"
          onClick={() => {
            if (!confirm('Dit programma weggooien?')) return
            void removeCustomProgram(p.id).then(() => navigate('/programmas'))
          }}
          className="mt-2 w-full py-2 text-center text-[15px] text-danger"
        >
          Weggooien
        </button>
      )}
      <div className="h-4" />
    </Page>
  )
}

/** Samen met je crew: kies een crew, dan zie je per crewgenoot welke dagen die deed. */
function CrewTogether({
  p,
  crewId,
  rows,
  onShare,
}: {
  p: Program
  crewId: string | null
  rows: CrewDay[]
  onShare: (crewId: string | null) => Promise<void>
}) {
  const { user } = authStore.use()
  const [crews, setCrews] = useState<Crew[]>([])
  const [members, setMembers] = useState<CrewMember[]>([])
  useEffect(() => {
    void cachedCrews().then(setCrews)
    if (navigator.onLine && hasBackend && user)
      void myCrews()
        .then(setCrews)
        .catch(() => {})
  }, [user])
  useEffect(() => {
    if (crewId && navigator.onLine)
      void crewMembers(crewId)
        .then(setMembers)
        .catch(() => {})
  }, [crewId])
  if (!hasBackend || !user || !crews.length) return null
  const crew = crews.find((c) => c.id === crewId)
  const board = crew ? crewBoard(rows, members, user.id, p.days.length) : []

  return (
    <section className="mt-8">
      <Heading>Samen met je crew</Heading>
      {!crew ? (
        <>
          <p className="mb-3 text-[15px] text-muted">Volg dit programma samen: je ziet wie welke dag deed, en zij zien jou.</p>
          <div className="flex flex-wrap gap-2">
            {crews.map((c) => (
              <Button key={c.id} variant="ghost" icon={<Icon name="crew" size={18} />} onClick={() => void onShare(c.id)}>
                Volg met {c.name}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <>
          <List>
            {board.map((b) => (
              <div key={b.userId} role="group" aria-label={`${b.name}: ${b.count} van ${p.days.length}`} className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between text-[15px]">
                  <span className={cx('font-medium', b.userId === user.id && 'text-accent-text')}>{b.name}</span>
                  <span className="num text-muted">
                    {b.count} van {p.days.length}
                  </span>
                </div>
                <div className="flex gap-1">
                  {p.days.map((_, i) => (
                    <span key={i} className={cx('h-2 flex-1 rounded-[2px]', b.done.has(i) ? 'bg-text' : 'bg-surface-2')} />
                  ))}
                </div>
              </div>
            ))}
          </List>
          <button type="button" onClick={() => void onShare(null)} className="mt-2 w-full py-2 text-center text-[13px] text-muted">
            Niet meer delen met {crew.name}
          </button>
        </>
      )}
    </section>
  )
}
