// Warming-up voor de eerste lift (3, 5 of 10 minuten) en cooling-down na je laatste run: de rider doet elke
// oefening voor, met een klok en een piepje bij de wissel. Scherm blijft aan waar dat kan. Werkt offline.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, List, Page, PageHeader, Segmented, cx } from '../components/ui'
import { Segments, Stamp } from '../components/Poster'
import { TrickAnimation } from '../anim/TrickAnimation'
import { Icon } from '../design/icons'
import { ROUTINES, WARMUP_CHOICES, routineSecs, type RoutineId } from '../content/warmup'
import { elapsed, fmtSecs, keepAwake, pause, position, resume, skip, startClock, type WarmupClock } from '../lib/warmup'
import { sfx } from '../lib/sounds'
import { WARMUP_3D } from '../anim3d/warmup'

const Loop3D = lazy(() => import('../anim3d/Loop3D'))

export default function Warmup({ cool = false }: { cool?: boolean }) {
  const nav = useNavigate()
  const [choice, setChoice] = useState<RoutineId>('normaal')
  const routine = ROUTINES[cool ? 'cooldown' : choice]
  const WARMUP = routine.exercises
  const minutes = Math.round(routineSecs(routine) / 60)
  const title = cool ? 'Cooling-down' : 'Warming-up'
  const [clock, setClock] = useState<WarmupClock | null>(null)
  const [now, setNow] = useState(Date.now())
  const last = useRef({ index: -1, sec: -1 })
  // 3D-rider; lukt WebGL niet, dan de 2D-versie
  const [flat, setFlat] = useState(false)

  // loopt de klok: elke kwart seconde bijwerken, en het scherm aan houden
  const running = !!clock && clock.pausedAt === null
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 250)
    let release = () => {}
    void keepAwake().then((r) => (release = r))
    return () => {
      clearInterval(t)
      release()
    }
  }, [running])

  const p = clock ? position(WARMUP, elapsed(clock, now)) : null
  /** knop: de klok aanpassen en meteen de juiste tijd laten zien */
  const act = (f: (c: WarmupClock, t: number) => WarmupClock) => {
    const t = Date.now()
    setNow(t)
    setClock((c) => (c ? f(c, t) : c))
  }

  // piepjes: bij een nieuwe oefening, en de laatste drie tellen
  useEffect(() => {
    if (!p || !running) return
    const sec = Math.ceil(p.left / 1000)
    if (p.done) {
      if (last.current.index !== -2) sfx.levelUp()
      last.current = { index: -2, sec: 0 }
      return
    }
    if (p.index !== last.current.index) {
      if (last.current.index >= 0) sfx.success()
    } else if (sec !== last.current.sec && sec <= 3 && sec > 0) sfx.tap()
    last.current = { index: p.index, sec }
  }, [p, running])

  if (!clock || !p)
    return (
      <Page>
        <PageHeader
          title={title}
          subtitle={cool ? `${minutes} minuten rekken na je laatste run` : `${minutes} minuten, met je board aan`}
          back
        />
        <p className="text-[15px] text-muted">
          {cool
            ? 'Na je laatste run, met je board nog aan of ernaast. Rustig rekken scheelt stijve benen morgen; houd elke houding vast en ga niet veren.'
            : 'Voor de eerste lift, of boven voor je eerste run. Koude spieren scheuren sneller; een paar minuten is genoeg.'}
        </p>
        {!cool && (
          <div className="mt-4">
            <Segmented
              value={choice}
              onChange={setChoice}
              options={WARMUP_CHOICES.map((id) => ({ value: id, label: ROUTINES[id].label }))}
            />
          </div>
        )}
        <List className="mt-4">
          {WARMUP.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{e.name}</span>
                <span className="block truncate text-[13px] text-muted">{e.how}</span>
              </span>
              <span className="num shrink-0 text-[15px] text-muted">{e.secs >= 60 ? fmtSecs(e.secs * 1000) : `${e.secs} s`}</span>
            </div>
          ))}
        </List>
        <Button
          size="lg"
          className="mb-6 mt-5 w-full"
          icon={<Icon name="play" size={20} />}
          onClick={() => {
            last.current = { index: -1, sec: -1 }
            setNow(Date.now())
            setClock(startClock(Date.now()))
            sfx.tap()
          }}
        >
          Start
        </Button>
      </Page>
    )

  if (p.done)
    return (
      <Page>
        <PageHeader title={title} back />
        <div role="group" aria-label="Klaar" className="relative mt-4 overflow-hidden rounded-[6px] bg-block p-6 text-block-ink">
          <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">{minutes} minuten</div>
          <div className="display rise mt-1 text-[56px] uppercase leading-[0.9]">{cool ? 'Uitgerekt' : 'Warm'}</div>
          <Stamp className="absolute right-4 top-4" tilt={8}>
            {cool ? 'Goed gereden' : 'Klaar voor de lift'}
          </Stamp>
        </div>
        {cool ? (
          <Button size="lg" className="mt-5 w-full" icon={<Icon name="log" size={20} />} onClick={() => nav('/log/nieuw')}>
            Log je dag
          </Button>
        ) : (
          <Button size="lg" className="mt-5 w-full" icon={<Icon name="lift" size={20} />} onClick={() => nav('/runs')}>
            Naar de run-teller
          </Button>
        )}
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setClock(null)}>
          Nog een keer
        </Button>
      </Page>
    )

  const e = WARMUP[p.index]
  const next = WARMUP[p.index + 1]
  const flatAnim = <TrickAnimation anim={e.anim} compact />
  const paused = clock.pausedAt !== null
  return (
    <Page>
      <PageHeader title={title} subtitle={`${p.index + 1} van ${WARMUP.length}`} back />
      <Segments value={p.total} count={WARMUP.length * 3} className="mb-3 text-text" />
      {flat ? (
        <div key={e.id} className="rise">
          {flatAnim}
        </div>
      ) : (
        <Suspense fallback={flatAnim}>
          <Rider3D id={e.id} name={e.name} onFail={() => setFlat(true)} />
        </Suspense>
      )}
      <div className="mt-4 flex items-end justify-between gap-3">
        <h2 key={e.id} className="display rise min-w-0 text-[34px] uppercase leading-[0.95]">
          {e.name}
        </h2>
        <span
          className={cx('display num shrink-0 text-[56px] leading-none', p.left <= 3000 && !paused && 'text-hot-text')}
          aria-label={`Nog ${fmtSecs(p.left)}`}
        >
          {fmtSecs(p.left)}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-[2px] bg-surface-2">
        <div className="h-full bg-accent" style={{ width: `${p.part * 100}%` } as CSSProperties} />
      </div>
      <p className="mt-3 text-[17px] leading-snug">{e.how}</p>
      {next && <p className="mt-3 text-[13px] text-muted">Hierna: {next.name}</p>}

      <div className="mb-6 mt-6 grid grid-cols-2 gap-2">
        <Button variant="ghost" icon={<Icon name={paused ? 'play' : 'pause'} size={18} />} onClick={() => act(paused ? resume : pause)}>
          {paused ? 'Door' : 'Pauze'}
        </Button>
        <Button variant="ghost" icon={<Icon name="arrow" size={18} />} onClick={() => act((c, t) => skip(c, WARMUP, t))}>
          Volgende
        </Button>
      </div>
      <button type="button" onClick={() => setClock(null)} className="w-full py-2 text-center text-[15px] text-muted">
        Stoppen
      </button>
    </Page>
  )
}

/** De 3D-rider voor één oefening; de beweging wordt één keer gebouwd per oefening. */
function Rider3D({ id, name, onFail }: { id: string; name: string; onFail: () => void }) {
  const motion = useMemo(() => WARMUP_3D[id](), [id])
  return <Loop3D motion={motion} onFail={onFail} label={`De rider doet ${name.toLowerCase()} voor`} />
}
