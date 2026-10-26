import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Page, PageHeader, Section, cx, inputCls, LevelDots } from '../components/ui'
import { Icon } from '../design/icons'
import { TrickAnimation } from '../anim/TrickAnimation'
import { MediaAddButton, MediaGrid } from '../components/Media'
import { TRACKS, TRICK_BY_ID, trickXP, unlocks, ytUrl } from '../content/tricks'
import { create, getTrickProgress, setTrickStatus, update, useKind } from '../lib/repo'
import { db } from '../lib/db'
import { celebrate, toast } from '../lib/toast'
import type { MediaMeta, TrickProgress, TrickStatus } from '../lib/types'
import { STATUS_LABEL, StatusDot } from './Tricks'

const STATUSES: TrickStatus[] = ['wil', 'bezig', 'geland', 'beheerst']

function List({ items, icon, tone }: { items: string[]; icon: 'check' | 'alert' | 'info' | 'sparkle'; tone: string }) {
  return (
    <ul className="space-y-2">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed">
          <Icon name={icon} size={16} className={cx('mt-0.5 shrink-0', tone)} />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  )
}

export default function TrickDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const trick = TRICK_BY_ID.get(id)
  const progress = useLiveQuery(() => getTrickProgress(id), [id]) as TrickProgress | undefined
  const goals = useKind('goal')
  const progressAll = useKind('trick')
  const media = useLiveQuery(
    async () => (await db.records.where('trickId').equals(id).toArray()).filter((r) => r.kind === 'media' && !r.deleted) as MediaMeta[],
    [id],
  )
  const [note, setNote] = useState('')
  useEffect(() => {
    setNote(progress?.note ?? '')
  }, [progress?.id, progress?.note])

  if (!trick)
    return (
      <Page>
        <PageHeader title="Onbekende trick" back="/tricks" />
      </Page>
    )

  const landedSet = new Set((progressAll ?? []).filter((p) => p.status === 'geland' || p.status === 'beheerst').map((p) => p.trickId))
  const missing = trick.prereqs.filter((p) => !landedSet.has(p))
  const goal = (goals ?? []).find((g) => g.trickId === trick.id && !g.done)
  const next = unlocks(trick.id)

  async function setStatus(s: TrickStatus) {
    const wasLanded = !!progress?.firstLandedAt
    await setTrickStatus(trick!.id, s)
    if ((s === 'geland' || s === 'beheerst') && !wasLanded) {
      celebrate('landed', `Geland: ${trick!.name}`, `+${trickXP(trick!)} XP · staat in je kluis`, 'stomp')
      if (goal) {
        await update(goal, { done: true, doneAt: Date.now() })
        celebrate('goal', 'Doel gehaald', goal.title, 'target')
      }
    }
  }

  async function addMedia(added: MediaMeta[]) {
    const p = progress ?? (await setTrickStatus(trick!.id, 'bezig'))
    await update(p, { mediaIds: [...p.mediaIds, ...added.map((m) => m.id)] })
  }

  return (
    <Page>
      <PageHeader kicker={`${TRACKS.find((t) => t.id === trick.track)?.name} · niveau ${trick.level}`} title={trick.name} back />
      {trick.aka && <div className="-mt-2 mb-3 text-sm text-muted">ook: {trick.aka.join(', ')}</div>}

      {trick.anim ? (
        <TrickAnimation anim={trick.anim} />
      ) : (
        <Card className="flex items-center gap-3 text-sm text-muted">
          <Icon name="info" size={20} />
          Geen animatie voor deze, check de video.
        </Card>
      )}

      <Section title="Jouw status">
        <div className="grid grid-cols-4 gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cx(
                'flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 text-xs font-medium transition active:scale-95',
                progress?.status === s ? 'border-accent bg-accent-soft text-text' : 'hairline bg-surface text-muted',
              )}
            >
              <StatusDot status={s} />
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {progress?.firstLandedAt && (
          <div className="mt-2 text-xs text-muted">
            Eerste keer geland op <span className="num">{progress.firstLandedAt}</span>
          </div>
        )}
        {missing.length > 0 && (
          <Card className="mt-3 border-dashed text-sm">
            <div className="label mb-1">Aanrader: eerst</div>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((p) => (
                <Link key={p} to={`/tricks/${p}`} className="rounded-full bg-surface-2 px-3 py-1">
                  {TRICK_BY_ID.get(p)?.name}
                </Link>
              ))}
            </div>
            <div className="mt-2 text-xs text-muted">Maar het is jouw board. Probeer gerust, je leert er hoe dan ook van.</div>
          </Card>
        )}
      </Section>

      <Section title="Wat is het">
        <p className="leading-relaxed">{trick.summary}</p>
      </Section>

      <Section title="Stappen">
        <ol className="space-y-2">
          {trick.steps.map((s, i) => (
            <li key={i} className="card flex gap-3 p-3 text-sm">
              <span className="num text-accent-text">{String(i + 1).padStart(2, '0')}</span>
              {s}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Veelgemaakte fouten">
        <Card>
          <List items={trick.mistakes} icon="alert" tone="text-warn" />
        </Card>
      </Section>

      <Section title="Veiligheid">
        <Card>
          <List items={trick.safety} icon="info" tone="text-heel" />
        </Card>
      </Section>

      {trick.tips && (
        <Section title="Tips">
          <Card>
            <List items={trick.tips} icon="sparkle" tone="text-accent-text" />
          </Card>
        </Section>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <a
          href={ytUrl(trick)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-surface-2 text-[15px] font-medium"
        >
          <Icon name="video" size={18} /> Video's
        </a>
        <Button
          variant={goal ? 'outline' : 'ghost'}
          icon={<Icon name="target" size={18} />}
          disabled={!!goal || landedSet.has(trick.id)}
          onClick={async () => {
            await create('goal', { title: `${trick.name} leren`, trickId: trick.id, done: false })
            if (!progress) await setTrickStatus(trick.id, 'wil')
            toast({ title: 'Doel toegevoegd', body: trick.name, icon: 'target' })
          }}
        >
          {goal ? 'Is een doel' : 'Als doel'}
        </Button>
      </div>
      <Button variant="ghost" className="mt-2 w-full" icon={<Icon name="chat" size={18} />} onClick={() => nav(`/coach?trick=${trick.id}`)}>
        Vraag Coach Daddy hierover
      </Button>

      <Section title="Kluis: jouw clips">
        <MediaGrid items={media ?? []} editable />
        <div className="mt-2">
          <MediaAddButton link={{ trickId: trick.id }} onAdded={addMedia} label="Clip toevoegen" />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={async () => {
            if (note === (progress?.note ?? '')) return
            const p = progress ?? (await setTrickStatus(trick.id, 'bezig'))
            await update(p, { note })
          }}
          rows={2}
          placeholder="Eigen notitie (wat werkte voor jou?)"
          className={cx(inputCls, 'mt-2')}
        />
      </Section>

      {next.length > 0 && (
        <Section title="Hierna">
          <div className="space-y-2">
            {next.map((t) => (
              <Link key={t.id} to={`/tricks/${t.id}`} className="card flex items-center justify-between p-3">
                <span className="text-sm font-medium">{t.name}</span>
                <LevelDots level={t.level} />
              </Link>
            ))}
          </div>
        </Section>
      )}
    </Page>
  )
}
