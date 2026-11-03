// Wekker voor de eerste lift: hoe laat je op moet, en een agenda-item met een melding (de iPhone laat een
// web-app geen echte wekker zetten). Voor morgen, in het resort van je trip als die er is.
import { useEffect, useState } from 'react'
import { Button, Field, List, Page, PageHeader, Stepper, Toggle, inputCls } from '../components/ui'
import { Peaks } from '../components/Poster'
import { Icon } from '../design/icons'
import { alarmDate, alarmIcs, loadPlan, savePlan, totalMin, wakeTime, WARMUP_MIN, type AlarmPlan } from '../lib/alarm'
import { useKind } from '../lib/repo'
import { RESORTS } from '../content/resorts'
import { fmtDate } from '../lib/format'
import { toast } from '../lib/toast'
import { sfx } from '../lib/sounds'

export default function Alarm() {
  const trips = useKind('trip')
  const date = alarmDate()
  const trip = (trips ?? []).find((t) => t.startDate && t.startDate <= date && (t.endDate ?? t.startDate) >= date)
  const resort = RESORTS.find((r) => r.id === trip?.resortId)
  const [plan, setPlan] = useState<AlarmPlan | null>(null)
  useEffect(() => {
    if (trips === undefined) return
    void loadPlan(resort).then(setPlan)
  }, [trips === undefined, resort?.id])

  if (!plan) return null
  const set = (patch: Partial<AlarmPlan>) => {
    const next = { ...plan, ...patch }
    setPlan(next)
    void savePlan(next, resort?.id)
  }
  const wake = wakeTime(plan)
  const where = resort?.name ?? trip?.resortName ?? ''

  function toCalendar() {
    const ics = alarmIcs(date, plan!, where)
    if (!ics) return
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `wekker-${date}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    sfx.success()
    toast({ title: 'Agenda-item gemaakt', body: `Open het en tik Voeg toe. Om ${wake} krijg je een melding.`, icon: 'calendar' })
  }

  return (
    <Page>
      <PageHeader title="Wekker" subtitle={`Voor ${fmtDate(date)}${where ? ` in ${where}` : ''}`} back />

      <div role="group" aria-label="Opstaan" className="relative overflow-hidden rounded-[6px] bg-block p-5 text-block-ink">
        <Peaks className="bottom-0 right-0 w-[170px]" />
        <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">Opstaan om</div>
        <div className="display num rise mt-1 text-[84px] leading-[0.9]">{wake ?? '--:--'}</div>
        <div className="mt-2 text-[15px]">
          Eerste lift {plan.lift}, {totalMin(plan)} minuten van tevoren op
        </div>
      </div>

      <div className="mt-4">
        <Field label="Eerste lift">
          <input type="time" className={inputCls} value={plan.lift} onChange={(e) => e.target.value && set({ lift: e.target.value })} />
        </Field>
      </div>
      <List className="mt-4">
        <div role="group" aria-label="Naar de lift" className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[15px]">Naar de lift</span>
          <Stepper value={plan.travel} onChange={(v) => set({ travel: v })} min={0} max={90} step={5} suffix="min" />
        </div>
        <div role="group" aria-label="Ontbijt en aankleden" className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[15px]">Ontbijt en aankleden</span>
          <Stepper value={plan.ready} onChange={(v) => set({ ready: v })} min={10} max={120} step={5} suffix="min" />
        </div>
        <Toggle on={plan.warmup} onChange={(warmup) => set({ warmup })} label="Warming-up" sub={`${WARMUP_MIN} minuten voor de lift`} />
      </List>

      <Button size="lg" className="mt-5 w-full" icon={<Icon name="calendar" size={20} />} disabled={!wake} onClick={toCalendar}>
        Zet in je agenda
      </Button>
      <p className="mb-6 mt-2 text-[13px] text-muted">
        Een web-app kan op je iPhone geen wekker zetten. Dit maakt een agenda-item met een melding op je wektijd; die komt ook als de app
        dicht is. Zet hem bij twijfel ook in je gewone wekker.
      </p>
    </Page>
  )
}
