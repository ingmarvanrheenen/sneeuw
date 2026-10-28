// S.N.O.W.-onderdelen: de letters, de trick-kiezer en de lijst met potjes op de crew-pagina.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, Empty, List, Row, Sheet, cx, inputCls } from './ui'
import { Icon, Spinner } from '../design/icons'
import { TRACKS, TRICKS, TRICK_BY_ID, type Track } from '../content/tricks'
import { MAX_PLAYERS, MIN_PLAYERS, WORD, cachedGames, listGames, snowState, startGame, type GameWithMoves } from '../lib/snow'
import { errMsg } from '../lib/errors'
import { toast } from '../lib/toast'
import type { CrewMember } from '../lib/crew'

/** De vier letters; wat je hebt staat er vet, de rest vaag. */
export function Letters({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cx('display flex gap-1 text-[20px] leading-none', className)}
      aria-label={n ? `Letters: ${WORD.slice(0, n).join('')}` : 'Nog geen letters'}
    >
      {WORD.map((l, i) => (
        <span key={l} aria-hidden className={i < n ? 'text-danger' : 'text-muted/30'}>
          {l}
        </span>
      ))}
    </span>
  )
}

export const RULES =
  'Wie aan de beurt is zet een trick neer. Landt hij hem, dan doet de rest hem na en wie mist krijgt een letter. Mist de zetter, dan gaat de beurt door. Bij S-N-O-W lig je eruit; de laatste die over is wint. Een gelande trick mag niet nog een keer.'

// flat en park eerst: daar spelen de meeste potjes
const PICK_ORDER = [...TRACKS].sort((a, b) => Number(b.id === 'flat' || b.id === 'park') - Number(a.id === 'flat' || a.id === 'park'))

/** Trick kiezen voor je zet: per track, met zoeken. Al gelande tricks staan uit. */
export function TrickPicker({
  open,
  onClose,
  onPick,
  used,
}: {
  open: boolean
  onClose: () => void
  onPick: (id: string) => void
  used: string[]
}) {
  const [track, setTrack] = useState<Track>('flat')
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return TRICKS.filter((t) =>
      s ? t.name.toLowerCase().includes(s) || t.aka?.some((a) => a.toLowerCase().includes(s)) : t.track === track,
    ).sort((a, b) => a.level - b.level)
  }, [q, track])
  return (
    <Sheet open={open} onClose={onClose} title="Kies een trick" closeLabel="Annuleer">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Zoek een trick"
        aria-label="Zoek een trick"
        className={inputCls}
      />
      {!q.trim() && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {PICK_ORDER.map((t) => (
            <Chip key={t.id} active={track === t.id} onClick={() => setTrack(t.id)}>
              {t.name}
            </Chip>
          ))}
        </div>
      )}
      <List className="mb-6 mt-3">
        {shown.map((t) =>
          used.includes(t.id) ? (
            <Row key={t.id} title={<span className="text-muted">{t.name}</span>} detail="Al geweest" />
          ) : (
            <Row
              key={t.id}
              title={t.name}
              onClick={() => {
                onPick(t.id)
                onClose()
              }}
            />
          ),
        )}
        {!shown.length && <Row title={<span className="text-muted">Niks gevonden</span>} />}
      </List>
    </Sheet>
  )
}

const nameOf = (members: CrewMember[], id: string, me: string) =>
  id === me ? 'Jij' : (members.find((m) => m.user_id === id)?.display_name ?? 'Rider')

/** Kort: wie speelt er en hoe staat het. */
export function gameSummary(g: GameWithMoves, members: CrewMember[], me: string) {
  const s = snowState(g.game.players, g.moves)
  const names = g.game.players.map((p) => nameOf(members, p, me)).join(', ')
  if (s.winner) return { names, status: `${nameOf(members, s.winner, me)} won`, done: true }
  const who = nameOf(members, s.turn!.player, me)
  const what =
    s.turn!.kind === 'set'
      ? `${who} ${s.turn!.player === me ? 'bent' : 'is'} aan de beurt`
      : `${who} doet de ${TRICK_BY_ID.get(s.turn!.trickId)?.name ?? 'trick'} na`
  return { names, status: what, done: false }
}

/** Potjes van de crew plus "Nieuw potje". Staat als tab op de crew-pagina. */
export function SnowGames({ crewId, members, me }: { crewId: string; members: CrewMember[]; me: string }) {
  const nav = useNavigate()
  const [games, setGames] = useState<GameWithMoves[] | null>(null)
  const [picking, setPicking] = useState(false)
  const [players, setPlayers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const cached = await cachedGames(crewId)
    if (cached.length || !navigator.onLine) setGames((g) => g ?? cached)
    try {
      setGames(await listGames(crewId))
    } catch (e) {
      setGames((g) => g ?? cached)
      if (navigator.onLine) toast({ title: 'Potjes laden mislukt', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }, [crewId])

  useEffect(() => {
    setGames(null)
    void load()
  }, [load])

  function toggle(id: string) {
    setPlayers((ps) => (ps.includes(id) ? ps.filter((p) => p !== id) : ps.length >= MAX_PLAYERS ? ps : [...ps, id]))
  }

  async function start() {
    setBusy(true)
    try {
      const g = await startGame(crewId, players)
      setPicking(false)
      nav(`/snow/${g.id}`)
    } catch (e) {
      toast({ title: 'Starten lukt niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4">
      <Button
        className="w-full"
        icon={<Icon name="plus" size={18} />}
        onClick={() => {
          setPlayers([me])
          setPicking(true)
        }}
      >
        Nieuw potje
      </Button>
      {games === null ? (
        <div className="flex justify-center py-8 text-muted">
          <Spinner size={20} />
        </div>
      ) : !games.length ? (
        <Empty icon={<Icon name="board" size={36} className="text-muted" />} title="Nog geen potjes" body={RULES} />
      ) : (
        <List className="mt-4">
          {games.map((g) => {
            const s = gameSummary(g, members, me)
            return <Row key={g.game.id} icon={s.done ? 'trophy' : 'board'} title={s.names} detail={s.status} to={`/snow/${g.game.id}`} />
          })}
        </List>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Nieuw potje" closeLabel="Annuleer">
        <p className="mb-3 text-[15px] text-muted">{RULES}</p>
        <p className="mb-2 text-[15px] font-medium">Wie doen er mee? Tik in speelvolgorde.</p>
        <List className="mb-4">
          {members.map((m) => {
            const i = players.indexOf(m.user_id)
            return (
              <Row
                key={m.user_id}
                title={m.user_id === me ? `${m.display_name} (jij)` : m.display_name}
                onClick={() => toggle(m.user_id)}
                chevron={false}
                value={
                  i >= 0 ? (
                    <span className="grid size-7 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-ink">
                      {i + 1}
                    </span>
                  ) : (
                    <span className="block size-7 rounded-full border hairline" />
                  )
                }
              />
            )
          })}
        </List>
        <Button className="mb-6 w-full" disabled={players.length < MIN_PLAYERS || busy} onClick={start}>
          {players.length < MIN_PLAYERS ? `Kies minstens ${MIN_PLAYERS} spelers` : `Start met ${players.length} spelers`}
        </Button>
      </Sheet>
    </div>
  )
}
