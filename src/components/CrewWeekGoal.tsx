// Crew-doel van de week bovenaan de crew-feed: één gezamenlijk doel als poster, met wie wat bijdroeg.
import { Segments, Stamp } from './Poster'
import { crewGoal, crewGoalProgress, weekOf } from '../lib/crewGoal'
import { fmtShort } from '../lib/format'
import { todayISO } from '../lib/ids'
import type { CrewMember, FeedPost } from '../lib/crew'

const num = (n: number) => n.toLocaleString('nl-NL')

export function CrewWeekGoal({ crewId, members, posts, me }: { crewId: string; members: CrewMember[]; posts: FeedPost[]; me: string }) {
  const week = weekOf(todayISO())
  const goal = crewGoal(crewId, week.key, members.length)
  const days = posts.filter((p) => p.session).map((p) => ({ userId: p.userId, session: p.session! }))
  const prog = crewGoalProgress(goal, days, week)
  const name = (id: string) => (id === me ? 'Jij' : (members.find((m) => m.user_id === id)?.display_name ?? 'Iemand'))
  const left = week.daysLeft === 0 ? 'laatste dag' : `nog ${week.daysLeft} ${week.daysLeft === 1 ? 'dag' : 'dagen'}`

  return (
    <section aria-label="Crew-doel van de week" className="relative mt-4 rounded-[6px] bg-block p-4 pb-3.5 text-block-ink">
      {prog.done && (
        <Stamp className="absolute -top-3 right-3" tilt={-8}>
          Gehaald
        </Stamp>
      )}
      <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">
        Crew-doel · {fmtShort(week.from)} – {fmtShort(week.to)} · {left}
      </div>
      <h2 className="display mt-2 pr-10 text-[34px] uppercase leading-[0.9]">{goal.title}</h2>
      <Segments value={prog.value / prog.target} count={Math.min(12, Math.max(4, prog.target))} className="mt-3" />
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="display num text-[22px]">
          {num(prog.value)} / {num(prog.target)}
        </span>
        <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] opacity-80">{goal.unit}</span>
      </div>
      <p className="mt-2 text-[13px] opacity-80">
        {prog.perMember.length
          ? prog.perMember.map((m) => `${name(m.userId)} ${goal.kind === 'iedereen' ? '' : num(m.value)}`.trim()).join(' · ')
          : 'Nog niemand deze week. Deel je dag met de crew, dan telt hij mee.'}
      </p>
    </section>
  )
}
