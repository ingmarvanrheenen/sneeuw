// Waar is de crew: je eigen status met één tik, en de status van je crewgenoten met hoe lang geleden.
import { useCallback, useEffect, useState } from 'react'
import { Chip, Heading, List, Row } from './ui'
import { Icon } from '../design/icons'
import {
  STATUSES,
  STATUS_BY_ID,
  ago,
  cachedStatuses,
  clearCrewStatus,
  crewStatuses,
  isFresh,
  setCrewStatus,
  type CrewStatus,
  type StatusId,
} from '../lib/crewStatus'
import type { CrewMember } from '../lib/crew'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'

export function CrewWhere({ members, me }: { members: CrewMember[]; me: string }) {
  const [list, setList] = useState<CrewStatus[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setList(await cachedStatuses())
    if (navigator.onLine) setList(await crewStatuses().catch(() => cachedStatuses()))
  }, [])

  // vers houden zolang je kijkt
  useEffect(() => {
    void load()
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 60_000)
    return () => clearInterval(t)
  }, [load])

  const ids = new Set(members.map((m) => m.user_id))
  const fresh = list.filter((s) => ids.has(s.user_id) && isFresh(s))
  const mine = fresh.find((s) => s.user_id === me)
  const others = fresh.filter((s) => s.user_id !== me).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const name = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? 'Iemand'

  async function pick(id: StatusId) {
    setBusy(true)
    const before = list
    // meteen tonen; nog een keer op je huidige status tikken haalt hem weg
    const off = mine?.status === id
    setList((l) => [
      ...l.filter((s) => s.user_id !== me),
      ...(off ? [] : [{ user_id: me, status: id, updated_at: new Date().toISOString() }]),
    ])
    try {
      if (off) await clearCrewStatus()
      else await setCrewStatus(id)
      await load()
    } catch (e) {
      setList(before)
      toast({ title: 'Status zetten lukt niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6" aria-labelledby="waar">
      <Heading id="waar">Waar is de crew</Heading>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Jouw status">
        {STATUSES.map((s) => (
          <Chip key={s.id} active={mine?.status === s.id} onClick={busy ? undefined : () => void pick(s.id)}>
            <Icon name={s.icon} size={16} /> {s.label}
          </Chip>
        ))}
      </div>
      {others.length ? (
        <List className="mt-2">
          {others.map((s) => (
            <Row
              key={s.user_id}
              icon={STATUS_BY_ID.get(s.status)?.icon ?? 'pin'}
              title={name(s.user_id)}
              detail={STATUS_BY_ID.get(s.status)?.label}
              value={ago(s.updated_at)}
            />
          ))}
        </List>
      ) : (
        <p className="mt-2 text-[13px] text-muted">Nog niemand van je crew heeft vandaag een status gezet.</p>
      )}
    </section>
  )
}
