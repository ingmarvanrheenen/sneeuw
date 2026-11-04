// Verzamelpunt van de crew: één pin waar je elkaar treft, met hoe ver en welke kant op vanaf waar jij staat
// (je eigen plek blijft op je telefoon), openen in Kaarten, en zetten of verplaatsen op je huidige plek.
import { useCallback, useEffect, useState } from 'react'
import { Button, Chip, Field, Heading, Sheet, inputCls } from './ui'
import { Icon, Spinner } from '../design/icons'
import {
  LABELS,
  cachedMeetPoint,
  clearMeetPoint,
  isCurrent,
  loadMeetPoint,
  mapsHref,
  meetTime,
  setMeetPoint,
  wayTo,
  type MeetPoint,
} from '../lib/meetpoint'
import { locate } from '../lib/emergency'
import { ago } from '../lib/crewStatus'
import type { CrewMember } from '../lib/crew'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'
import { sfx } from '../lib/sounds'

export function CrewMeetPoint({ crewId, members, me }: { crewId: string; members: CrewMember[]; me: string }) {
  const [point, setPoint] = useState<MeetPoint | null>(null)
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null)
  const [finding, setFinding] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setPoint(await cachedMeetPoint(crewId))
    if (navigator.onLine) setPoint(await loadMeetPoint(crewId).catch(() => cachedMeetPoint(crewId)))
  }, [crewId])
  useEffect(() => void load(), [load])

  const current = point && isCurrent(point) ? point : null
  const who = (id: string) => (id === me ? 'jou' : (members.find((m) => m.user_id === id)?.display_name ?? 'iemand'))

  async function findMe() {
    setFinding(true)
    try {
      const p = await locate()
      setHere({ lat: p.coords.latitude, lon: p.coords.longitude })
    } catch (e) {
      toast({ title: 'Geen locatie', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setFinding(false)
    }
  }

  return (
    <section className="mt-4">
      <Heading>Verzamelpunt</Heading>
      {current ? (
        <div role="group" aria-label="Verzamelpunt" className="relative overflow-hidden rounded-[6px] bg-block p-4 text-block-ink">
          <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">
            {current.meet_at ? `Om ${meetTime(current.meet_at)}` : 'Hier treffen we elkaar'}
          </div>
          <div className="display mt-1 text-[34px] uppercase leading-[0.95]">{current.label}</div>
          <div className="mt-1 text-[13px] opacity-80">
            Gezet door {who(current.set_by)}, {ago(current.updated_at)}
          </div>
          <div className="mt-3 text-[15px] font-semibold" aria-live="polite">
            {here ? wayTo(here, current) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!here && (
              <Button
                size="sm"
                variant="ghost"
                icon={finding ? <Spinner size={14} /> : <Icon name="pin" size={16} />}
                onClick={() => void findMe()}
              >
                Hoe ver is het?
              </Button>
            )}
            <a
              href={mapsHref(current)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-semibold text-text"
            >
              <Icon name="external" size={14} /> Open in Kaarten
            </a>
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
              Verplaats
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                confirm('Verzamelpunt weghalen voor de hele crew?') &&
                void clearMeetPoint(crewId)
                  .then(() => setPoint(null))
                  .catch((e) => toast({ title: 'Niet gelukt', body: errMsg(e), tone: 'error', icon: 'alert' }))
              }
            >
              Weg
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" className="w-full" icon={<Icon name="pin" size={18} />} onClick={() => setOpen(true)}>
          Zet een verzamelpunt
        </Button>
      )}
      <PinSheet
        open={open}
        onClose={() => setOpen(false)}
        onSet={async (label, time) => {
          const p = await locate()
          let meet_at: string | null = null
          if (time) {
            const [h, m] = time.split(':').map(Number)
            const d = new Date()
            d.setHours(h, m, 0, 0)
            meet_at = d.toISOString()
          }
          await setMeetPoint(crewId, me, { lat: p.coords.latitude, lon: p.coords.longitude, label, meet_at })
          setHere({ lat: p.coords.latitude, lon: p.coords.longitude })
          sfx.success()
          setOpen(false)
          await load()
        }}
      />
    </section>
  )
}

function PinSheet({ open, onClose, onSet }: { open: boolean; onClose: () => void; onSet: (label: string, time: string) => Promise<void> }) {
  const [label, setLabel] = useState(LABELS[0])
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) setError('')
  }, [open])

  return (
    <Sheet open={open} onClose={onClose} title="Verzamelpunt" closeLabel="Annuleer">
      <p className="mb-4 text-[15px] text-muted">
        De pin komt op de plek waar je nu staat. Alleen deze pin gaat naar je crew; waar je daarna bent niet.
      </p>
      <div className="space-y-4">
        <Field label="Wat" group>
          <div className="mb-2 flex flex-wrap gap-2">
            {LABELS.map((l) => (
              <Chip key={l} active={label === l} onClick={() => setLabel(l)}>
                {l}
              </Chip>
            ))}
          </div>
          <input
            className={inputCls}
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Naam van de plek"
          />
        </Field>
        <Field label="Hoe laat (mag leeg)">
          <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hoe laat" />
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      )}
      <Button
        size="lg"
        className="mb-6 mt-5 w-full"
        icon={busy ? <Spinner size={18} /> : <Icon name="pin" size={20} />}
        disabled={busy || !label.trim()}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            await onSet(label, time)
          } catch (e) {
            setError(errMsg(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        Zet hier, op mijn plek
      </Button>
    </Sheet>
  )
}
