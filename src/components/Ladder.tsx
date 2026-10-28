// Seizoensladder op de crew-pagina: klassement van dit seizoen, vorig seizoen of altijd.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip, Section, cx } from './ui'
import { RiderAvatar } from './RiderParts'
import { currentSeason, ladder, previousSeason } from '../lib/ladder'
import { plural } from '../lib/format'
import type { CrewMember } from '../lib/crew'
import type { CrewRider } from '../lib/riders'

export function CrewLadder({ members, riders, me }: { members: CrewMember[]; riders: Record<string, CrewRider>; me: string }) {
  const now = currentSeason()
  const prev = previousSeason(now)
  // zolang nog niemand met de nieuwe versie gesynct heeft, is er geen seizoens-XP: dan eerst het totaal
  const [picked, setSeason] = useState<string | null>(null)
  const season = picked ?? (members.some((m) => m.stats.seasonXP) ? now : 'altijd')
  const rows = ladder(members, season)
  const byId = new Map(members.map((m) => [m.user_id, m]))
  return (
    <Section title="Seizoensladder">
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        <Chip active={season === now} onClick={() => setSeason(now)}>
          Dit seizoen ({now})
        </Chip>
        <Chip active={season === prev} onClick={() => setSeason(prev)}>
          Vorig seizoen ({prev})
        </Chip>
        <Chip active={season === 'altijd'} onClick={() => setSeason('altijd')}>
          Altijd
        </Chip>
      </div>
      {!rows.length ? (
        <p className="card p-4 text-[15px] text-muted">
          {season === now
            ? 'Nog niemand heeft XP dit seizoen. Log je eerste dag en je staat bovenaan.'
            : 'Niemand van de crew heeft XP in dat seizoen.'}
        </p>
      ) : (
        <ol className="card divide-y divide-[var(--line)] overflow-hidden p-0">
          {rows.map((r) => {
            const m = byId.get(r.user_id)!
            return (
              <li key={r.user_id} className={cx(r.user_id === me && 'bg-accent-soft')}>
                <Link to={`/rider/${r.user_id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                  <span className={cx('num w-6 text-lg font-semibold', r.rank === 1 ? 'text-accent-text' : 'text-muted')}>{r.rank}</span>
                  <RiderAvatar photo={riders[r.user_id]?.profile.photo} name={r.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="label">
                      {m.stats.levelName ?? 'Groentje'} · {plural(m.stats.days ?? 0, 'dag', 'dagen')} ·{' '}
                      {plural(m.stats.tricksLanded ?? 0, 'trick', 'tricks')}
                    </div>
                  </div>
                  <div className="num text-right">
                    <div className="font-semibold">{r.xp}</div>
                    <div className="label">xp</div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
      <p className="mt-2 text-xs text-muted">
        {season === 'altijd'
          ? 'Al je XP ooit. Valpartijen tellen niet mee (gelukkig).'
          : 'XP van dagen, tricks en doelen in dit seizoen. Het podium van vorig seizoen staat als medaille op de skipas.'}
      </p>
    </Section>
  )
}
