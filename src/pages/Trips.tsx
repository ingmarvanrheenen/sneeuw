import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Field, Page, PageHeader, Progress, Sheet, cx, inputCls } from '../components/ui'
import { Icon } from '../design/icons'
import { ResortPicker } from '../components/Pickers'
import { create, useKind } from '../lib/repo'
import { defaultPacking } from '../content/packing'
import { daysUntil, fmtShort } from '../lib/format'
import { todayISO } from '../lib/ids'

export default function Trips() {
  const nav = useNavigate()
  const trips = useKind('trip')
  const [open, setOpen] = useState(false)
  const [resortOpen, setResortOpen] = useState(false)
  const [form, setForm] = useState({ name: '', resortId: '', resortName: '', startDate: '', endDate: '' })
  const today = todayISO()
  const sorted = [...(trips ?? [])].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))

  return (
    <Page>
      <PageHeader
        kicker="Trips"
        title="Trips & paklijst"
        back
        right={
          <Button size="sm" icon={<Icon name="plus" size={16} />} onClick={() => setOpen(true)}>
            Trip
          </Button>
        }
      />
      {trips && !sorted.length && (
        <Empty
          icon={<Icon name="suitcase" size={40} className="text-accent-text" />}
          title="Nog geen trip"
          body="Plan je wintersport: aftellen, paklijst afvinken en doelen per trip."
          action={<Button onClick={() => setOpen(true)}>Trip toevoegen</Button>}
        />
      )}
      <div className="space-y-2">
        {sorted.map((t) => {
          const packed = t.packing.filter((p) => p.checked).length
          const upcoming = t.startDate && t.startDate >= today
          return (
            <Card key={t.id} onClick={() => nav(`/reizen/${t.id}`)}>
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
                    <div className="num text-2xl font-semibold text-accent-text">{daysUntil(t.startDate!)}</div>
                    <div className="label">dagen</div>
                  </div>
                )}
              </div>
              {t.packing.length > 0 && <Progress value={packed / t.packing.length} className="mt-3" />}
            </Card>
          )
        })}
      </div>

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
