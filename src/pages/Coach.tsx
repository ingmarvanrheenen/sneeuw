import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Empty, List, Page, PageHeader, Row, Section, Sheet, cx } from '../components/ui'
import { ActionCard, MemorySheet, Rich, TechniqueSheet, type TechniquePick } from '../components/CoachParts'
import { Icon, Spinner } from '../design/icons'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import {
  addMemory,
  applyAction,
  buildContext,
  CoachError,
  deleteConversation,
  imageSrc,
  listConversations,
  listMemory,
  newConversation,
  removeMemory,
  saveConversation,
  streamCoach,
  type CoachAction,
  type CoachImage,
  type CoachMessage,
  type Conversation,
  type MemoryItem,
} from '../lib/coach'
import { TRICK_BY_ID } from '../content/tricks'
import { db } from '../lib/db'
import type { Session } from '../lib/types'
import { sfx } from '../lib/sounds'
import { toast } from '../lib/toast'

const STARTERS = [
  'Maak een oefenplan voor mijn trip',
  'Waarom val ik steeds op mijn toeside?',
  'Wat moet ik als volgende trick leren?',
  'Welke boardlengte past bij mij?',
  'Hoe overleef ik een sleeplift?',
  'Wat neem ik mee voor mijn eerste keer in de Alpen?',
]

/** Vraag die bij een techniek-check hoort. */
export function techniqueQuestion(trickId: string | null, at?: number, extra?: string) {
  const trick = trickId ? TRICK_BY_ID.get(trickId)?.name : undefined
  const what = trick ? `mijn ${trick}` : 'mijn techniek'
  const frame = at != null ? ` Dit is een frame uit een video, op ${at.toFixed(1).replace('.', ',')} s.` : ''
  return `Techniek-check: kijk naar ${what}.${frame} Wat zie je en wat moet ik anders doen?${extra ? `\n\n${extra}` : ''}`
}

