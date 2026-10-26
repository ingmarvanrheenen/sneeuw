import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Chip, Empty, Page, PageHeader, Progress, LevelDots } from '../components/ui'
import { Icon } from '../design/icons'
import { MediaThumb } from '../components/Media'
import { useKind } from '../lib/repo'
import { db } from '../lib/db'
import { TRACKS, TRICKS, TRICK_BY_ID, type Track } from '../content/tricks'
import { fmtShort } from '../lib/format'
import type { MediaMeta } from '../lib/types'

export default function Vault() {
  const progress = useKind('trick')
  const [track, setTrack] = useState<Track | 'alle'>('alle')
  const media = useLiveQuery(
    async () => (await db.records.where('kind').equals('media').toArray()).filter((m) => !m.deleted) as MediaMeta[],
    [],
  )
  const landed = useMemo(
    () =>
      (progress ?? [])
        .filter((p) => (p.status === 'geland' || p.status === 'beheerst') && TRICK_BY_ID.has(p.trickId))
        .sort((a, b) => (b.firstLandedAt ?? '').localeCompare(a.firstLandedAt ?? '')),
    [progress],
  )
  const shown = landed.filter((p) => track === 'alle' || TRICK_BY_ID.get(p.trickId)!.track === track)

  return (
    <Page>
      <PageHeader kicker="Kluis" title="Je kluis" back />
      <div className="card p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="label">Geland</div>
            <div className="num text-3xl font-semibold">
              {landed.length}
              <span className="text-base text-muted">/{TRICKS.length}</span>
            </div>
          </div>
          <Icon name="vault" size={36} className="text-accent-text" />
        </div>
        <Progress value={landed.length / TRICKS.length} className="mt-3" />
      </div>
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
        <Chip active={track === 'alle'} onClick={() => setTrack('alle')}>
          Alles
        </Chip>
        {TRACKS.map((t) => (
          <Chip key={t.id} active={track === t.id} onClick={() => setTrack(t.id)}>
            {t.name}
          </Chip>
        ))}
      </div>
      {!shown.length ? (
        <div className="mt-4">
          <Empty
            icon={<Icon name="vault" size={40} className="text-muted" />}
            title="Kluis is nog leeg"
            body="Zet een trick op 'geland' (of log hem bij je dag) en hij komt hier, met je clips erbij."
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {shown.map((p) => {
            const t = TRICK_BY_ID.get(p.trickId)!
            const clip = (media ?? []).find((m) => m.trickId === p.trickId)
            return (
              <Link key={p.id} to={`/tricks/${t.id}`} className="card overflow-hidden p-0">
                {clip ? (
                  <MediaThumb m={clip} className="pointer-events-none block aspect-[4/3] w-full rounded-none" />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center bg-surface-2 text-muted">
                    <Icon name="camera" size={22} />
                  </div>
                )}
                <div className="p-3">
                  <div className="truncate text-sm font-semibold">{t.name}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <LevelDots level={t.level} />
                    <span className="label">{p.firstLandedAt ? fmtShort(p.firstLandedAt) : ''}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </Page>
  )
}
