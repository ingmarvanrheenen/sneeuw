import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Empty, Page, PageHeader, Sheet, cx } from '../components/ui'
import { Icon, Spinner } from '../design/icons'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import {
  buildContext,
  CoachError,
  deleteConversation,
  listConversations,
  newConversation,
  saveConversation,
  streamCoach,
  type Conversation,
} from '../lib/coach'
import { TRICK_BY_ID } from '../content/tricks'
import { db } from '../lib/db'
import type { Session } from '../lib/types'
import { sfx } from '../lib/sounds'

const STARTERS = [
  'Maak een oefenplan voor mijn trip',
  'Waarom val ik steeds op mijn toeside?',
  'Wat moet ik als volgende trick leren?',
  'Welke boardlengte past bij mij?',
  'Hoe overleef ik een sleeplift?',
  'Wat neem ik mee voor mijn eerste keer in de Alpen?',
]

/** Piepkleine markdown: **vet**, lijstjes en alinea's. Genoeg voor chat. */
function Rich({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l)))
          return (
            <ul key={i} className="my-1.5 space-y-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[7px] size-1.5 shrink-0 bg-accent-text" />
                  <span>{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ''))}</span>
                </li>
              ))}
            </ul>
          )
        if (/^#{1,3}\s/.test(b))
          return (
            <div key={i} className="mt-2 font-semibold">
              {inline(b.replace(/^#{1,3}\s/, ''))}
            </div>
          )
        return (
          <p key={i} className="my-1.5">
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}

export default function Coach() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { user } = authStore.use()
  const [conv, setConv] = useState<Conversation | null>(null)
  const [history, setHistory] = useState<Conversation[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    void (async () => {
      setHistory(await listConversations())
      setConv(newConversation(await buildContext()))
      // Voorinvullen vanuit een trick of dag
      const trick = params.get('trick')
      const dag = params.get('dag')
      if (trick) setInput(`Hoe leer ik de ${TRICK_BY_ID.get(trick)?.name ?? trick}? Wat is voor mij de beste aanpak?`)
      if (dag) {
        const s = (await db.records.get(dag)) as Session | undefined
        if (s) setInput(`Kijk naar mijn dag op ${s.date} in ${s.resortName}. Wat ging goed en waar moet ik de volgende keer op letten?`)
      }
    })()
  }, [params])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conv?.messages.length, conv?.messages.at(-1)?.content.length])

  async function send(text: string) {
    if (!conv || !text.trim() || busy) return
    sfx.tap()
    setError(null)
    const userMsg = { role: 'user' as const, content: text.trim() }
    let current: Conversation = {
      ...conv,
      title: conv.messages.length ? conv.title : text.trim().slice(0, 48),
      messages: [...conv.messages, userMsg],
    }
    setConv({ ...current, messages: [...current.messages, { role: 'assistant', content: '' }] })
    setInput('')
    setBusy(true)
    abort.current = new AbortController()
    let answer = ''
    try {
      await streamCoach(
        current,
        (chunk) => {
          answer += chunk
          setConv({ ...current, messages: [...current.messages, { role: 'assistant', content: answer }] })
        },
        abort.current.signal,
      )
      current = { ...current, messages: [...current.messages, { role: 'assistant', content: answer }] }
      setConv(current)
      await saveConversation(current)
      setHistory(await listConversations())
    } catch (e) {
      setConv(current)
      if ((e as Error).name !== 'AbortError') setError(e instanceof CoachError ? e.message : 'Verbinding mislukt. Probeer het nog eens.')
    } finally {
      setBusy(false)
    }
  }

  const ready = hasBackend && !!user

  return (
    <div className="flex min-h-dvh flex-col">
      <Page className="flex-1 pb-40">
        <PageHeader
          subtitle="Kent je logboek, tricks en doelen"
          title="Coach Daddy"
          back
          right={
            ready && (
              <>
                <button
                  aria-label="Geschiedenis"
                  onClick={() => setShowHistory(true)}
                  className="grid size-9 place-items-center rounded-full border hairline"
                >
                  <Icon name="clock" size={16} />
                </button>
                <button
                  aria-label="Nieuw gesprek"
                  onClick={async () => setConv(newConversation(await buildContext()))}
                  className="grid size-9 place-items-center rounded-full border hairline"
                >
                  <Icon name="plus" size={16} />
                </button>
              </>
            )
          }
        />

        {!ready ? (
          <Empty
            icon={<Icon name="chat" size={40} className="text-accent-text" />}
            title={hasBackend ? 'Log in voor Coach Daddy' : 'Coach is nog niet gekoppeld'}
            body={
              hasBackend
                ? 'De coach kent je logboek, je tricks en je doelen, en geeft tips die bij jou passen.'
                : 'Coach Daddy draait via een Supabase Edge Function met jouw Anthropic API-key. Zie de README om hem aan te zetten.'
            }
            action={hasBackend ? <Button onClick={() => nav('/instellingen')}>Inloggen</Button> : undefined}
          />
        ) : !conv?.messages.length ? (
          <div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-2xl bg-accent text-accent-ink">
                  <Icon name="snowflake" size={24} />
                </div>
                <div>
                  <div className="font-semibold">Yo, ik ben je coach.</div>
                  <div className="text-sm text-muted">Ik ken je logboek, je tricks en je doelen. Vraag maar raak.</div>
                </div>
              </div>
            </div>
            <div className="label mb-2 mt-6">Probeer</div>
            <div className="card divide-y divide-[var(--line)] overflow-hidden">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-surface-2 text-sm"
                >
                  {s}
                  <Icon name="arrow" size={16} className="text-muted" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {conv.messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ml-10 rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-[15px] text-accent-ink">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="mr-6 rounded-2xl rounded-bl-sm border hairline bg-surface px-4 py-2.5 text-[15px] leading-relaxed">
                  {m.content ? <Rich text={m.content} /> : <Spinner size={16} />}
                </div>
              ),
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-2xl border border-danger/40 px-4 py-3 text-sm text-danger">
                <Icon name="alert" size={16} /> {error}
              </div>
            )}
          </div>
        )}
        <div ref={bottom} />
      </Page>

      {ready && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t hairline bg-bg/90 px-4 pt-3 backdrop-blur-md">
          <form
            className="mx-auto flex max-w-xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={Math.min(4, Math.max(1, input.split('\n').length))}
              placeholder="Vraag Coach Daddy…"
              className="max-h-32 flex-1 resize-none rounded-3xl border hairline bg-surface px-4 py-3 outline-none focus:border-accent"
            />
            {busy ? (
              <button
                type="button"
                aria-label="Stop"
                onClick={() => abort.current?.abort()}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2"
              >
                <Icon name="pause" size={18} />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Verstuur"
                disabled={!input.trim()}
                className={cx(
                  'grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink',
                  !input.trim() && 'opacity-40',
                )}
              >
                <Icon name="send" size={20} />
              </button>
            )}
          </form>
          <p className="label mx-auto mt-1.5 max-w-xl text-center !text-[9px]">
            AI kan fouten maken. Bij pijn of twijfel: check bij een pro.
          </p>
        </div>
      )}

      <Sheet open={showHistory} onClose={() => setShowHistory(false)} title="Eerdere gesprekken">
        {!history.length && <p className="pb-6 text-sm text-muted">Nog geen gesprekken.</p>}
        <div className="space-y-2 pb-6">
          {history.map((c) => (
            <div key={c.id} className="card flex items-center gap-2 p-3">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setConv(c)
                  setShowHistory(false)
                }}
              >
                <div className="truncate text-sm font-medium">{c.title}</div>
                <div className="label">
                  {new Date(c.createdAt).toLocaleDateString('nl-NL')} · {c.messages.length} berichten
                </div>
              </button>
              <button
                aria-label="Verwijderen"
                onClick={async () => {
                  await deleteConversation(c.id)
                  setHistory(await listConversations())
                }}
                className="grid size-9 place-items-center text-muted"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
