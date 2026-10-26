import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Chip, Page, PageHeader, Segmented, cx, inputCls, LevelDots } from '../components/ui'
import { Icon } from '../design/icons'
import { TRACKS, TRICKS, TRICK_BY_ID, type Track } from '../content/tricks'
import { TERMS, TERM_CATS, type TermCat } from '../content/terms'
import { useKind } from '../lib/repo'
import type { TrickStatus } from '../lib/types'

export function StatusDot({ status }: { status?: TrickStatus }) {
  const map: Record<TrickStatus, string> = {
    wil: 'border-muted',
    bezig: 'border-accent-text bg-[linear-gradient(90deg,var(--accent-text)_50%,transparent_50%)]',
    geland: 'border-accent bg-accent',
    beheerst: 'border-accent bg-accent ring-2 ring-accent/40 ring-offset-2 ring-offset-[var(--surface)]',
  }
  return <span className={cx('inline-block size-3.5 shrink-0 rounded-full border-2', status ? map[status] : 'border-line')} />
}

export const STATUS_LABEL: Record<TrickStatus, string> = { wil: 'Wil leren', bezig: 'Bezig', geland: 'Geland', beheerst: 'Beheerst' }

function SkillTree() {
  const [params, setParams] = useSearchParams()
  const track = (params.get('track') as Track) ?? 'basis'
  const progress = useKind('trick')
  const status = useMemo(() => new Map((progress ?? []).map((p) => [p.trickId, p.status])), [progress])
  const items = TRICKS.filter((t) => t.track === track).sort((a, b) => a.level - b.level)
  const done = items.filter((t) => ['geland', 'beheerst'].includes(status.get(t.id) ?? '')).length
  const meta = TRACKS.find((t) => t.id === track)!

  return (
    <>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TRACKS.map((t) => (
          <Chip key={t.id} active={t.id === track} onClick={() => setParams({ track: t.id }, { replace: true })}>
            {t.name}
          </Chip>
        ))}
      </div>
      <div className="mb-3 mt-4 flex items-end justify-between">
        <div>
          <div className="text-lg font-semibold">{meta.name}</div>
          <div className="text-sm text-muted">{meta.blurb}</div>
        </div>
        <div className="num text-sm text-muted">
          <span className="text-accent-text">{done}</span>/{items.length}
        </div>
      </div>
      <ol className="relative">
        {items.map((t, i) => {
          const st = status.get(t.id)
          const external = t.prereqs.filter((p) => TRICK_BY_ID.get(p)?.track !== track)
          return (
            <li key={t.id} className="relative pl-7">
              {i < items.length - 1 && <span className="absolute bottom-0 left-[6px] top-6 w-0.5 bg-line" />}
              <span className="absolute left-0 top-[22px]">
                <StatusDot status={st} />
              </span>
              <Link to={`/tricks/${t.id}`} className="card mb-2 block p-3.5 active:scale-[0.99]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t.name}</span>
                  <LevelDots level={t.level} />
                </div>
                <div className="mt-1 line-clamp-2 text-sm text-muted">{t.summary}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {st && <span className="label rounded-full bg-accent-soft px-2 py-0.5 !text-accent-text">{STATUS_LABEL[st]}</span>}
                  {external.map((p) => (
                    <span key={p} className="label rounded-full border hairline px-2 py-0.5">
                      na {TRICK_BY_ID.get(p)?.name}
                    </span>
                  ))}
                  {t.anim && (
                    <span className="label flex items-center gap-1 px-1 py-0.5">
                      <Icon name="play" size={10} /> animatie
                    </span>
                  )}
                </div>
              </Link>
            </li>
          )
        })}
      </ol>
    </>
  )
}

function Dictionary() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<TermCat | 'alle'>('alle')
  const [open, setOpen] = useState<string | null>(null)
  const s = q.trim().toLowerCase()
  const terms = TERMS.filter(
    (t) => (cat === 'alle' || t.cat === cat) && (!s || t.term.toLowerCase().includes(s) || t.def.toLowerCase().includes(s)),
  )
  const tricks = s ? TRICKS.filter((t) => t.name.toLowerCase().includes(s) || t.aka?.some((a) => a.toLowerCase().includes(s))) : []
  return (
    <>
      <div className="relative">
        <Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Zoek in ${TERMS.length} termen en ${TRICKS.length} tricks…`}
          className={cx(inputCls, 'pl-10')}
        />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={cat === 'alle'} onClick={() => setCat('alle')}>
          Alles
        </Chip>
        {TERM_CATS.map((c) => (
          <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>
      {tricks.length > 0 && (
        <div className="mt-4">
          <div className="label mb-2">Tricks</div>
          <div className="space-y-2">
            {tricks.map((t) => (
              <Link key={t.id} to={`/tricks/${t.id}`} className="card flex items-center justify-between p-3">
                <span className="text-sm font-medium">{t.name}</span>
                <Icon name="chevron" size={16} className="text-muted" />
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="card mt-4 divide-y divide-[var(--line)] overflow-hidden p-0">
        {terms.map((t) => (
          <div key={t.id}>
            <button
              onClick={() => setOpen(open === t.id ? null : t.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="font-medium">{t.term}</span>
              <span className="label">{TERM_CATS.find((c) => c.id === t.cat)?.name}</span>
            </button>
            {open === t.id && (
              <div className="pop-in px-4 pb-3 text-sm text-muted">
                {t.def}
                {t.trick && (
                  <Link to={`/tricks/${t.trick}`} className="mt-2 flex items-center gap-1 font-medium text-accent-text">
                    Bekijk uitleg + animatie <Icon name="arrow" size={14} />
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
        {!terms.length && <div className="p-4 text-sm text-muted">Niks gevonden.</div>}
      </div>
    </>
  )
}

export default function Tricks() {
  const nav = useNavigate()
  const [tab, setTab] = useState<'tree' | 'dict'>('tree')
  return (
    <Page>
      <PageHeader
        kicker="02 / Trick-bijbel"
        title="Bijbel"
        right={
          <Button size="sm" variant="ghost" icon={<Icon name="quiz" size={16} />} onClick={() => nav('/quiz')}>
            Quiz
          </Button>
        }
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'tree', label: 'Skill tree' },
          { value: 'dict', label: 'Woordenboek' },
        ]}
      />
      <div className="mt-4">{tab === 'tree' ? <SkillTree /> : <Dictionary />}</div>
      <Card onClick={() => nav('/kluis')} className="mt-6 flex items-center gap-3">
        <Icon name="vault" size={26} className="text-accent-text" />
        <div className="flex-1">
          <div className="font-medium">Je kluis</div>
          <div className="text-sm text-muted">Alle gelande tricks met je video's</div>
        </div>
        <Icon name="chevron" size={18} className="text-muted" />
      </Card>
    </Page>
  )
}
