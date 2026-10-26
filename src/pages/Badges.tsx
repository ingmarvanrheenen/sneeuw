import { Card, Page, PageHeader, Progress, Section, cx } from '../components/ui'
import { Medal } from '../design/Medal'
import { BADGES, LEVELS } from '../lib/progress'
import { useProgress } from '../lib/useProgress'

export default function Badges() {
  const p = useProgress()
  if (!p) return null
  const unlocked = new Set(p.badges.map((b) => b.id))
  return (
    <Page>
      <PageHeader kicker="Progressie" title="Levels & badges" back />
      <Card>
        <div className="flex items-end justify-between">
          <div>
            <div className="label">Level {p.level.level}</div>
            <div className="text-2xl font-semibold">{p.level.name}</div>
          </div>
          <div className="num text-2xl font-semibold text-accent-text">{p.xp} XP</div>
        </div>
        <Progress value={p.level.progress} className="mt-3" />
      </Card>

      <Section title="Ladder">
        <ol className="card divide-y divide-[var(--line)] overflow-hidden p-0">
          {LEVELS.map((l, i) => {
            const reached = p.xp >= l.xp
            const current = i + 1 === p.level.level
            return (
              <li key={l.name} className={cx('flex items-center gap-3 px-4 py-2.5', current && 'bg-accent-soft')}>
                <span className={cx('num w-6 text-sm', reached ? 'text-accent-text' : 'text-muted')}>{String(i + 1).padStart(2, '0')}</span>
                <span className={cx('flex-1 text-sm', reached ? 'font-medium' : 'text-muted')}>{l.name}</span>
                <span className="num text-xs text-muted">{l.xp}</span>
              </li>
            )
          })}
        </ol>
      </Section>

      <Section title={`Badges ${p.badges.length}/${BADGES.length}`}>
        <div className="grid grid-cols-3 gap-2">
          {BADGES.map((b) => {
            const on = unlocked.has(b.id)
            return (
              <div key={b.id} className={cx('card flex flex-col items-center p-3 text-center', !on && 'opacity-70')}>
                <Medal icon={b.icon} mark={b.mark} unlocked={on} size={58} />
                <div className="mt-2 text-xs font-semibold leading-tight">{b.name}</div>
                <div className="mt-0.5 text-[11px] leading-tight text-muted">{b.desc}</div>
              </div>
            )
          })}
        </div>
      </Section>
      <p className="mt-6 text-xs text-muted">
        XP: 50 per dag + 10 per uur, tricks tellen per niveau (×40), beheerst geeft extra, doelen +30, badges +25, quizvragen +2.
      </p>
    </Page>
  )
}
