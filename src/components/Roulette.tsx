// Trick-roulette: draai en je krijgt een trick die binnen je bereik ligt, met de animatie en een doel erbij.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Chip, LevelDots, List, Row, Sheet } from './ui'
import { Icon } from '../design/icons'
import { TRACKS, type Track, type Trick } from '../content/tricks'
import { create, setTrickStatus, useKind } from '../lib/repo'
import { rouletteCandidates, spin } from '../lib/roulette'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'

const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function RouletteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const progress = useKind('trick')
  const goals = useKind('goal')
  const status = useMemo(() => new Map((progress ?? []).map((p) => [p.trickId, p.status])), [progress])
  const [track, setTrack] = useState<Track | null>(null)
  const [shown, setShown] = useState<Trick | null>(null)
  const [rolling, setRolling] = useState(false)
  const timers = useRef<number[]>([])
  const candidates = useMemo(() => rouletteCandidates(status, track), [status, track])

  const stop = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => stop, [])

  function roll() {
    stop()
    const pick = spin(candidates, status, Math.random, shown?.id)
    if (!pick) return setShown(null)
    sfx.tap()
    if (reduced() || candidates.length < 2) return setShown(pick)
    // even langs een paar namen, steeds langzamer, en dan stoppen op de echte
    setRolling(true)
    let t = 0
    for (let i = 0; i < 9; i++) {
      t += 50 + i * 18
      timers.current.push(window.setTimeout(() => setShown(candidates[Math.floor(Math.random() * candidates.length)]), t))
    }
    timers.current.push(
      window.setTimeout(() => {
        setShown(pick)
        setRolling(false)
        sfx.toggle()
      }, t + 220),
    )
  }

  // bij openen of een andere track meteen draaien
  useEffect(() => {
    if (open && progress) roll()
    if (!open) {
      stop()
      setRolling(false)
    }
    // roll leest candidates, en die volgen uit track en progress
  }, [open, track, progress === undefined])

  const goal = shown && goals?.some((g) => !g.done && !g.deleted && g.trickId === shown.id)

  async function addGoal(t: Trick) {
    await create('goal', { title: `${t.name} leren`, trickId: t.id, done: false })
    if (!status.get(t.id)) await setTrickStatus(t.id, 'wil')
    toast({ title: 'Doel toegevoegd', body: t.name, icon: 'target' })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Trick-roulette">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip active={!track} onClick={() => setTrack(null)}>
          Alles
        </Chip>
        {TRACKS.map((t) => (
          <Chip key={t.id} active={track === t.id} onClick={() => setTrack(t.id)}>
            {t.name}
          </Chip>
        ))}
      </div>

      {!candidates.length ? (
        <p className="py-10 text-center text-[15px] text-muted">
          {track
            ? 'Alles in deze track dat binnen bereik ligt heb je al geland. Kies een andere.'
            : 'Alles binnen bereik is geland. Respect.'}
        </p>
      ) : (
        <div className="pb-6">
          <div className="py-8 text-center" aria-live="polite" aria-busy={rolling}>
            <div className={rolling ? 'opacity-60' : undefined}>
              <div className="display text-[34px] leading-tight">{shown?.name ?? ''}</div>
              {shown && (
                <div className="mt-2 flex items-center justify-center gap-2 text-[15px] text-muted">
                  {TRACKS.find((t) => t.id === shown.track)?.name} <LevelDots level={shown.level} />
                </div>
              )}
            </div>
            {shown && !rolling && <p className="mx-auto mt-3 max-w-sm text-[15px] text-muted">{shown.summary}</p>}
          </div>

          {shown && !rolling && (
            <List className="mb-4">
              <Row icon="play" title="Bekijk de animatie en stappen" to={`/tricks/${shown.id}`} />
              <Row
                icon="target"
                title={goal ? 'Staat in je doelen' : 'Zet als doel'}
                chevron={false}
                onClick={goal ? undefined : () => void addGoal(shown)}
              />
            </List>
          )}

          <Button className="w-full" icon={<Icon name="replay" size={18} />} disabled={rolling} onClick={roll}>
            Nog een keer
          </Button>
          <p className="mt-3 text-center text-[13px] text-muted">
            {candidates.length === 1 ? '1 trick' : `${candidates.length} tricks`} binnen je bereik
          </p>
        </div>
      )}
    </Sheet>
  )
}
