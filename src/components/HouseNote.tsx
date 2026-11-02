// Huisje-briefje op een crew-trip: adres (naar Kaarten), wifi met kopieerknop, in- en uitchecken, eerste lift,
// notities, en wie welke avond kookt. Iedereen in de crew vult het briefje aan; koken claim je voor jezelf.
import { useCallback, useEffect, useState } from 'react'
import { Button, Field, Heading, List, Row, Sheet, inputCls } from './ui'
import { Icon, Spinner } from '../design/icons'
import { crewMembers, type CrewMember } from '../lib/crew'
import {
  HOUSE_FIELDS,
  cachedCooking,
  cachedHouse,
  claimCooking,
  getHouse,
  listCooking,
  mapsUrl,
  releaseCooking,
  saveHouse,
  setMenu,
  tripEvenings,
  type CookingDay,
  type House,
  type HouseFields,
} from '../lib/house'
import { ago } from '../lib/crewStatus'
import { fmtDate } from '../lib/format'
import { getCurrentUserId } from '../lib/auth-state'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'

export function HouseNote({
  tripId,
  crewId,
  ownerId,
  trip,
  ready = true,
}: {
  tripId: string
  crewId: string
  ownerId: string
  trip: { startDate?: string; endDate?: string }
  ready?: boolean
}) {
  const me = getCurrentUserId() ?? ''
  const [house, setHouse] = useState<House | null | undefined>(undefined)
  const [cooking, setCooking] = useState<CookingDay[]>([])
  const [members, setMembers] = useState<CrewMember[]>([])
  const [editing, setEditing] = useState(false)
  const [evening, setEvening] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)

  const load = useCallback(async () => {
    if (!navigator.onLine || !ready) return
    try {
      const [h, c, m] = await Promise.all([getHouse(tripId), listCooking(tripId), crewMembers(crewId)])
      setHouse(h)
      setCooking(c)
      setMembers(m)
    } catch (e) {
      setHouse((cur) => (cur === undefined ? null : cur))
      toast({ title: 'Huisje-briefje laden lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }, [tripId, crewId, ready])

  useEffect(() => {
    void Promise.all([cachedHouse(tripId), cachedCooking(tripId)]).then(([h, c]) => {
      setHouse((cur) => (cur === undefined ? h : cur))
      setCooking((cur) => (cur.length ? cur : c))
    })
    void load()
    const refresh = () => document.visibilityState === 'visible' && void load()
    const on = () => {
      setOnline(navigator.onLine)
      refresh()
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    const t = setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', on)
      clearInterval(t)
    }
  }, [tripId, load])

  const name = (id: string | null) => (id === me ? 'Jij' : (members.find((m) => m.user_id === id)?.display_name ?? 'Iemand'))
  const canEdit = online && ready
  const h = house ?? null
  const filled = !!h && HOUSE_FIELDS.some((f) => h[f.key])
  const evenings = tripEvenings(trip.startDate, trip.endDate)

  async function save(next: HouseFields) {
    try {
      await saveHouse(crewId, tripId, h, next)
      setEditing(false)
      await load()
    } catch (e) {
      toast({ title: 'Niet opgeslagen', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  async function copyWifi() {
    try {
      await navigator.clipboard.writeText(h?.wifi_code ?? '')
      toast({ title: 'Wifi-code gekopieerd', icon: 'copy' })
    } catch {
      toast({ title: 'Kopiëren lukte niet', tone: 'error', icon: 'alert' })
    }
  }

  return (
    <section className="mt-8">
      <Heading
        action={
          house === undefined ? (
            <Spinner size={14} />
          ) : (
            canEdit &&
            filled && (
              <button
                onClick={() => setEditing(true)}
                className="-my-2 -mr-2 shrink-0 px-2 py-2 text-[15px] font-semibold text-accent-text"
              >
                Aanpassen
              </button>
            )
          )
        }
      >
        Huisje-briefje
      </Heading>

      {!filled ? (
        <div className="card p-4">
          <p className="text-[15px] text-muted">Nog leeg. Zet het adres en de wifi erin, dan heeft iedereen het ook op de berg.</p>
          {canEdit && (
            <Button className="mt-3 w-full" variant="ghost" icon={<Icon name="edit" size={18} />} onClick={() => setEditing(true)}>
              Vul het briefje in
            </Button>
          )}
        </div>
      ) : (
        <List>
          {h!.address && (
            <a
              href={mapsUrl(h!.address)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-3 px-4 py-2.5 active:bg-surface-2"
            >
              <Icon name="pin" size={22} className="shrink-0 text-accent-text" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-muted">Adres</span>
                <span className="block">{h!.address}</span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-accent-text">Kaarten</span>
            </a>
          )}
          {(h!.wifi_name || h!.wifi_code) && (
            <div className="flex min-h-11 items-center gap-3 px-4 py-2.5">
              <Icon name="wifi" size={22} className="shrink-0 text-accent-text" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-muted">Wifi{h!.wifi_name ? ` · ${h!.wifi_name}` : ''}</span>
                <span className="num block truncate font-semibold">{h!.wifi_code || '-'}</span>
              </span>
              {h!.wifi_code && (
                <button onClick={() => void copyWifi()} className="-my-2 shrink-0 px-2 py-2 text-[13px] font-semibold text-accent-text">
                  Kopieer
                </button>
              )}
            </div>
          )}
          {h!.checkin && <Row icon="calendar" title={h!.checkin} detail="Inchecken" />}
          {h!.checkout && <Row icon="suitcase" title={h!.checkout} detail="Uitchecken" />}
          {h!.first_lift && <Row icon="lift" title={h!.first_lift} detail="Eerste lift" />}
          {h!.notes && (
            <div className="px-4 py-3">
              <div className="text-[13px] text-muted">Huisregels en notities</div>
              <p className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed">{h!.notes}</p>
            </div>
          )}
        </List>
      )}
      {filled && h!.updated_by && (
        <p className="mt-1.5 text-[13px] text-muted">
          Laatst aangepast door {name(h!.updated_by)}, {ago(h!.updated_at)}
        </p>
      )}

      {evenings.length > 0 && (
        <>
          <h3 className="display mb-2 mt-6 text-[20px] uppercase">Wie kookt</h3>
          <List>
            {evenings.map((day) => {
              const c = cooking.find((x) => x.day === day)
              return (
                <Row
                  key={day}
                  icon={c ? 'flame' : 'plus'}
                  title={fmtDate(day, true).replace(/ \d{4}$/, '')}
                  detail={c ? c.menu || 'Nog geen menu' : 'Nog niemand'}
                  value={c ? name(c.cook) : canEdit ? 'Ik kook' : undefined}
                  onClick={canEdit ? () => setEvening(day) : undefined}
                />
              )
            })}
          </List>
        </>
      )}

      <HouseSheet open={editing} house={h} onClose={() => setEditing(false)} onSave={(f) => void save(f)} />
      <CookSheet
        day={evening}
        cooking={cooking.find((x) => x.day === evening) ?? null}
        me={me}
        isOwner={ownerId === me}
        cookName={name}
        onClose={() => setEvening(null)}
        onDone={async (action) => {
          try {
            await action()
            setEvening(null)
            await load()
          } catch (e) {
            toast({ title: 'Niet gelukt', body: errMsg(e), tone: 'error', icon: 'alert' })
            await load()
          }
        }}
        claim={(day, menu) => claimCooking(crewId, tripId, day, menu)}
        menu={(day, menu) => setMenu(tripId, day, menu)}
        release={(day) => releaseCooking(tripId, day)}
      />
    </section>
  )
}

function HouseSheet({
  open,
  house,
  onClose,
  onSave,
}: {
  open: boolean
  house: House | null
  onClose: () => void
  onSave: (f: HouseFields) => void
}) {
  const [form, setForm] = useState<HouseFields>({})
  useEffect(() => {
    if (open) setForm(Object.fromEntries(HOUSE_FIELDS.map((f) => [f.key, house?.[f.key] ?? ''])))
  }, [open, house])
  return (
    <Sheet open={open} onClose={onClose} title="Huisje-briefje" closeLabel="Annuleer">
      {HOUSE_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint}>
          {f.key === 'notes' ? (
            <textarea
              className={`${inputCls} min-h-28`}
              value={form[f.key] ?? ''}
              maxLength={f.max}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          ) : (
            <input
              className={inputCls}
              value={form[f.key] ?? ''}
              maxLength={f.max}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          )}
        </Field>
      ))}
      <Button size="lg" className="mb-6 mt-5 w-full" onClick={() => onSave(form)}>
        Opslaan
      </Button>
    </Sheet>
  )
}

function CookSheet({
  day,
  cooking,
  me,
  isOwner,
  cookName,
  onClose,
  onDone,
  claim,
  menu,
  release,
}: {
  day: string | null
  cooking: CookingDay | null
  me: string
  isOwner: boolean
  cookName: (id: string) => string
  onClose: () => void
  onDone: (action: () => Promise<unknown>) => void
  claim: (day: string, menu: string) => Promise<unknown>
  menu: (day: string, menu: string) => Promise<unknown>
  release: (day: string) => Promise<unknown>
}) {
  const [text, setText] = useState('')
  useEffect(() => setText(cooking?.menu ?? ''), [day, cooking])
  if (!day) return null
  const mine = cooking?.cook === me
  const title = fmtDate(day, true).replace(/ \d{4}$/, '')
  return (
    <Sheet open onClose={onClose} title={title} closeLabel="Annuleer">
      {cooking && !mine ? (
        <>
          <p className="text-[15px]">
            <span className="font-semibold">{cookName(cooking.cook)}</span> kookt{cooking.menu ? `: ${cooking.menu}` : '.'}
          </p>
          {isOwner && (
            <Button variant="danger" className="mb-6 mt-4 w-full" onClick={() => onDone(() => release(day))}>
              Avond vrijmaken
            </Button>
          )}
          {!isOwner && <div className="mb-6" />}
        </>
      ) : (
        <>
          <Field label="Wat eten we?" hint="Bijvoorbeeld: raclette, pasta, of gewoon pizza halen">
            <input className={inputCls} value={text} maxLength={80} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Button
            size="lg"
            className="mt-5 w-full"
            icon={<Icon name="flame" size={18} />}
            onClick={() => onDone(() => (mine ? menu(day, text) : claim(day, text)))}
          >
            {mine ? 'Opslaan' : 'Ik kook'}
          </Button>
          {mine ? (
            <Button variant="danger" className="mb-6 mt-3 w-full" onClick={() => onDone(() => release(day))}>
              Toch niet
            </Button>
          ) : (
            <div className="mb-6" />
          )}
        </>
      )}
    </Sheet>
  )
}
