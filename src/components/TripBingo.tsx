// Trip-bingo op de trippagina: je eigen kaart om af te vinken, de stand van de crew, en de kaart van een maat.
import { useCallback, useEffect, useState } from 'react'
import { Heading, List, Row, Sheet, cx } from './ui'
import { Icon } from '../design/icons'
import { crewMembers, type CrewMember } from '../lib/crew'
import { bingoPlayer, bingoStand, cachedTicks, listTicks, setTick, type BingoPlayer, type BingoTick } from '../lib/bingo'
import { BINGO_SIZE } from '../content/bingo'
import { getCurrentUserId } from '../lib/auth-state'
import { errMsg } from '../lib/errors'
import { celebrate, toast } from '../lib/toast'
import { sfx } from '../lib/sounds'

function Card({ player, onTap, label }: { player: BingoPlayer; onTap?: (id: string, on: boolean) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${BINGO_SIZE}, minmax(0, 1fr))` }}>
      {player.card.map((sq, i) => {
        const on = player.ticked.has(sq.id)
        const line = player.lineCells.has(i)
        return (
          <button
            key={sq.id}
            type="button"
            aria-pressed={on}
            disabled={!onTap}
            onClick={() => onTap?.(sq.id, !on)}
            className={cx(
              'flex aspect-square items-center justify-center rounded-xl p-1 text-center text-[11px] font-medium leading-tight transition-colors duration-150 hyphens-auto',
              on ? (line ? 'bg-accent text-accent-ink' : 'bg-accent-soft text-accent-text') : 'bg-surface text-text',
              onTap && 'active:opacity-70',
            )}
          >
            {sq.text}
          </button>
        )
      })}
    </div>
  )
}

export function TripBingo({ tripId, crewId }: { tripId: string; crewId: string }) {
  const me = getCurrentUserId() ?? ''
  const [ticks, setTicks] = useState<BingoTick[]>([])
  const [members, setMembers] = useState<CrewMember[]>([])
  const [peek, setPeek] = useState<string | null>(null)

  const load = useCallback(async () => {
    setTicks(await cachedTicks(tripId))
    if (!navigator.onLine) return
    try {
      setTicks(await listTicks(tripId))
    } catch {
      /* laatst bekende vinkjes blijven staan */
    }
  }, [tripId])

  useEffect(() => {
    void load()
    crewMembers(crewId)
      .then(setMembers)
      .catch(() => {})
    // meekijken met de crew: elke halve minuut, en bij terugkomen in de app
    const refresh = () => document.visibilityState === 'visible' && navigator.onLine && void load()
    const timer = setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load, crewId])

  const ids = members.length ? members.map((m) => m.user_id) : [me]
  const stand = bingoStand(tripId, ids.includes(me) ? ids : [me, ...ids], ticks)
  const mine = stand.players.find((p) => p.userId === me)!
  const name = (id: string) => (id === me ? 'Jij' : (members.find((m) => m.user_id === id)?.display_name ?? 'Iemand'))

  async function tap(square: string, on: boolean) {
    const before = bingoPlayer(tripId, me, ticks)
    const next = on
      ? [...ticks, { user_id: me, square, created_at: new Date().toISOString() }]
      : ticks.filter((t) => !(t.user_id === me && t.square === square))
    setTicks(next)
    sfx.toggle()
    const after = bingoPlayer(tripId, me, next)
    if (!before.bingoAt && after.bingoAt)
      celebrate('goal', 'Bingo!', stand.first && stand.first !== me ? 'Niet de eerste, wel een volle lijn.' : 'Een volle lijn.', 'trophy')
    else if (!before.full && after.full) celebrate('goal', 'Volle kaart', 'Alles afgevinkt. Wat een trip.', 'crown')
    try {
      await setTick(crewId, tripId, square, on, me)
    } catch (e) {
      toast({ title: 'Niet opgeslagen', body: errMsg(e), tone: 'error', icon: 'alert' })
      await load()
    }
  }

  const peeked = stand.players.find((p) => p.userId === peek)
  const others = stand.players.filter((p) => p.userId !== me)

  return (
    <section className="mt-8">
      <Heading className="mb-1">Trip-bingo</Heading>
      <p className="mb-3 text-[15px] text-muted">
        {stand.first
          ? `${name(stand.first)} had als eerste bingo.`
          : 'Iedereen een eigen kaart. Vink af wat er gebeurt; de eerste met een volle rij wint.'}
      </p>
      <Card player={mine} onTap={(id, on) => void tap(id, on)} label="Jouw bingokaart" />
      <p className="mt-2 text-[13px] text-muted">
        {mine.ticked.size} van {mine.card.length} afgevinkt{mine.bingoAt ? ' · bingo' : ''}
        {mine.full ? ' · volle kaart' : ''}
      </p>

      {others.length > 0 && (
        <List className="mt-3">
          {others.map((p) => (
            <Row
              key={p.userId}
              icon={p.userId === stand.first ? 'trophy' : p.bingoAt ? 'check' : 'dot'}
              title={name(p.userId)}
              detail={p.full ? 'Volle kaart' : p.bingoAt ? 'Bingo' : undefined}
              value={`${p.ticked.size}/${p.card.length}`}
              onClick={() => setPeek(p.userId)}
            />
          ))}
        </List>
      )}

      <Sheet open={!!peeked} onClose={() => setPeek(null)} title={peeked ? `Kaart van ${name(peeked.userId)}` : ''}>
        {peeked && (
          <div className="pb-6">
            <Card player={peeked} label={`Bingokaart van ${name(peeked.userId)}`} />
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
              <Icon name="info" size={14} /> Iedereen vinkt zijn eigen kaart af. Eerlijk spel.
            </p>
          </div>
        )}
      </Sheet>
    </section>
  )
}
