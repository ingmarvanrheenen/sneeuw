import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, Field, Heading, Page, PageHeader, Progress, Sheet, cx, inputCls } from '../components/ui'
import { Icon } from '../design/icons'
import { ResortPicker } from '../components/Pickers'
import { create, useKind } from '../lib/repo'
import { defaultPacking } from '../content/packing'
import { daysUntil, fmtShort } from '../lib/format'
import { todayISO } from '../lib/ids'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import { cachedCrewTrips, crewTrips, type CrewTrip } from '../lib/crewTrips'

export default function Trips() {
  const nav = useNavigate()
  const trips = useKind('trip')
  const [open, setOpen] = useState(false)
  const [resortOpen, setResortOpen] = useState(false)
  const [form, setForm] = useState({ name: '', resortId: '', resortName: '', startDate: '', endDate: '' })
  const today = todayISO()
  const sorted = [...(trips ?? [])].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
  const { user } = authStore.use()
  const [shared, setShared] = useState<CrewTrip[]>([])
  useEffect(() => {
    if (!hasBackend || !user) return
    let alive = true
    void cachedCrewTrips().then((l) => alive && setShared(l))
    if (navigator.onLine)
      crewTrips()
        .then((l) => alive && setShared(l))
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [user])

  return (
    <Page>
      <PageHeader
        title="Trips & paklijst"
        back
        right={
          <Button size="sm" icon={<Icon name="plus" size={16} />} onClick={() => setOpen(true)}>
            Trip
          </Button>
        }
      />
      {trips && !sorted.length && !shared.length && (
        <Empty
          icon={<Icon name="suitcase" size={40} className="text-accent-text" />}
          title="Nog geen trip"
          body="Plan je wintersport: aftellen, paklijst afvinken en doelen per trip."
          action={<Button onClick={() => setOpen(true)}>Trip toevoegen</Button>}
        />
      )}
      <div className="card divide-y divide-[var(--line)] overflow-hidden">
        {sorted.map((t) => {
          const packed = t.packing.filter((p) => p.checked).length
          const upcoming = t.startDate && t.startDate >= today
          return (
            <button key={t.id} onClick={() => nav(`/reizen/${t.id}`)} className="block w-full px-4 py-3.5 text-left active:bg-surface-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{t.name}</div>
                  <div className="text-sm text-muted">{t.resortName}</div>
                  {t.startDate && (
                    <div className="label mt-1">
                      {fmtShort(t.startDate)}
                      {t.endDate ? ` – ${fmtShort(t.endDate)}` : ''}
                    </div>
                  )}
                </div>
                {upcoming && (
                  <div className="text-right">
                    <div className="display num text-[28px] text-accent-text">{daysUntil(t.startDate!)}</div>
                    <div className="label">dagen</div>
                  </div>
                )}
              </div>
              {t.packing.length > 0 && <Progress value={packed / t.packing.length} className="mt-3" />}
            </button>
          )
        })}
      </div>

      {shared.length > 0 && (
        <section className="mt-8">
          <Heading>Van je crew</Heading>
          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {shared.map(({ id, trip: t }) => (
              <button
                key={id}
                onClick={() => nav(`/reizen/crew/${id}`)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2"
              >
                <Icon name="crew" size={20} className="shrink-0 text-accent-text" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.name}</span>
                  <span className="block text-sm text-muted">
                    {[t.resortName, t.startDate && `${fmtShort(t.startDate)}${t.endDate ? ` – ${fmtShort(t.endDate)}` : ''}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {t.startDate && t.startDate >= today && (
                  <span className="text-right">
                    <span className="display num block text-[28px] text-accent-text">{daysUntil(t.startDate)}</span>
                    <span className="label">dagen</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Nieuwe trip">
        <Field label="Naam">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Wintersport 2027"
            className={inputCls}
          />
        </Field>
        <Field label="Waar">
          <button type="button" onClick={() => setResortOpen(true)} className={cx(inputCls, 'text-left', !form.resortName && 'text-muted')}>
            {form.resortName || 'Kies skigebied (mag later)'}
          </button>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Van">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Tot">
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <Button
          className="mb-4 mt-4 w-full"
          disabled={!form.name.trim()}
          onClick={async () => {
            const t = await create('trip', {
              name: form.name.trim(),
              resortId: form.resortId || undefined,
              resortName: form.resortName || undefined,
              startDate: form.startDate || undefined,
              endDate: form.endDate || undefined,
              packing: defaultPacking(),
            })
            setOpen(false)
            nav(`/reizen/${t.id}`)
          }}
        >
          Aanmaken met standaard paklijst
        </Button>
      </Sheet>
      <ResortPicker
        open={resortOpen}
        onClose={() => setResortOpen(false)}
        onPick={(r) => {
          setForm((f) => ({ ...f, resortId: r.id ?? '', resortName: r.name }))
          setResortOpen(false)
        }}
      />
    </Page>
  )
}
