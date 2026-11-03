// Potje van de trip: wat de crew uitgaf, wie nog wie moet betalen (met één tik "Betaald"), en alle uitgaven.
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Button, Chip, Field, Heading, List, Sheet, cx, inputCls } from './ui'
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
  parseEuro,
  potLines,
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
              const detail =
                e.kind === 'transfer'
                  ? `${name(e.paid_by)} → ${name(e.split_between[0])}`
                  : `${name(e.paid_by)} betaalde · voor ${e.split_between.length === members.length && members.length > 1 ? 'iedereen' : e.split_between.length}${e.spent_on ? ' · ' + fmtShort(e.spent_on) : ''}`
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
              return mayEdit ? (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEdit(e)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  {body}
                </button>
              ) : (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  {body}
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
    </section>
  )
}

function ExpenseSheet({
  open,
  expense,
  members,
  me,
  name,
  onClose,
  onSave,
  onRemove,
}: {
  open: boolean
  expense: Expense | null
  members: CrewMember[]
  me: string
  name: (id: string) => string
  onClose: () => void
  onSave: (i: { title: string; amount_cents: number; paid_by: string; split_between: string[]; spent_on: string | null }) => Promise<void>
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

  useEffect(() => {
    if (!open) return
    setError('')
    setTitle(expense?.title ?? '')
    setAmount(expense ? (expense.amount_cents / 100).toFixed(2).replace('.', ',').replace(',00', '') : '')
    setPaidBy(expense?.paid_by ?? me)
    setSplit(expense?.split_between ?? everyone)
    setDay(expense?.spent_on ?? todayISO())
    // alleen bij openen invullen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense])

  const transfer = expense?.kind === 'transfer'
  const cents = parseEuro(amount)
  const per = cents && split.length ? shares(cents, split) : null
  const perMin = per ? Math.min(...per.values()) : 0
  const perMax = per ? Math.max(...per.values()) : 0
  const toggle = (id: string) => setSplit((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  async function save() {
    const input = { title, amount_cents: cents ?? 0, paid_by: paidBy, split_between: split, spent_on: day || null }
    const bad = amount && !cents ? 'Dat bedrag snap ik niet. Bijvoorbeeld 12,50' : checkInput(input)
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
        <Field label="Bedrag">
          <input
            className={inputCls}
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            aria-label="Bedrag in euro"
          />
        </Field>
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