export default function Coach() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { user } = authStore.use()
  const [conv, setConv] = useState<Conversation | null>(null)
  const [history, setHistory] = useState<Conversation[]>([])
  const [memory, setMemory] = useState<MemoryItem[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'history' | 'memory' | 'check' | null>(null)
  const [check, setCheck] = useState<{ mediaId?: string | null; trickId?: string | null }>({})
  const bottom = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    void (async () => {
      setHistory(await listConversations())
      setMemory(await listMemory())
      setConv(newConversation(await buildContext()))
      // Voorinvullen vanuit een trick, een dag of een clip
      const trick = params.get('trick')
      const dag = params.get('dag')
      const media = params.get('media')
      const checkTrick = params.get('check')
      if (trick) setInput(`Hoe leer ik de ${TRICK_BY_ID.get(trick)?.name ?? trick}? Wat is voor mij de beste aanpak?`)
      if (dag) {
        const s = (await db.records.get(dag)) as Session | undefined
        if (s) setInput(`Kijk naar mijn dag op ${s.date} in ${s.resortName}. Wat ging goed en waar moet ik de volgende keer op letten?`)
      }
      if (media || checkTrick) {
        setCheck({ mediaId: media, trickId: checkTrick })
        setSheet('check')
      }
    })()
  }, [params])

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [conv?.messages.length, conv?.messages.at(-1)?.content.length, conv?.messages.at(-1)?.actions?.length])

  async function startNew() {
    setError(null)
    setConv(newConversation(await buildContext()))
  }

  async function send(text: string, image?: CoachImage) {
    if (!conv || (!text.trim() && !image) || busy) return
    sfx.tap()
    setError(null)
    const userMsg: CoachMessage = { role: 'user', content: text.trim(), ...(image ? { image } : {}) }
    let current: Conversation = {
      ...conv,
      title: conv.messages.length ? conv.title : (image ? 'Techniek-check' : text.trim()).slice(0, 48),
      messages: [...conv.messages, userMsg],
    }
    let answer: CoachMessage = { role: 'assistant', content: '', actions: [], applied: [] }
    const show = () => setConv({ ...current, messages: [...current.messages, answer] })
    show()
    setInput('')
    setBusy(true)
    abort.current = new AbortController()
    try {
      await streamCoach(
        current,
        {
          onText: (chunk) => {
            answer = { ...answer, content: answer.content + chunk }
            show()
          },
          onAction: (a) => {
            const actions = [...(answer.actions ?? []), a]
            // onthouden gebeurt meteen; het staat in "Wat de coach van je weet" en is daar te wissen
            if (a.kind === 'onthoud') void addMemory(a.feit).then(setMemory)
            answer = {
              ...answer,
              actions,
              applied: a.kind === 'onthoud' ? [...(answer.applied ?? []), actions.length - 1] : answer.applied,
            }
            show()
          },
        },
        abort.current.signal,
      )
      current = { ...current, messages: [...current.messages, answer] }
      setConv(current)
      await saveConversation(current)
      setHistory(await listConversations())
    } catch (e) {
      // wat er al binnen was blijft staan
      if (answer.content || answer.actions?.length) current = { ...current, messages: [...current.messages, answer] }
      setConv(current)
      if ((e as Error).name !== 'AbortError') setError(e instanceof CoachError ? e.message : 'Verbinding mislukt. Probeer het nog eens.')
    } finally {
      setBusy(false)
    }
  }

  async function apply(msgIndex: number, actionIndex: number, a: CoachAction) {
    if (!conv) return
    const n = await applyAction(a)
    sfx.tap()
    toast({ title: n === 1 ? 'Doel gezet' : `${n} doelen gezet`, body: 'Staat bij je doelen.', tone: 'success' })
    const messages = conv.messages.map((m, i) => (i === msgIndex ? { ...m, applied: [...(m.applied ?? []), actionIndex] } : m))
    const next = { ...conv, messages }
    setConv(next)
    await saveConversation(next)
  }

  function onCheck(p: TechniquePick) {
    setSheet(null)
    void send(techniqueQuestion(p.trickId, p.at, input.trim() || undefined), p.image)
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
                  aria-label="Eerdere gesprekken"
                  onClick={() => setSheet('history')}
                  className="grid size-9 place-items-center rounded-full border hairline"
                >
                  <Icon name="clock" size={16} />
                </button>
                <button
                  aria-label="Nieuw gesprek"
                  onClick={() => void startNew()}
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
        ) : !conv ? (
          <div className="grid place-items-center py-16 text-muted">
            <Spinner size={20} />
          </div>
        ) : !conv.messages.length ? (
          <>
            <Section title="Techniek-check" className="mt-0">
              <List>
                <Row
                  icon="camera"
                  title="Laat de coach meekijken"
                  detail="Foto of video: wat hij ziet en wat beter kan"
                  onClick={() => {
                    setCheck({})
                    setSheet('check')
                  }}
                />
              </List>
            </Section>
            <Section title="Vraag maar raak">
              <List>
                {STARTERS.map((s) => (
                  <Row key={s} title={<span className="block whitespace-normal">{s}</span>} onClick={() => void send(s)} />
                ))}
              </List>
            </Section>
            <Section title="Wat de coach van je weet">
              <List>
                <Row
                  icon="sparkle"
                  title="Geheugen"
                  detail={memory.length ? memory[0].text : 'Wat je vertelt over blessures, je board of je doelen'}
                  value={memory.length || undefined}
                  onClick={() => setSheet('memory')}
                />
              </List>
            </Section>
            <p className="mt-6 text-center text-[13px] text-muted">AI kan fouten maken. Bij pijn of twijfel: check bij een pro.</p>
          </>
        ) : (
          <div className="space-y-3">
            {conv.messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ml-10 overflow-hidden rounded-[8px] rounded-br-sm bg-accent text-[15px] text-accent-ink">
                  {m.image && <img src={imageSrc(m.image)} alt="Jouw foto voor de coach" className="max-h-64 w-full object-cover" />}
                  {m.content && <div className="whitespace-pre-line px-4 py-2.5">{m.content}</div>}
                </div>
              ) : (
                <div key={i} className="mr-6 space-y-2">
                  {(m.content || !m.actions?.length) && (
                    <div className="rounded-[8px] rounded-bl-sm border hairline bg-surface px-4 py-2.5 text-[15px] leading-relaxed">
                      {m.content ? <Rich text={m.content} /> : <Spinner size={16} />}
                    </div>
                  )}
                  {m.actions?.map((a, j) => (
                    <ActionCard key={j} action={a} applied={!!m.applied?.includes(j)} onApply={() => void apply(i, j, a)} />
                  ))}
                </div>
              ),
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-[8px] border border-danger/40 px-4 py-3 text-sm text-danger">
                <Icon name="alert" size={16} /> {error}
              </div>
            )}
          </div>
        )}
        <div ref={bottom} />
      </Page>

      {ready && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t hairline bg-bg/90 px-4 py-3 backdrop-blur-md">
          <form
            className="mx-auto flex max-w-xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <button
              type="button"
              aria-label="Techniek-check met foto of video"
              disabled={busy}
              onClick={() => {
                setCheck({})
                setSheet('check')
              }}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 text-text disabled:opacity-40"
            >
              <Icon name="camera" size={20} />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={Math.min(4, Math.max(1, input.split('\n').length))}
              placeholder="Vraag Coach Daddy…"
              aria-label="Bericht aan de coach"
              className="max-h-32 min-w-0 flex-1 resize-none rounded-3xl border hairline bg-surface px-4 py-3 text-base outline-none focus:border-accent"
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
        </div>
      )}

      <TechniqueSheet
        open={sheet === 'check'}
        onClose={() => setSheet(null)}
        onPick={onCheck}
        mediaId={check.mediaId}
        trickId={check.trickId}
      />

      <MemorySheet
        open={sheet === 'memory'}
        onClose={() => setSheet(null)}
        items={memory}
        onRemove={async (id) => setMemory(await removeMemory(id))}
      />

      <Sheet open={sheet === 'history'} onClose={() => setSheet(null)} title="Eerdere gesprekken">
        {!history.length ? (
          <p className="pb-6 text-[15px] text-muted">Nog geen gesprekken.</p>
        ) : (
          <List className="mb-6">
            {history.map((c) => (
              <div key={c.id} className="flex items-center">
                <Row
                  className="flex-1"
                  title={c.title}
                  detail={`${new Date(c.createdAt).toLocaleDateString('nl-NL')} · ${c.messages.length} berichten`}
                  chevron={false}
                  onClick={() => {
                    setConv(c)
                    setError(null)
                    setSheet(null)
                  }}
                />
                <button
                  aria-label={`Verwijder ${c.title}`}
                  onClick={async () => {
                    await deleteConversation(c.id)
                    setHistory(await listConversations())
                  }}
                  className="grid size-11 shrink-0 place-items-center text-muted active:opacity-60"
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
          </List>
        )}
      </Sheet>
    </div>
  )
}
