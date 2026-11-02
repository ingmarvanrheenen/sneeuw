// Noodkaart: bellen met één tik, je plek om voor te lezen, wat te doen bij een ongeluk, en je eigen gegevens
// (alleen op dit toestel) om aan een hulpverlener te laten zien. Werkt volledig offline.
import { useEffect, useState } from 'react'
import { Button, Chip, Field, Heading, List, Page, PageHeader, Sheet, cx, inputCls } from '../components/ui'
import { Icon } from '../design/icons'
import { ACCIDENT_STEPS, COUNTRY_BY_ID, EMERGENCY_COUNTRIES } from '../content/emergency'
import {
  CARD_FIELDS,
  cleanCard,
  fmtCoords,
  hasMedical,
  loadCard,
  locate,
  pickCountry,
  saveCard,
  saveCountry,
  telHref,
  type EmergencyCard,
} from '../lib/emergency'
import { toast } from '../lib/toast'

export default function Emergency() {
  const [country, setCountry] = useState<string | null>(null)
  const [card, setCard] = useState<EmergencyCard>({})
  const [editing, setEditing] = useState(false)
  const [showing, setShowing] = useState(false)
  const [where, setWhere] = useState<{ text?: string; error?: string; busy?: boolean }>({})
  const [countries, setCountries] = useState(false)

  useEffect(() => {
    void pickCountry().then(setCountry)
    void loadCard().then(setCard)
  }, [])

  const c = COUNTRY_BY_ID.get(country ?? 'FR')!
  const filled = Object.keys(card).length > 0

  async function findMe() {
    setWhere({ busy: true })
    try {
      setWhere({ text: fmtCoords((await locate()).coords) })
    } catch (e) {
      setWhere({ error: (e as Error).message })
    }
  }

  return (
    <Page>
      <PageHeader title="Noodkaart" subtitle={c.name} back />

      <a
        href={telHref(c.main)}
        className="shadow-hard flex items-center gap-4 rounded-[6px] bg-hot p-5 text-hot-ink active:translate-y-[2px]"
        aria-label={`Bel ${c.main}`}
      >
        <Icon name="phone" size={34} />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-extrabold uppercase tracking-[0.1em]">Noodgeval</span>
          <span className="display num block text-[56px] leading-none">{c.main}</span>
        </span>
        <span className="display text-[22px] uppercase">Bel</span>
      </a>
      {c.main === '112' && (
        <p className="mt-2 text-[13px] text-muted">
          112 is gratis en werkt in heel Europa, ook via een ander netwerk als dat van jou geen bereik heeft.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[15px] font-medium">Land: {c.name}</span>
        <button
          type="button"
          onClick={() => setCountries((x) => !x)}
          className="text-[15px] font-semibold text-accent-text"
          aria-expanded={countries}
        >
          Ander land
        </button>
      </div>
      {countries && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Land">
          {EMERGENCY_COUNTRIES.map((x) => (
            <Chip
              key={x.id}
              active={x.id === c.id}
              onClick={() => {
                setCountry(x.id)
                void saveCountry(x.id)
                setCountries(false)
              }}
            >
              {x.name}
            </Chip>
          ))}
        </div>
      )}

      <List className="mt-3">
        {card.pistePhone && <NumberRow label="Pistedienst" note="Zelf ingevuld" nr={card.pistePhone} hot />}
        {c.numbers.map((n) => (
          <NumberRow key={n.nr + n.label} label={n.label} nr={n.nr} note={n.note} />
        ))}
        {card.travelPhone && <NumberRow label={`Alarmnummer ${card.travelInsurer ?? 'reisverzekering'}`} nr={card.travelPhone} />}
      </List>
      {c.tip && <p className="mt-2 text-[13px] text-muted">{c.tip}</p>}
      {!card.pistePhone && (
        <button type="button" onClick={() => setEditing(true)} className="mt-2 text-[15px] font-semibold text-accent-text">
          Pistedienst toevoegen
        </button>
      )}

      <section className="mt-8">
        <Heading>Waar ben ik</Heading>
        <div className="card p-4">
          {where.text ? (
            <>
              <div className="display num text-[30px] leading-tight" aria-live="polite">
                {where.text}
              </div>
              <p className="mt-1 text-[13px] text-muted">Lees dit voor, en noem de piste, de lift of het paalnummer.</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3"
                icon={<Icon name="copy" size={16} />}
                onClick={() => void navigator.clipboard?.writeText(where.text!).then(() => toast({ title: 'Gekopieerd', icon: 'check' }))}
              >
                Kopieer
              </Button>
            </>
          ) : (
            <>
              {where.error && (
                <p role="alert" className="mb-3 text-[15px] text-danger">
                  {where.error}
                </p>
              )}
              <p className="text-[15px] text-muted">Je coördinaten om aan de hulpdienst door te geven. Werkt met GPS, ook zonder bereik.</p>
              <Button className="mt-3 w-full" icon={<Icon name="pin" size={18} />} disabled={where.busy} onClick={() => void findMe()}>
                {where.busy ? 'Zoeken…' : 'Zoek mijn plek'}
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="mt-8">
        <Heading>Bij een ongeluk</Heading>
        <List>
          {ACCIDENT_STEPS.map((s) => (
            <div key={s.title} className="px-4 py-3">
              <div className="text-[15px] font-semibold">{s.title}</div>
              <div className="mt-0.5 text-[15px] text-muted">{s.body}</div>
            </div>
          ))}
        </List>
      </section>

      <section className="mt-8">
        <Heading>Mijn gegevens</Heading>
        <p className="-mt-1 mb-3 text-[15px] text-muted">
          {filled
            ? 'Laat ze zien aan een hulpverlener, in het Nederlands en Engels.'
            : 'Allergieën, medicijnen, wie ze moeten bellen. Staat alleen op deze telefoon, gaat nooit naar de server.'}
        </p>
        {filled && (
          <Button size="lg" className="w-full" icon={<Icon name="user" size={20} />} onClick={() => setShowing(true)}>
            Laat zien aan hulp
          </Button>
        )}
        <Button
          variant="ghost"
          className={cx('w-full', filled && 'mt-2')}
          icon={<Icon name="edit" size={18} />}
          onClick={() => setEditing(true)}
        >
          {filled ? 'Aanpassen' : 'Invullen'}
        </Button>
      </section>
      <div className="h-6" />

      <CardEditor
        open={editing}
        value={card}
        onClose={() => setEditing(false)}
        onSave={async (next) => {
          await saveCard(next)
          setCard(cleanCard(next))
          setEditing(false)
          toast({ title: 'Bewaard op deze telefoon', icon: 'check', tone: 'success' })
        }}
      />
      {showing && <ShowCard card={card} country={c.main} onClose={() => setShowing(false)} />}
    </Page>
  )
}

function NumberRow({ label, nr, note, hot }: { label: string; nr: string; note?: string; hot?: boolean }) {
  return (
    <a href={telHref(nr)} className="flex items-center gap-3 px-4 py-3" aria-label={`Bel ${label}: ${nr}`}>
      <Icon name="phone" size={20} className={hot ? 'text-hot-text' : 'text-muted'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{label}</span>
        {note && <span className="block truncate text-[13px] text-muted">{note}</span>}
      </span>
      <span className="display num text-[24px]">{nr}</span>
    </a>
  )
}

function CardEditor({
  open,
  value,
  onClose,
  onSave,
}: {
  open: boolean
  value: EmergencyCard
  onClose: () => void
  onSave: (c: EmergencyCard) => Promise<void>
}) {
  const [c, setC] = useState<EmergencyCard>(value)
  useEffect(() => {
    if (open) setC(value)
  }, [open, value])
  const groups: { id: (typeof CARD_FIELDS)[number]['group']; title: string }[] = [
    { id: 'ik', title: 'Over jou' },
    { id: 'nood', title: 'Bellen' },
    { id: 'verzekering', title: 'Verzekering' },
  ]
  return (
    <Sheet open={open} onClose={onClose} title="Mijn gegevens" closeLabel="Annuleer">
      <p className="mb-2 text-[13px] text-muted">Alleen op deze telefoon. Vul in wat je wilt, alles mag leeg.</p>
      {groups.map((g) => (
        <div key={g.id} className="mt-4">
          <div className="display mb-1 text-[20px] uppercase">{g.title}</div>
          <div className="space-y-3">
            {CARD_FIELDS.filter((f) => f.group === g.id).map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input
                  className={inputCls}
                  value={c[f.key] ?? ''}
                  maxLength={f.max}
                  type={f.type ?? 'text'}
                  inputMode={f.type === 'tel' ? 'tel' : undefined}
                  autoComplete="off"
                  aria-label={f.label}
                  onChange={(e) => setC((x) => ({ ...x, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </div>
      ))}
      <Button size="lg" className="mb-6 mt-6 w-full" onClick={() => void onSave(c)}>
        Bewaar
      </Button>
    </Sheet>
  )
}

/** Groot en leesbaar voor een hulpverlener, Nederlands en Engels. */
function ShowCard({ card, country, onClose }: { card: EmergencyCard; country: string; onClose: () => void }) {
  return (
    <div role="dialog" aria-label="Noodkaart voor hulpverleners" className="fixed inset-0 z-[70] overflow-y-auto bg-bg">
      <div className="pt-safe pb-safe mx-auto max-w-lg px-4">
        <div className="flex items-center justify-between py-3">
          <span className="display text-[22px] uppercase">Medical info</span>
          <button type="button" onClick={onClose} className="px-2 py-2 text-[17px] font-semibold text-accent-text">
            Sluit
          </button>
        </div>
        {hasMedical(card) && (
          <div className="mb-3 rounded-[6px] bg-hot p-3 text-hot-ink">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.1em]">Let op · Important</span>
          </div>
        )}
        <List>
          {CARD_FIELDS.filter((f) => card[f.key] && f.key !== 'pistePhone').map((f) => (
            <div key={f.key} className="px-4 py-3">
              <div className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-muted">
                {f.en} · {f.label}
              </div>
              {f.type === 'tel' ? (
                <a href={telHref(card[f.key]!)} className="display num mt-0.5 block text-[30px] text-accent-text">
                  {card[f.key]}
                </a>
              ) : (
                <div className="mt-0.5 text-[22px] font-semibold leading-snug">{card[f.key]}</div>
              )}
            </div>
          ))}
        </List>
        <a href={telHref(country)} className="mt-4 mb-8 flex items-center justify-center gap-2 rounded-[6px] bg-hot py-4 text-hot-ink">
          <Icon name="phone" size={22} />
          <span className="display text-[24px] uppercase">Call {country}</span>
        </a>
      </div>
    </div>
  )
}
