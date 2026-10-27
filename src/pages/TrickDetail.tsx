import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { List, Page, PageHeader, Row, Section, Segmented, cx, inputCls, LevelDots } from '../components/ui'
import { Icon, Spinner } from '../design/icons'
import { MediaAddButton, MediaGrid } from '../components/Media'
import { TRACKS, TRICK_BY_ID, trickXP, unlocks, ytUrl } from '../content/tricks'
import { create, getTrickProgress, setTrickStatus, update, useKind } from '../lib/repo'
import { db } from '../lib/db'
import { celebrate, toast } from '../lib/toast'
import type { MediaMeta, TrickProgress, TrickStatus } from '../lib/types'
import { STATUS_LABEL } from './Tricks'

const Player3D = lazy(() => import('../anim3d/Player3D'))

const STATUSES: TrickStatus[] = ['wil', 'bezig', 'geland', 'beheerst']

function Points({ items, icon, tone }: { items: string[]; icon: 'check' | 'alert' | 'info' | 'sparkle'; tone: string }) {
  return (
    <ul className="space-y-2.5">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
          <Icon name={icon} size={16} className={cx('mt-0.5 shrink-0', tone)} />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  )
}

export default function TrickDetail() {
  const { id = '' } = useParams()
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

  async function addGoal() {
    await create('goal', { title: `${trick!.name} leren`, trickId: trick!.id, done: false })
    if (!progress) await setTrickStatus(trick!.id, 'wil')
    toast({ title: 'Doel toegevoegd', body: trick!.name, icon: 'target' })
  }

  async function addMedia(added: MediaMeta[]) {
    const p = progress ?? (await setTrickStatus(trick!.id, 'bezig'))
    await update(p, { mediaIds: [...p.mediaIds, ...added.map((m) => m.id)] })
  }

  return (
    <Page>
      <PageHeader
        subtitle={`${TRACKS.find((t) => t.id === trick.track)?.name} · niveau ${trick.level}${trick.aka ? ` · ook: ${trick.aka.join(', ')}` : ''}`}
        title={trick.name}
        back
      />
      <p className="-mt-1 mb-5 text-[17px] leading-relaxed">{trick.summary}</p>

      {trick.anim ? (
        <Suspense
          fallback={
            <div className="card grid aspect-[4/3] place-items-center text-muted">
              <Spinner size={22} />
            </div>
          }
        >
          <Player3D key={trick.id} trick={trick} />
        </Suspense>
      ) : (
        <p className="flex items-center gap-2 text-[15px] text-muted">
          <Icon name="info" size={18} /> Geen animatie voor deze. Check de video's.
        </p>
      )}

      <Section title="Jouw status">
        <Segmented
          value={progress?.status ?? ('' as TrickStatus)}
          onChange={setStatus}
          options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
        {progress?.firstLandedAt && (
          <p className="mt-2 text-[13px] text-muted">
            Eerste keer geland op <span className="num">{progress.firstLandedAt}</span>
          </p>
        )}
        {missing.length > 0 && (
          <p className="mt-3 text-[15px] text-muted">
            Handig om eerst te kunnen:{' '}
            {missing.map((p, i) => (
              <span key={p}>
                {i > 0 && ', '}
                <Link to={`/tricks/${p}`} className="text-accent-text">
                  {TRICK_BY_ID.get(p)?.name}
                </Link>
              </span>
            ))}
            . Maar het is jouw board: probeer gerust.
          </p>
        )}
      </Section>

      <Section title="Stap voor stap">
        <ol className="card divide-y divide-[var(--line)]">
          {trick.steps.map((s, i) => (
            <li key={i} className="flex gap-3 px-4 py-3 text-[15px]">
              <span className="num w-4 shrink-0 font-semibold text-accent-text">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Veelgemaakte fouten">
        <Points items={trick.mistakes} icon="alert" tone="text-warn" />
      </Section>

      <Section title="Veiligheid">
        <Points items={trick.safety} icon="info" tone="text-heel" />
      </Section>

      {trick.tips && (
        <Section title="Tip">
          <Points items={trick.tips} icon="sparkle" tone="text-accent-text" />
        </Section>
      )}

      <List className="mt-8">
        <Row
          icon="target"
          title={goal ? 'Staat in je doelen' : 'Zet als doel'}
          chevron={false}
          onClick={goal || landedSet.has(trick.id) ? undefined : addGoal}
        />
        <Row icon="chat" title="Vraag Coach Daddy hierover" to={`/coach?trick=${trick.id}`} />
        <Row
          icon="video"
          title={
            <a href={ytUrl(trick)} target="_blank" rel="noreferrer" className="block">
              Video's op YouTube
            </a>
          }
          chevron={false}
          value={<Icon name="external" size={16} className="text-muted" />}
        />
      </List>

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
          placeholder="Eigen notitie: wat werkte voor jou?"
          className={cx(inputCls, 'mt-2')}
        />
      </Section>

      {next.length > 0 && (
        <Section title="Hierna">
          <List>
            {next.map((t) => (
              <Row key={t.id} title={t.name} value={<LevelDots level={t.level} />} to={`/tricks/${t.id}`} />
            ))}
          </List>
        </Section>
      )}
    </Page>
  )
}
