// Potje van de trip: wat de crew uitgaf, wie nog wie moet betalen (met één tik "Betaald"), en alle uitgaven.
// Uitgaven in euro of CHF (vaste koers per trip), gelijk of in delen verdeeld, met een bonnetje als foto.
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Button, Chip, Field, Heading, List, Segmented, Sheet, Stepper, cx, inputCls } from './ui'
import { MediaThumb, MediaViewer } from './Media'
import { Icon, Spinner } from '../design/icons'
import { crewMembers, type CrewMember } from '../lib/crew'
import {
  addExpense,
  balances,
  cachedPot,
  canChange,
  checkInput,
  fmtEuro,
  listExpenses,
  fmtChf,
  loadReceipt,
  parseEuro,
  parseRate,
  potLines,
  toEuro,
  tripRate,
  type Currency,
  type ExpenseInput,
  recordPayment,
  rememberPot,
  removeExpense,
  settle,
  shares,
  totals,
  updateExpense,
  type Expense,
  type Payment,
} from '../lib/pot'
import { getCurrentUserId } from '../lib/auth-state'
import { todayISO } from '../lib/ids'
import { fmtShort } from '../lib/format'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'
import { renderPotCard, shareImage } from '../lib/shareCard'
import { addMediaFiles } from '../lib/media'
import type { MediaMeta } from '../lib/types'

