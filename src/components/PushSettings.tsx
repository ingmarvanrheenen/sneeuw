// Meldingen op deze telefoon: aan/uit, per soort, en een testmelding. Plus een duwtje op de crew-pagina.
import { useEffect, useState } from 'react'
import { Button, List, Row, Toggle } from './ui'
import { Icon, Spinner } from '../design/icons'
import {
  PushDenied,
  disablePush,
  enablePush,
  getPushState,
  sendTestPush,
  setPushPref,
  type PushPref,
  type PushPrefs,
  type PushStatus,
} from '../lib/push'
import { kvGet, kvSet } from '../lib/db'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'

const KINDS: { pref: PushPref; label: string; sub: string }[] = [
  { pref: 'crew_days', label: 'Crew deelt een dag', sub: 'Waar ze waren en wat ze landden' },
  { pref: 'goals', label: 'Crew-doelen', sub: 'Als iemand een doel haalt dat jij nog moet halen' },
  { pref: 'reminder', label: 'Log je dag', sub: 'Om 17:00 tijdens een trip, als je nog niks logde' },
  { pref: 'pow', label: 'Pow-alarm', sub: 'Om 18:00 als er 15 cm of meer verse sneeuw komt bij je volgende trip' },
]

function usePush() {
  const [state, setState] = useState<{ status: PushStatus; prefs?: PushPrefs } | null>(null)
  useEffect(() => {
    void getPushState()
      .then(setState)
      .catch(() => setState({ status: 'off' }))
  }, [])
  return [state, setState] as const
}

/** Toestemming vragen moet direct vanuit de tik (iOS). */
async function turnOn(): Promise<{ status: PushStatus; prefs?: PushPrefs } | null> {
  try {
    const prefs = await enablePush()
    toast({ title: 'Meldingen staan aan', icon: 'bell', tone: 'success' })
    return { status: 'on', prefs }
  } catch (e) {
    if (e instanceof PushDenied) return { status: 'denied' }
    toast({ title: 'Meldingen aanzetten lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    return null
  }
}

export function PushSettings() {
  const [state, setState] = usePush()
  const [busy, setBusy] = useState(false)

  if (!state)
    return (
      <div className="card grid h-16 place-items-center text-muted">
        <Spinner size={18} />
      </div>
    )
  if (state.status === 'install')
    return (
      <List>
        <Row
          icon="bell"
          title="Zet de app eerst op je beginscherm"
          detail="Deel, Zet op beginscherm. Daarna kun je hier meldingen aanzetten."
        />
      </List>
    )
  if (state.status === 'unsupported')
    return (
      <List>
        <Row icon="bell" title="Deze browser kan geen meldingen tonen" />
      </List>
    )
  if (state.status === 'denied')
    return (
      <List>
        <Row icon="bell" title="Meldingen staan uit voor Sneeuw Daddy" detail="Zet ze aan in iOS: Instellingen, Meldingen, Sneeuw Daddy." />
      </List>
    )

  const on = state.status === 'on'
  async function master() {
    setBusy(true)
    if (on) {
      try {
        await disablePush()
        setState({ status: 'off' })
      } catch (e) {
        toast({ title: 'Uitzetten lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
      }
    } else {
      const next = await turnOn()
      if (next) setState(next)
    }
    setBusy(false)
  }

  async function pref(p: PushPref, v: boolean) {
    const before = state!.prefs!
    setState({ status: 'on', prefs: { ...before, [p]: v } })
    try {
      await setPushPref(p, v)
    } catch (e) {
      setState({ status: 'on', prefs: before })
      toast({ title: 'Niet opgeslagen', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  return (
    <>
      <List>
        <Toggle
          on={on}
          onChange={() => !busy && void master()}
          label="Meldingen op deze telefoon"
          sub={on ? undefined : 'Weten wat je crew doet, ook als de app dicht is'}
        />
        {on &&
          state.prefs &&
          KINDS.map((k) => (
            <Toggle key={k.pref} on={state.prefs![k.pref]} onChange={(v) => void pref(k.pref, v)} label={k.label} sub={k.sub} />
          ))}
      </List>
      {on && (
        <Button
          variant="ghost"
          className="mt-2"
          onClick={() =>
            sendTestPush().then(
              () => toast({ title: 'Testmelding verstuurd', body: 'Hij komt binnen een paar seconden binnen.', icon: 'bell' }),
              (e) => toast({ title: 'Testmelding lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' }),
            )
          }
        >
          Stuur een testmelding
        </Button>
      )}
    </>
  )
}

const NUDGE_KEY = 'pushNudgeDismissed'

/** Op de crew-pagina: één keer vragen of je meldingen wilt, op het moment dat het logisch is. */
export function PushNudge() {
  const [state, setState] = usePush()
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  useEffect(() => {
    void kvGet<boolean>(NUDGE_KEY, false).then(setDismissed)
  }, [])
  if (!state || dismissed !== false || state.status !== 'off') return null

  const close = () => {
    setDismissed(true)
    void kvSet(NUDGE_KEY, true)
  }
  return (
    <div className="card mb-3 flex items-start gap-3 p-4">
      <Icon name="bell" size={22} className="mt-0.5 shrink-0 text-accent-text" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">Weten wat je crew doet?</p>
        <p className="mt-0.5 text-[13px] text-muted">
          Een melding als iemand een dag deelt of een crew-doel haalt. Per soort uit te zetten.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={async () => {
              const next = await turnOn()
              if (next) setState(next)
              if (next?.status === 'on' || next?.status === 'denied') close()
            }}
          >
            Meldingen aan
          </Button>
          <Button variant="ghost" onClick={close}>
            Niet nu
          </Button>
        </div>
      </div>
    </div>
  )
}
