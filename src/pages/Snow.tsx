import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Empty, List, Page, PageHeader, Row, Section, cx } from '../components/ui'
import { Letters, RULES, TrickPicker } from '../components/SnowParts'
import { RiderAvatar } from '../components/RiderParts'
import { Icon, Spinner } from '../design/icons'
import { TRICK_BY_ID } from '../content/tricks'
import { authStore } from '../lib/auth'
import { crewMembers, type CrewMember } from '../lib/crew'
import { kvGet, kvSet } from '../lib/db'
import { errMsg } from '../lib/errors'
import {
  SnowConflict,
  WORD,
  cachedGame,
  isOut,
  loadGame,
  playTurn,
  snowState,
  startGame,
  undoLast,
  type GameWithMoves,
  type SnowMove,
} from '../lib/snow'
import { sfx } from '../lib/sounds'
import { celebrate, toast } from '../lib/toast'

const trickName = (id: string) => TRICK_BY_ID.get(id)?.name ?? id

export default function Snow() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { user } = authStore.use()
  const me = user?.id ?? ''
  const [g, setG] = useState<GameWithMoves | null | undefined>(undefined)
  const [members, setMembers] = useState<CrewMember[]>([])
  const [trick, setTrick] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (quiet = false) => {
      if (quiet && !navigator.onLine) return
      try {
        setG(await loadGame(id))
      } catch (e) {
        const cached = await cachedGame(id)
        setG((x) => x ?? cached)
        if (!quiet && navigator.onLine) toast({ title: 'Potje laden mislukt', body: errMsg(e), tone: 'error', icon: 'alert' })
      }
    },
    [id],
  )

  useEffect(() => {
    void load()
  }, [load])

  // namen van de crew, laatst bekende lokaal voor als er geen bereik is
  const crewId = g?.game.crew_id
  useEffect(() => {
    if (!crewId) return
    const key = `crewMembers:${crewId}`
    void kvGet<CrewMember[]>(key, []).then((c) => c.length && setMembers((m) => (m.length ? m : c)))
    crewMembers(crewId)
      .then((m) => {
        setMembers(m)
        void kvSet(key, m)
      })
      .catch(() => {})
  }, [crewId])

  // live meekijken: elke 5 seconden zolang het potje open staat
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && void load(true)
    const timer = setInterval(refresh, 5000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  const name = (p: string) => (p === me ? 'Jij' : (members.find((m) => m.user_id === p)?.display_name ?? 'Rider'))

  if (g === undefined)
    return (
      <Page>
        <PageHeader title="S.N.O.W." back="/crew" />
        <div className="flex justify-center py-10 text-muted">
          <Spinner size={22} />
        </div>
      </Page>
    )
  if (g === null)
    return (
      <Page>
        <PageHeader title="S.N.O.W." back="/crew" />
        <Empty
          icon={<Icon name="board" size={40} className="text-muted" />}
          title="Potje niet gevonden"
          body="Misschien is hij weggegooid."
        />
      </Page>
    )

  const { game } = g
  const s = snowState(game.players, g.moves)
  const turn = s.turn

  async function play(landed: boolean) {
    if (!turn) return
    setBusy(true)
    try {
      const move = await playTurn(game, s, landed, trick ?? undefined)
      const next = { ...g!, moves: [...g!.moves, move] }
      setG(next)
      setTrick(null)
      const after = snowState(game.players, next.moves)
      if (after.winner) celebrate('goal', `${name(after.winner)} wint S.N.O.W.`, 'Laatste die over is.', 'trophy')
      else if (turn.kind === 'match' && !landed) {
        const n = after.letters[turn.player]
        sfx.tap()
        toast({
          title: n >= WORD.length ? `${name(turn.player)} ligt eruit` : `${name(turn.player)} krijgt de ${WORD[n - 1]}`,
          tone: 'default',
          icon: 'impact',
        })
      }
      void load(true)
    } catch (e) {
      if (e instanceof SnowConflict) {
        toast({ title: 'Net te laat', body: e.message, icon: 'sync' })
        await load(true)
      } else toast({ title: 'Opslaan lukt niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!s.nextSeq) return
    setBusy(true)
    try {
      await undoLast(game.id, s.nextSeq - 1)
      setG({ ...g!, moves: g!.moves.filter((m) => m.seq !== s.nextSeq - 1) })
    } catch (e) {
      toast({ title: 'Ongedaan maken lukt niet', body: errMsg(e), tone: 'error', icon: 'alert' })
      await load(true)
    } finally {
      setBusy(false)
    }
  }

  async function rematch() {
    // winnaar begint
    const ps = s.winner ? [s.winner, ...game.players.filter((p) => p !== s.winner)] : game.players
    try {
      const n = await startGame(game.crew_id, ps)
      setG(undefined)
      nav(`/snow/${n.id}`, { replace: true })
    } catch (e) {
      toast({ title: 'Starten lukt niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    }
  }

  const line = (m: SnowMove) => {
    const t = trickName(m.trick_id)
    if (m.kind === 'set') return m.landed ? `${name(m.player)} zet de ${t} neer` : `${name(m.player)} mist de ${t}, beurt door`
    return m.landed ? `${name(m.player)} doet de ${t} na` : `${name(m.player)} mist de ${t}`
  }

  return (
    <Page>
      <PageHeader
        title="S.N.O.W."
        back="/crew"
        subtitle={
          s.winner
            ? `${name(s.winner)} ${s.winner === me ? 'hebt' : 'heeft'} gewonnen`
            : `${game.players.length} spelers · zet ${s.moves.length + 1}`
        }
      />

      <List>
        {game.players.map((p) => {
          const out = isOut(s, p)
          const up = turn?.player === p
          return (
            <Row
              key={p}
              icon={<RiderAvatar name={name(p)} size={32} />}
              title={<span className={cx(out && 'text-muted line-through', up && 'font-semibold')}>{name(p)}</span>}
              detail={
                s.winner === p
                  ? 'Winnaar'
                  : out
                    ? 'Ligt eruit'
                    : up
                      ? turn!.kind === 'set'
                        ? 'Zet een trick neer'
                        : 'Doet hem na'
                      : undefined
              }
              className={cx(up && 'bg-accent-soft')}
            >
              <Letters n={s.letters[p]} />
            </Row>
          )
        })}
      </List>

      {s.winner ? (
        <Section title={`${name(s.winner)} wint`}>
          <p className="text-[15px] text-muted">Laatste die over is. Revanche? De winnaar begint.</p>
          <Button className="mt-4 w-full" icon={<Icon name="replay" size={18} />} onClick={rematch}>
            Nog een potje
          </Button>
        </Section>
      ) : turn?.kind === 'set' ? (
        <Section title={turn.player === me ? 'Jij zet een trick neer' : `${name(turn.player)} zet een trick neer`}>
          <List>
            <Row
              icon="board"
              title={trick ? trickName(trick) : 'Kies een trick'}
              detail={trick ? 'Tik om te wisselen' : 'Uit de bijbel; al geweest kan niet'}
              onClick={() => setPicking(true)}
            />
            {trick && <Row icon="play" title="Bekijk hoe hij moet" to={`/tricks/${trick}`} />}
          </List>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="ghost" disabled={!trick || busy} onClick={() => play(false)}>
              Mis
            </Button>
            <Button disabled={!trick || busy} onClick={() => play(true)}>
              Geland
            </Button>
          </div>
        </Section>
      ) : turn ? (
        <Section
          title={
            turn.player === me ? `Jij doet de ${trickName(turn.trickId)} na` : `${name(turn.player)} doet de ${trickName(turn.trickId)} na`
          }
        >
          <List>
            <Row
              icon="play"
              title={trickName(turn.trickId)}
              detail={`Neergezet door ${turn.setter === me ? 'jou' : name(turn.setter)}`}
              to={`/tricks/${turn.trickId}`}
            />
          </List>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => play(false)}>
              Mis
            </Button>
            <Button disabled={busy} onClick={() => play(true)}>
              Geland
            </Button>
          </div>
        </Section>
      ) : null}

      {s.moves.length > 0 && (
        <Section
          title="Verloop"
          action={
            <button disabled={busy} onClick={undo} className="-my-2 -mr-2 px-2 py-2 text-[15px] text-accent-text disabled:opacity-40">
              Laatste ongedaan maken
            </button>
          }
        >
          <List>
            {[...s.moves].reverse().map((m) => (
              <Row key={m.seq} icon={m.landed ? 'check' : 'impact'} title={<span className="block whitespace-normal">{line(m)}</span>} />
            ))}
          </List>
        </Section>
      )}

      {!s.moves.length && <p className="mt-6 text-[15px] text-muted">{RULES}</p>}

      <TrickPicker open={picking} onClose={() => setPicking(false)} onPick={setTrick} used={s.used} />
    </Page>
  )
}