export function TripPot({
  tripId,
  crewId,
  ownerId,
  ready = true,
  tripName = 'De trip',
}: {
  tripId: string
  crewId: string
  ownerId?: string
  ready?: boolean
  tripName?: string
}) {
  const me = getCurrentUserId() ?? ''
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [members, setMembers] = useState<CrewMember[]>([])
  const [edit, setEdit] = useState<Expense | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [viewing, setViewing] = useState<MediaMeta | null>(null)

  const load = useCallback(async () => {
    if (!navigator.onLine || !ready) return
    try {
      const [list, mem] = await Promise.all([listExpenses(tripId), crewMembers(crewId)])
      setExpenses(list)
      setMembers(mem)
      await rememberPot(tripId, list, mem)
    } catch (e) {
      setExpenses((cur) => cur ?? [])
      toast({ title: 'Potje laden lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }, [tripId, crewId, ready])

  useEffect(() => {
    void cachedPot(tripId).then((c) => {
      if (!c) return
      setExpenses((cur) => cur ?? c.expenses)
      setMembers((cur) => (cur.length ? cur : c.members))
    })
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

  const list = expenses ?? []
  const name = (id: string) => (id === me ? 'Jij' : (members.find((m) => m.user_id === id)?.display_name ?? 'Iemand'))
  const bal = balances(list)
  const payments = settle(bal)
  const { spent, mine } = totals(list, me)
  const myBalance = bal.get(me) ?? 0
  const canEdit = online && ready

  async function shareStand() {
    setBusy(true)
    try {
      // op de kaart met namen, niet "Jij": hij gaat naar de hele crew
      const plain = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? 'Iemand'
      const blob = await renderPotCard(tripName, fmtEuro(spent), potLines(payments, plain))
      await shareImage(blob, 'potje.png', `Potje ${tripName}`)
    } catch (e) {
      toast({ title: 'Delen lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  async function pay(p: Payment) {
    setBusy(true)
    try {
      await recordPayment(crewId, tripId, p)
      sfx.success()
      toast({ title: 'Vastgelegd', body: `${name(p.from)} → ${name(p.to)}: ${fmtEuro(p.cents)}`, icon: 'check', tone: 'success' })
      await load()
    } catch (e) {
      toast({ title: 'Niet gelukt', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8">
      <Heading action={expenses === null ? <Spinner size={14} /> : undefined}>Potje</Heading>

      {list.length > 0 && (
        <div
          role="group"
          aria-label="Stand van het potje"
          className="relative mb-4 overflow-hidden rounded-[6px] bg-block p-4 text-block-ink"
        >
          <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">Uitgegeven</div>
          <div className="display num mt-1 text-[44px] uppercase leading-[0.9]">{fmtEuro(spent)}</div>
          <div className="mt-1 text-[15px]">Jouw deel: {fmtEuro(mine)}</div>
          <span
            className={cx(
              'slap absolute right-3 top-3 inline-block rounded-[3px] px-2.5 py-1 text-[12px] font-extrabold uppercase tracking-[0.08em]',
              myBalance < 0 ? 'bg-hot text-hot-ink' : 'bg-surface text-text',
            )}
            style={{ '--tilt': '4deg', '--delay': '150ms' } as CSSProperties}
          >
            {myBalance > 0 ? `Jij krijgt ${fmtEuro(myBalance)}` : myBalance < 0 ? `Jij moet ${fmtEuro(-myBalance)}` : 'Jij staat quitte'}
          </span>
        </div>
      )}

      {payments.length > 0 && (
        <>
          <h3 className="display mb-2 text-[20px] uppercase">Wie betaalt wie</h3>
          <List>
            {payments.map((p) => (
              <div key={`${p.from}-${p.to}`} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1 truncate text-[15px]">
                  <span className={cx(p.from === me && 'font-semibold')}>{name(p.from)}</span> <span className="text-muted">→</span>{' '}
                  <span className={cx(p.to === me && 'font-semibold')}>{name(p.to)}</span>
                </div>
                <span className="num shrink-0 text-[15px] font-semibold">{fmtEuro(p.cents)}</span>
                {(p.from === me || p.to === me) && (
                  <button
                    type="button"
                    disabled={busy || !canEdit}
                    onClick={() => void pay(p)}
                    aria-label={`${name(p.from)} betaalde ${name(p.to)} ${fmtEuro(p.cents)}`}
                    className="shrink-0 rounded-full border hairline px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
                  >
                    Betaald
                  </button>
                )}
              </div>
            ))}
          </List>
        </>
      )}
      {list.length > 0 && !payments.length && <p className="mb-2 text-[15px] text-muted">Iedereen staat quitte.</p>}
      {list.length > 0 && (
        <Button
          variant="ghost"
          className="mt-3 w-full"
          icon={<Icon name="share" size={18} />}
          disabled={busy}
          onClick={() => void shareStand()}
        >
          Deel de stand
        </Button>
      )}
      {!list.length && expenses !== null && (
        <p className="mb-3 text-[15px] text-muted">
          Nog niks in het potje. Boodschappen, skipassen, het huisje: zet het erin, dan rekent de app uit wie wie moet betalen.
        </p>
      )}

      {canEdit && (
        <Button variant="ghost" className="mt-3 w-full" icon={<Icon name="plus" size={18} />} onClick={() => setEdit('new')}>
          Uitgave toevoegen
        </Button>
      )}

      {list.length > 0 && (
        <>
          <h3 className="display mb-2 mt-6 text-[20px] uppercase">Uitgaven</h3>
          <List>
            {list.map((e) => {
              const mayEdit = canEdit && canChange(e, me, ownerId)
              const forWho = e.weights
                ? 'in delen'
                : e.split_between.length === members.length && members.length > 1
                  ? 'iedereen'
                  : e.split_between.length
              const detail =
                e.kind === 'transfer'
                  ? `${name(e.paid_by)} → ${name(e.split_between[0])}`
                  : `${name(e.paid_by)} betaalde · voor ${forWho}${e.currency === 'CHF' && e.orig_cents ? ` · ${fmtChf(e.orig_cents)}` : ''}${e.spent_on ? ' · ' + fmtShort(e.spent_on) : ''}`
              const body = (
                <>
                  <Icon name={e.kind === 'transfer' ? 'arrow' : 'euro'} size={20} className="shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{e.title}</div>
                    <div className="truncate text-[13px] text-muted">{detail}</div>
                  </div>
                  <span className="num shrink-0 text-[15px]">{fmtEuro(e.amount_cents)}</span>
                </>
              )
              const receipt = e.receipt ? (
                <button
                  type="button"
                  aria-label={`Bonnetje van ${e.title}`}
                  onClick={() =>
                    void loadReceipt(e.receipt!).then((m) =>
                      m ? setViewing(m) : toast({ title: 'Bonnetje niet gevonden', icon: 'alert' }),
                    )
                  }
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2"
                >
                  <Icon name="image" size={16} />
                </button>
              ) : null
              return mayEdit ? (
                <div key={e.id} className="flex items-center gap-2 pr-3">
                  <button type="button" onClick={() => setEdit(e)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left">
                    {body}
                  </button>
                  {receipt}
                </div>
              ) : (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  {body}
                  {receipt}
                </div>
              )
            })}
          </List>
        </>
      )}

      <ExpenseSheet
        open={edit !== null}
        expense={edit === 'new' ? null : edit}
        members={members}
        me={me}
        name={name}
        crewId={crewId}
        rate={tripRate(list.filter((x) => edit === 'new' || !edit || x.id !== edit.id))}
        onClose={() => setEdit(null)}
        onSave={async (input) => {
          if (edit && edit !== 'new') await updateExpense(edit.id, input)
          else await addExpense(crewId, tripId, input)
          sfx.success()
          setEdit(null)
          await load()
        }}
        onRemove={async () => {
          if (edit && edit !== 'new') await removeExpense(edit.id)
          setEdit(null)
          await load()
        }}
      />
      <MediaViewer m={viewing} onClose={() => setViewing(null)} />
    </section>
  )
}

function ExpenseSheet({
  open,
  expense,
  members,
  me,
  name,
  crewId,
  rate: fixedRate,
  onClose,
  onSave,
  onRemove,
}: {
  open: boolean
  expense: Expense | null
  members: CrewMember[]
  me: string
  name: (id: string) => string
  crewId: string
  /** de vaste CHF-koers van de trip, als er al een CHF-uitgave is */
  rate: number | null
  onClose: () => void
  onSave: (i: ExpenseInput) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const everyone = members.map((m) => m.user_id)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(me)
  const [split, setSplit] = useState<string[]>([])
  const [day, setDay] = useState(todayISO())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [currency, setCurrency] = useState<Currency>('EUR')
  const [rateText, setRateText] = useState('')
  const [inParts, setInParts] = useState(false)
  const [parts, setParts] = useState<Record<string, number>>({})
  const [receipt, setReceipt] = useState<MediaMeta | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setTitle(expense?.title ?? '')
    const chf = expense?.currency === 'CHF' && expense.orig_cents
    setCurrency(chf ? 'CHF' : 'EUR')
    setRateText(String(expense?.rate ?? fixedRate ?? '').replace('.', ','))
    const shown = chf ? expense!.orig_cents! : expense?.amount_cents
    setAmount(shown ? (shown / 100).toFixed(2).replace('.', ',').replace(',00', '') : '')
    setInParts(!!expense?.weights)
    setParts(Object.fromEntries((expense?.split_between ?? []).map((id, i) => [id, expense?.weights?.[i] ?? 1])))
    setReceipt(null)
    if (expense?.receipt) void loadReceipt(expense.receipt).then(setReceipt)
    setPaidBy(expense?.paid_by ?? me)
    setSplit(expense?.split_between ?? everyone)
    setDay(expense?.spent_on ?? todayISO())
    // alleen bij openen invullen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense])

  const transfer = expense?.kind === 'transfer'
  const typed = parseEuro(amount)
  const rate = fixedRate ?? parseRate(rateText)
  const chf = currency === 'CHF' && !transfer
  const cents = typed && chf ? (rate ? toEuro(typed, rate) : null) : typed
  const weights = inParts ? split.map((id) => parts[id] ?? 1) : null
  const per = cents && split.length ? shares(cents, split, weights) : null
  const perMin = per ? Math.min(...per.values()) : 0
  const perMax = per ? Math.max(...per.values()) : 0
  const toggle = (id: string) => setSplit((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  async function addReceipt(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      const { added } = await addMediaFiles([files[0]], { crewId })
      if (added[0]) setReceipt(added[0])
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    const input: ExpenseInput = {
      title,
      amount_cents: cents ?? 0,
      paid_by: paidBy,
      split_between: split,
      spent_on: day || null,
      currency: chf ? 'CHF' : 'EUR',
      orig_cents: chf ? typed : null,
      rate: chf ? rate : null,
      weights,
      receipt: receipt?.id ?? null,
    }
    const bad =
      amount && !typed
        ? 'Dat bedrag snap ik niet. Bijvoorbeeld 12,50'
        : chf && !rate
          ? 'Vul de koers in: hoeveel euro is 1 frank?'
          : checkInput(input)
    if (bad) return setError(bad)
    setBusy(true)
    setError('')
    try {
      await onSave(input)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={expense ? (transfer ? 'Terugbetaling' : 'Uitgave') : 'Nieuwe uitgave'}
      closeLabel="Annuleer"
    >
      <div className="space-y-4">
        <Field label="Wat">
          <input
            className={inputCls}
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bijv. boodschappen, skipassen"
          />
        </Field>
        {!transfer && (
          <Segmented
            value={currency}
            onChange={setCurrency}
            options={[
              { value: 'EUR', label: 'Euro' },
              { value: 'CHF', label: 'CHF' },
            ]}
          />
        )}
        <Field label="Bedrag" hint={chf && cents ? `= ${fmtEuro(cents)}` : undefined}>
          <input
            className={inputCls}
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            aria-label={chf ? 'Bedrag in CHF' : 'Bedrag in euro'}
          />
        </Field>
        {chf &&
          (fixedRate ? (
            <p className="text-[13px] text-muted">Koers: 1 frank = {fmtEuro(Math.round(fixedRate * 100))}, vast voor deze trip.</p>
          ) : (
            <Field label="Koers: hoeveel euro is 1 frank?" hint="Geldt daarna voor alle CHF-uitgaven van deze trip">
              <input
                className={inputCls}
                value={rateText}
                inputMode="decimal"
                onChange={(e) => setRateText(e.target.value)}
                placeholder="1,06"
                aria-label="Koers"
              />
            </Field>
          ))}
        {!transfer && (
          <>
            <Field label="Wie betaalde" group>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <Chip key={m.user_id} active={paidBy === m.user_id} onClick={() => setPaidBy(m.user_id)}>
                    {name(m.user_id)}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field
              label="Voor wie"
              group
              hint={
                per
                  ? perMin === perMax
                    ? `${fmtEuro(perMin)} per persoon`
                    : `${fmtEuro(perMin)} tot ${fmtEuro(perMax)} per persoon`
                  : undefined
              }
            >
              <div className="flex flex-wrap gap-2">
                <Chip active={split.length === everyone.length} onClick={() => setSplit(split.length === everyone.length ? [] : everyone)}>
                  Iedereen
                </Chip>
                {members.map((m) => (
                  <Chip key={m.user_id} active={split.includes(m.user_id)} onClick={() => toggle(m.user_id)}>
                    {name(m.user_id)}
                  </Chip>
                ))}
              </div>
            </Field>
            {split.length > 1 && (
              <Segmented
                value={inParts ? 'delen' : 'gelijk'}
                onChange={(v) => setInParts(v === 'delen')}
                options={[
                  { value: 'gelijk', label: 'Gelijk verdelen' },
                  { value: 'delen', label: 'In delen' },
                ]}
              />
            )}
            {inParts && split.length > 1 && (
              <List>
                {split.map((id) => (
                  <div key={id} role="group" aria-label={`Delen ${name(id)}`} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0 truncate text-[15px]">{name(id)}</span>
                    <span className="flex items-center gap-2">
                      <span className="num text-[13px] text-muted">{per ? fmtEuro(per.get(id) ?? 0) : ''}</span>
                      <Stepper value={parts[id] ?? 1} min={1} max={20} onChange={(v) => setParts((p) => ({ ...p, [id]: v }))} />
                    </span>
                  </div>
                ))}
              </List>
            )}
            <Field label="Bonnetje" group>
              {receipt ? (
                <div className="flex items-center gap-3">
                  <MediaThumb m={receipt} className="size-14" />
                  <button type="button" onClick={() => setReceipt(null)} className="text-[15px] text-muted">
                    Weghalen
                  </button>
                </div>
              ) : (
                <label className="flex h-11 cursor-pointer items-center gap-2 rounded-full border hairline px-4 text-[15px] font-semibold">
                  <Icon name="camera" size={18} />
                  {uploading ? 'Even bewaren…' : 'Foto van het bonnetje'}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label="Foto van het bonnetje"
                    onChange={(e) => void addReceipt(e.target.files)}
                  />
                </label>
              )}
            </Field>
            <Field label="Wanneer">
              <input type="date" className={inputCls} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Datum" />
            </Field>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      )}
      <Button size="lg" className="mt-5 w-full" disabled={busy} onClick={() => void save()}>
        Opslaan
      </Button>
      {expense && (
        <Button
          variant="plain"
          className="mb-6 mt-2 w-full text-danger"
          disabled={busy}
          onClick={() => confirm('Weghalen uit het potje?') && void onRemove().catch((e) => setError(errMsg(e)))}
        >
          Weghalen
        </Button>
      )}
      {!expense && <div className="h-6" />}
    </Sheet>
  )
}
