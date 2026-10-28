// Season Wrapped: je seizoen als story. Tik rechts voor verder, links voor terug; elke kaart is te delen.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Empty, Page, PageHeader, cx } from '../components/ui'
import { Icon, Spinner } from '../design/icons'
import { useProgress } from '../lib/useProgress'
import { seasonsWithData, wrapped } from '../lib/wrapped'
import { renderWrappedCard, shareImage } from '../lib/shareCard'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'

/** groot woord: korter = groter */
const bigSize = (s: string) =>
  s.length <= 5 ? 'text-[104px]' : s.length <= 9 ? 'text-[76px]' : s.length <= 14 ? 'text-[54px]' : 'text-[40px]'

export default function Wrapped() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const p = useProgress()
  const seasons = useMemo(() => (p ? seasonsWithData(p.input.sessions) : []), [p])
  const season = params.get('seizoen') ?? seasons[0]
  const cards = useMemo(() => (p && season ? wrapped(p.input, season) : []), [p, season])
  const [i, setI] = useState(0)
  const [sharing, setSharing] = useState(false)

  const close = () => (window.history.length > 1 ? nav(-1) : nav('/stats'))
  const go = (d: number) => setI((x) => Math.max(0, Math.min(cards.length - 1, x + d)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!p)
    return (
      <div className="grid min-h-dvh place-items-center text-muted">
        <Spinner size={22} />
      </div>
    )

  if (!cards.length)
    return (
      <Page>
        <PageHeader title="Season Wrapped" back />
        <Empty
          icon={<Icon name="snowflake" size={40} className="text-muted" />}
          title="Nog geen seizoen om terug te kijken"
          body="Log je dagen op de plank, dan maken we hier je seizoen op een rij."
          action={<Button onClick={() => nav('/log/nieuw')}>Dag loggen</Button>}
        />
      </Page>
    )

  const card = cards[Math.min(i, cards.length - 1)]
  const onAccent = i % 2 === 1
  const last = i === cards.length - 1

  async function share() {
    setSharing(true)
    try {
      const blob = await renderWrappedCard(card, season!, i, cards.length)
      await shareImage(blob, `sneeuw-daddy-wrapped-${season!.replace('/', '-')}-${card.id}.png`, `Season Wrapped ${season}`)
    } catch (e) {
      toast({ title: 'Delen lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setSharing(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`Season Wrapped ${season}`}
      className={cx(
        'fixed inset-0 z-[60] flex flex-col transition-colors duration-300',
        onAccent ? 'bg-accent text-accent-ink' : 'bg-text text-bg',
      )}
    >
      <div className="pt-safe px-4">
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {cards.map((c, k) => (
            <span key={c.id} className={cx('h-1 flex-1 rounded-full', k <= i ? 'bg-current' : 'bg-current opacity-25')} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[15px] font-semibold opacity-70">Season Wrapped {season}</span>
          <button aria-label="Sluiten" onClick={close} className="-mr-2 grid size-11 place-items-center rounded-full active:opacity-60">
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        {/* tikzones: links terug, rechts verder */}
        <button aria-label="Vorige" disabled={i === 0} onClick={() => go(-1)} className="absolute inset-y-0 left-0 z-10 w-1/3" />
        <button aria-label="Volgende" disabled={last} onClick={() => go(1)} className="absolute inset-y-0 right-0 z-10 w-2/3" />
        <div key={card.id} aria-live="polite" className="wrapped-in pointer-events-none absolute inset-0 flex flex-col justify-center px-6">
          <Icon name={card.icon} size={44} />
          <div className={cx('display mt-5 break-words leading-[0.95]', bigSize(card.big))}>{card.big}</div>
          <div className="mt-4 text-[28px] font-semibold leading-tight">{card.title}</div>
          <p className="mt-3 max-w-md text-[19px] leading-snug opacity-75">{card.body}</p>
        </div>
      </div>

      <div className="pb-safe flex gap-2 px-4 pt-2">
        <button
          onClick={() => void share()}
          disabled={sharing}
          className={cx(
            'mb-3 flex h-12 flex-1 items-center justify-center gap-2 rounded-[6px] text-[17px] font-semibold active:opacity-70 disabled:opacity-50',
            onAccent ? 'bg-accent-ink text-accent' : 'bg-bg text-text',
          )}
        >
          <Icon name="share" size={18} /> Deel deze kaart
        </button>
        {last && (
          <button
            onClick={() => setI(0)}
            className="mb-3 flex h-12 items-center justify-center gap-2 rounded-[6px] border border-current px-4 text-[17px] font-semibold active:opacity-70"
          >
            <Icon name="replay" size={18} /> Opnieuw
          </button>
        )}
      </div>
    </div>
  )
}
