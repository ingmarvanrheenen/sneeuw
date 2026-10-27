import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Page, PageHeader, Section, Stat, Sheet, StatGroup } from '../components/ui'
import { Icon, Mood, MOOD_LABELS } from '../design/icons'
import { MediaGrid } from '../components/Media'
import { DayReview } from '../components/DayReview'
import { remove, useRecord } from '../lib/repo'
import { db } from '../lib/db'
import { fmtDate } from '../lib/format'
import { PISTES, SNOW, WEATHER } from '../content/logOptions'
import { TRICK_BY_ID } from '../content/tricks'
import { shareSession } from '../lib/shareCard'
import { sessionXP } from '../lib/progress'
import { toast } from '../lib/toast'
import type { MediaMeta } from '../lib/types'

export default function LogDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const s = useRecord('session', id)
  const media = useLiveQuery(
    async () =>
      id ? ((await db.records.where('sessionId').equals(id).toArray()).filter((r) => r.kind === 'media' && !r.deleted) as MediaMeta[]) : [],
    [id],
  )
  const [confirm, setConfirm] = useState(false)
  const [sharing, setSharing] = useState(false)

  if (s === undefined) return null
  if (s === null)
    return (
      <Page>
        <PageHeader title="Niet gevonden" back="/log" />
      </Page>
    )

  const weather = WEATHER.find((w) => w.id === s.weather)
  const practicedOnly = s.practiced.filter((t) => !s.landed.includes(t))

  return (
    <Page>
      <PageHeader
        subtitle={fmtDate(s.date, true)}
        title={s.resortName || 'Dag'}
        back="/log"
        right={
          <Button size="sm" variant="ghost" icon={<Icon name="edit" size={16} />} onClick={() => nav(`/log/${s.id}/bewerk`)}>
            Bewerk
          </Button>
        }
      />

      <Card className="flex items-center gap-4">
        <Mood value={s.mood} size={44} className="text-accent-text" />
        <div className="min-w-0 flex-1">
          <div className="label">{MOOD_LABELS[s.mood - 1]}</div>
          {s.highlight ? (
            <div className="mt-0.5 font-medium">“{s.highlight}”</div>
          ) : (
            <div className="text-sm text-muted">Geen highlight</div>
          )}
        </div>
        <div className="text-right">
          <div className="num font-semibold text-accent-text">+{sessionXP(s)}</div>
          <div className="label">XP</div>
        </div>
      </Card>

      <StatGroup className="mt-2">
        <Stat label="Uren" value={s.hours} />
        <Stat label="Gevallen" value={s.falls} />
        <Stat label="Geland" value={s.landed.length} />
      </StatGroup>

      {(s.snow || weather || s.pistes.length > 0) && (
        <Card className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {weather && (
            <span className="flex items-center gap-1.5">
              <Icon name={weather.icon} size={18} /> {weather.label}
            </span>
          )}
          {s.snow && (
            <span className="flex items-center gap-1.5">
              <Icon name="snowflake" size={18} /> {SNOW.find((x) => x.id === s.snow)?.label}
            </span>
          )}
          {s.pistes.map((p) => {
            const piste = PISTES.find((x) => x.id === p)!
            return (
              <span key={p} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full ring-1 ring-[var(--line)]" style={{ background: piste.color }} />
                {piste.label}
              </span>
            )
          })}
        </Card>
      )}

      {(s.landed.length > 0 || practicedOnly.length > 0) && (
        <Section title="Tricks">
          <div className="flex flex-wrap gap-1.5">
            {s.landed.map((t) => (
              <Link
                key={t}
                to={`/tricks/${t}`}
                className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm text-accent-ink"
              >
                <Icon name="check" size={14} stroke={2.4} />
                {TRICK_BY_ID.get(t)?.name ?? t}
              </Link>
            ))}
            {practicedOnly.map((t) => (
              <Link key={t} to={`/tricks/${t}`} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm">
                {TRICK_BY_ID.get(t)?.name ?? t}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {s.pains.length > 0 && (
        <Section title="Pijntjes">
          <Card className="flex gap-3">
            <Icon name="bandage" size={20} className="text-warn" />
            <div>
              <div className="text-sm font-medium">{s.pains.join(', ')}</div>
              {s.painNote && <div className="text-sm text-muted">{s.painNote}</div>}
            </div>
          </Card>
        </Section>
      )}

      {s.buddies.length > 0 && (
        <Section title="Met">
          <div className="flex flex-wrap gap-1.5">
            {s.buddies.map((b) => (
              <span key={b} className="rounded-full border hairline px-3 py-1 text-sm">
                {b}
              </span>
            ))}
          </div>
        </Section>
      )}

      {!!media?.length && (
        <Section title="Media">
          <MediaGrid items={media} editable />
        </Section>
      )}

      {s.notes && (
        <Section title="Notities">
          <Card className="whitespace-pre-wrap text-sm leading-relaxed">{s.notes}</Card>
        </Section>
      )}

      <DayReview session={s} />

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          icon={<Icon name="share" size={18} />}
          disabled={sharing}
          onClick={async () => {
            setSharing(true)
            try {
              await shareSession(s)
            } catch {
              toast({ title: 'Delen lukte niet', tone: 'error', icon: 'alert' })
            } finally {
              setSharing(false)
            }
          }}
        >
          {sharing ? 'Maken…' : 'Story'}
        </Button>
        <Button variant="ghost" icon={<Icon name="chat" size={18} />} onClick={() => nav(`/coach?dag=${s.id}`)}>
          Vraag coach
        </Button>
      </div>
      <Button variant="danger" className="mt-2 w-full" icon={<Icon name="trash" size={16} />} onClick={() => setConfirm(true)}>
        Verwijderen
      </Button>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Dag verwijderen?">
        <p className="text-sm text-muted">Deze dag en zijn foto's en video's worden verwijderd. Je gelande tricks blijven in je kluis.</p>
        <div className="mb-4 mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Nee
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              for (const m of media ?? []) await remove(m)
              await remove(s)
              nav('/log', { replace: true })
            }}
          >
            Verwijder
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}
