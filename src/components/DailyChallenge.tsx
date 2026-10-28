// Dagopdracht op Home: je challenge van vandaag, afvinken, één keer per dag een andere, en wie van je crew
// vandaag ook een opdracht deed.
import { useEffect, useMemo, useState } from 'react'
import { Button, Heading, List, Row } from './ui'
import { Icon } from '../design/icons'
import { Stamp } from './Poster'
import { useKind } from '../lib/repo'
import { todayISO } from '../lib/ids'
import { authStore } from '../lib/auth'
import { riderProfiles } from '../lib/riders'
import {
  CHALLENGE_BY_ID,
  crewChallenges,
  flushChallenges,
  rerollChallenge,
  setChallengeDone,
  todayChallenge,
  type ChallengeLog,
  type CrewChallenge,
} from '../lib/challenges'
import { TRICK_BY_ID } from '../content/tricks'
import { sfx } from '../lib/sounds'
import { celebrate } from '../lib/toast'

export function DailyChallenge() {
  const today = todayISO()
  const { user } = authStore.use()
  const progress = useKind('trick')
  const landed = useMemo(
    () => new Set((progress ?? []).filter((p) => p.status === 'geland' || p.status === 'beheerst').map((p) => p.trickId)),
    [progress],
  )
  const [log, setLog] = useState<ChallengeLog | null>(null)
  const [crew, setCrew] = useState<(CrewChallenge & { name: string })[]>([])

  // pas kiezen als je tricks geladen zijn, anders krijgt iedereen eerst een beginnersopdracht
  const ready = progress !== undefined
  useEffect(() => {
    if (!ready) return
    void todayChallenge(today, landed).then(({ log }) => setLog(log))
    // alleen bij laden kiezen; daarna ligt de opdracht van vandaag vast
  }, [ready, today])

  useEffect(() => {
    if (!user || !navigator.onLine) return
    void flushChallenges(today).catch(() => {})
    crewChallenges(today)
      .then(async (rows) => {
        if (!rows.length) return setCrew([])
        const profiles = await riderProfiles(rows.map((r) => r.user_id)).catch(() => ({}) as Record<string, { name: string }>)
        setCrew(rows.map((r) => ({ ...r, name: profiles[r.user_id]?.name ?? 'Iemand' })))
      })
      .catch(() => {})
  }, [user, today, log?.[today]?.done])

  const cur = log?.[today]
  const c = cur && CHALLENGE_BY_ID.get(cur.id)
  if (!c) return null
  const needs = (c.needs ?? []).map((t) => TRICK_BY_ID.get(t)?.name).filter(Boolean)

  async function toggle() {
    const done = !cur!.done
    setLog(await setChallengeDone(today, done))
    if (done) {
      sfx.success()
      celebrate('goal', 'Dagopdracht gedaan', `${c!.text}. +15 XP`, 'target')
    }
  }

  return (
    <section className="mt-8" aria-labelledby="dagopdracht">
      <Heading
        id="dagopdracht"
        action={
          !cur!.done &&
          !cur!.rerolled && (
            <button
              onClick={async () => setLog(await rerollChallenge(today, landed))}
              aria-label="Andere opdracht"
              className="-my-2 -mr-2 px-2 py-2 text-[15px] font-semibold text-accent-text"
            >
              Andere
            </button>
          )
        }
      >
        Dagopdracht
      </Heading>
      <div className="card relative p-4">
        {/* stempel: +15 XP zolang hij open staat, GEDAAN als je hem afvinkt (klapt er dan opnieuw op) */}
        <Stamp
          key={cur!.done ? 'gedaan' : 'open'}
          className="absolute -top-3 right-3"
          tilt={cur!.done ? -9 : 6}
          delay={cur!.done ? 0 : 350}
        >
          {cur!.done ? 'Gedaan' : '+15 XP'}
        </Stamp>
        <p className="pr-16 text-[17px] font-semibold leading-snug">{c.text}</p>
        <p className="mt-1 text-[13px] text-muted">
          Niveau {c.level}
          {needs.length ? ` · met ${needs.join(', ')}` : ''}
        </p>
        {cur!.done ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[15px] font-semibold text-accent-text">
              <Icon name="check" size={18} /> Gedaan · +15 XP
            </span>
            <Button size="sm" variant="plain" onClick={() => void toggle()}>
              Toch niet
            </Button>
          </div>
        ) : (
          <Button className="mt-3 w-full" icon={<Icon name="check" size={18} />} onClick={() => void toggle()}>
            Gedaan
          </Button>
        )}
      </div>
      {crew.length > 0 && (
        <List className="mt-2">
          {crew.map((r) => (
            <Row
              key={r.user_id}
              icon="crew"
              title={`${r.name}: gedaan`}
              detail={CHALLENGE_BY_ID.get(r.challenge)?.text ?? 'Een dagopdracht'}
              to={`/rider/${r.user_id}`}
            />
          ))}
        </List>
      )}
    </section>
  )
}
