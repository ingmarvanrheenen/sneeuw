// Trip van een crewgenoot: de gegevens lezen en samen de groepslijst vullen.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Empty, Page, PageHeader, Stat, StatGroup } from '../components/ui'
import { Icon, Spinner } from '../design/icons'
import { GroupList } from '../components/GroupList'
import { CarPool } from '../components/CarPool'
import { CrewGoals } from '../components/CrewGoals'
import { TripRecap } from '../components/TripRecap'
import { TripBingo } from '../components/TripBingo'
import { todayISO } from '../lib/ids'
import { cachedCrewTrips, crewTrips, type CrewTrip } from '../lib/crewTrips'
import { crewMembers } from '../lib/crew'
import { daysUntil, fmtShort } from '../lib/format'

export default function CrewTripDetail() {
  const { id } = useParams()
  const [ct, setCt] = useState<CrewTrip | null | undefined>(undefined)
  const [owner, setOwner] = useState('')

  useEffect(() => {
    let alive = true
    const pick = (list: CrewTrip[]) => list.find((t) => t.id === id) ?? null
    void cachedCrewTrips().then((l) => alive && setCt((cur) => cur ?? pick(l)))
    if (navigator.onLine)
      crewTrips()
        .then((l) => alive && setCt(pick(l)))
        .catch(() => alive && setCt((cur) => cur ?? null))
    return () => {
      alive = false
    }
  }, [id])

  useEffect(() => {
    if (!ct || !navigator.onLine) return
    crewMembers(ct.crewId)
      .then((m) => setOwner(m.find((x) => x.user_id === ct.ownerId)?.display_name ?? ''))
      .catch(() => {})
  }, [ct])

  if (ct === undefined)
    return (
      <Page>
        <PageHeader title="Trip" back="/reizen" />
        <div className="grid h-40 place-items-center text-muted">
          <Spinner size={22} />
        </div>
      </Page>
    )
  if (ct === null)
    return (
      <Page>
        <PageHeader title="Trip" back="/reizen" />
        <Empty
          icon={<Icon name="suitcase" size={40} className="text-accent-text" />}
          title="Trip niet gevonden"
          body="Misschien deelt je maat hem niet meer met de crew."
        />
      </Page>
    )

  const t = ct.trip
  return (
    <Page>
      <PageHeader
        subtitle={[t.resortName, owner && `van ${owner}`].filter(Boolean).join(' · ') || 'Crew-trip'}
        title={t.name}
        back="/reizen"
      />
      <StatGroup>
        <Stat label="Over" value={t.startDate ? Math.max(0, daysUntil(t.startDate)) : '–'} sub="dagen" />
        <Stat label="Van" value={t.startDate ? fmtShort(t.startDate) : '–'} />
        <Stat label="Tot" value={t.endDate ? fmtShort(t.endDate) : '–'} />
      </StatGroup>
      {t.startDate && t.startDate <= todayISO() && <TripRecap tripId={ct.id} crewId={ct.crewId} trip={t} />}
      <TripBingo tripId={ct.id} crewId={ct.crewId} />
      <CrewGoals tripId={ct.id} crewId={ct.crewId} ownerId={ct.ownerId} />
      <GroupList tripId={ct.id} crewId={ct.crewId} ownerId={ct.ownerId} />
      <CarPool tripId={ct.id} crewId={ct.crewId} />
    </Page>
  )
}
