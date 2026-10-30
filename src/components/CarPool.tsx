// Wie rijdt met wie: auto's van de crew-trip met hun plekken. Tik een vrije plek om in te stappen, je eigen plek
// om uit te stappen. "Ik rijd" biedt je auto aan. Onderaan wie nog geen plek heeft.
import { useCallback, useEffect, useState } from 'react'
import { Button, Field, Heading, Sheet, Stepper, cx, inputCls } from './ui'
import { Icon, Spinner } from '../design/icons'
import { crewMembers, type CrewMember } from '../lib/crew'
import { addCar, cachedCars, leaveSeat, listCars, removeCar, takeSeat, updateCar, type Car, type CarInput } from '../lib/carpool'
import { getCurrentUserId } from '../lib/auth-state'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'

export function CarPool({ tripId, crewId, ready = true }: { tripId: string; crewId: string; ready?: boolean }) {
  const me = getCurrentUserId() ?? ''
  const [cars, setCars] = useState<Car[] | null>(null)
  const [members, setMembers] = useState<CrewMember[]>([])
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<Car | 'new' | null>(null)
  const [online, setOnline] = useState(navigator.onLine)

  const load = useCallback(async () => {
    if (!navigator.onLine || !ready) return
    try {
      const [list, mem] = await Promise.all([listCars(tripId), crewMembers(crewId)])
      setCars(list)
      setMembers(mem)
    } catch (e) {
      setCars((cur) => cur ?? [])
      toast({ title: 'Auto’s laden lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }, [tripId, crewId, ready])

  useEffect(() => {
    void cachedCars(tripId).then((c) => (c.length || !navigator.onLine) && setCars((cur) => cur ?? c))
    void load()
    const refresh = () => document.visibilityState === 'visible' && void load()
    const on = () => {
      setOnline(navigator.onLine)
      refresh()
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    const t = setInterval(refresh, 30_000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', on)
      clearInterval(t)
    }
  }, [tripId, load])

  const list = cars ?? []
  const name = (id: string) => (id === me ? 'Jij' : (members.find((m) => m.user_id === id)?.display_name ?? 'Iemand'))
  const myCar = list.find((c) => c.driver === me)
  const mySeat = list.find((c) => c.riders.includes(me))
  const placed = new Set(list.flatMap((c) => [c.driver, ...c.riders]))
  const without = members.filter((m) => !placed.has(m.user_id))
  const canEdit = online && ready

  async function run(action: () => Promise<unknown>, okSound = true) {
    setBusy(true)
    try {
      await action()
      if (okSound) sfx.tap()
      await load()
    } catch (e) {
      toast({ title: 'Niet gelukt', body: errMsg(e), tone: 'error', icon: 'alert' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8">
      <Heading action={cars === null ? <Spinner size={14} /> : undefined}>Wie rijdt met wie</Heading>
      {!list.length && cars !== null && (
        <p className="mb-3 text-[15px] text-muted">Nog geen auto’s. Rijd jij? Bied je auto aan, dan stappen de anderen in.</p>
      )}

      <div className="space-y-3">
        {list.map((c) => {
          const free = c.seats - c.riders.length
          const mineAsDriver = c.driver === me
          return (
            <div key={c.id} className="card p-4" aria-label={`Auto: ${c.label}`} role="group">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="display truncate text-[22px] uppercase">{c.label}</h3>
                  <div className="text-[13px] text-muted">
                    {name(c.driver)} rijdt · {free > 0 ? `${free} ${free === 1 ? 'plek' : 'plekken'} vrij` : 'vol'}
                  </div>
                </div>
                {mineAsDriver && canEdit && (
                  <button onClick={() => setEdit(c)} className="-m-2 shrink-0 p-2 text-[15px] font-semibold text-accent-text">
                    Aanpassen
                  </button>
                )}
              </div>
              {(c.departs || c.note) && (
                <div className="mt-2 space-y-1 text-[13px] text-muted">
                  {c.departs && (
                    <div className="flex items-center gap-1.5">
                      <Icon name="clock" size={14} /> {c.departs}
                    </div>
                  )}
                  {c.note && (
                    <div className="flex items-center gap-1.5">
                      <Icon name="suitcase" size={14} /> {c.note}
                    </div>
                  )}
                </div>
              )}
              {/* stoelen: de bestuurder, dan de plekken */}
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                <div className="flex h-14 flex-col items-center justify-center rounded-[6px] bg-block px-1 text-block-ink">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] opacity-80">Rijdt</span>
                  <span className="w-full truncate text-center text-[13px] font-semibold">{name(c.driver)}</span>
                </div>
                {Array.from({ length: c.seats }, (_, i) => {
                  const who = c.riders[i]
                  if (who) {
                    const canRemove = canEdit && (who === me || mineAsDriver)
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!canRemove || busy}
                        onClick={() => void run(() => leaveSeat(tripId, who))}
                        aria-label={who === me ? 'Uitstappen' : canRemove ? `${name(who)} eruit halen` : name(who)}
                        className={cx(
                          'flex h-14 flex-col items-center justify-center rounded-[6px] border px-1',
                          who === me ? 'border-text bg-accent-soft' : 'hairline bg-surface-2',
                        )}
                      >
                        <span className="w-full truncate text-center text-[13px] font-semibold">{name(who)}</span>
                        {canRemove && <span className="text-[10px] text-muted">{who === me ? 'uitstappen' : 'eruit'}</span>}
                      </button>
                    )
                  }
                  const canTake = canEdit && !myCar && !busy
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!canTake}
                      onClick={() => void run(() => takeSeat(tripId, c.id, mySeat?.id))}
                      aria-label={`Instappen bij ${c.label}`}
                      className="flex h-14 items-center justify-center rounded-[6px] border border-dashed border-[var(--line)] text-[13px] text-muted enabled:active:bg-surface-2 disabled:opacity-50"
                    >
                      Vrij
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {without.length > 0 && list.length > 0 && (
        <p className="mt-3 text-[13px] text-muted">Nog zonder plek: {without.map((m) => name(m.user_id)).join(', ')}</p>
      )}
      {!myCar && canEdit && (
        <Button className="mt-3 w-full" variant="ghost" icon={<Icon name="plus" size={18} />} onClick={() => setEdit('new')}>
          Ik rijd
        </Button>
      )}

      <CarSheet
        car={edit}
        defaultLabel={`Auto van ${members.find((m) => m.user_id === me)?.display_name ?? 'mij'}`}
        riding={mySeat && edit === 'new' ? mySeat.label : null}
        onClose={() => setEdit(null)}
        onSave={(input) =>
          run(async () => {
            if (edit === 'new') {
              // wie meerijdt en zelf gaat rijden, stapt eerst uit
              if (mySeat) await leaveSeat(tripId)
              await addCar(crewId, tripId, input)
            } else if (edit) await updateCar(edit.id, input)
            setEdit(null)
          })
        }
        onRemove={edit && edit !== 'new' ? () => run(async () => (await removeCar(edit.id), setEdit(null))) : undefined}
      />
    </section>
  )
}

function CarSheet({
  car,
  defaultLabel,
  riding,
  onClose,
  onSave,
  onRemove,
}: {
  car: Car | 'new' | null
  defaultLabel: string
  riding: string | null
  onClose: () => void
  onSave: (input: CarInput) => void
  onRemove?: () => void
}) {
  const [form, setForm] = useState<CarInput>({ label: '', seats: 3, departs: '', note: '' })
  useEffect(() => {
    if (car === 'new') setForm({ label: defaultLabel, seats: 3, departs: '', note: '' })
    else if (car) setForm({ label: car.label, seats: car.seats, departs: car.departs ?? '', note: car.note ?? '' })
  }, [car, defaultLabel])
  const minSeats = car && car !== 'new' ? Math.max(1, car.riders.length) : 1

  return (
    <Sheet open={!!car} onClose={onClose} title={car === 'new' ? 'Ik rijd' : 'Auto aanpassen'} closeLabel="Annuleer">
      {riding && <p className="mb-2 text-[13px] text-muted">Je zit nu bij {riding}. Als je zelf rijdt, stap je daar uit.</p>}
      <Field label="Naam van de auto">
        <input className={inputCls} value={form.label} maxLength={40} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </Field>
      <Field label="Plekken voor meerijders" group>
        <Stepper value={form.seats} min={minSeats} max={8} onChange={(seats) => setForm({ ...form, seats })} />
      </Field>
      <Field label="Vertrek" hint="Bijvoorbeeld: vr 18:00 vanaf Utrecht">
        <input
          className={inputCls}
          value={form.departs ?? ''}
          maxLength={60}
          onChange={(e) => setForm({ ...form, departs: e.target.value })}
        />
      </Field>
      <Field label="Bagage" hint="Bijvoorbeeld: boards op het dak, 1 koffer per persoon">
        <input className={inputCls} value={form.note ?? ''} maxLength={120} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </Field>
      <Button size="lg" className="mt-5 w-full" disabled={!form.label.trim()} onClick={() => onSave(form)}>
        {car === 'new' ? 'Bied aan' : 'Opslaan'}
      </Button>
      {onRemove && (
        <Button variant="danger" className="mb-6 mt-3 w-full" onClick={onRemove}>
          Auto weghalen
        </Button>
      )}
      {!onRemove && <div className="mb-6" />}
    </Sheet>
  )
}
