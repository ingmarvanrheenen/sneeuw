import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Chip, List, Page, PageHeader, Row, Segmented, cx, inputCls, LevelDots } from '../components/ui'
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
      <div className="mb-4 mt-5 flex items-baseline justify-between gap-3">
        <p className="text-[15px] text-muted">{meta.blurb}</p>
        <span className="num shrink-0 text-[15px] text-muted">
          <span className="font-semibold text-accent-text">{done}</span> van {items.length} geland
        </span>
      </div>
      {[1, 2, 3, 4, 5].map((lvl) => {
        const group = items.filter((t) => t.level === lvl)
        if (!group.length) return null
        return (
          <section key={lvl} className="mb-6">
            <h3 className="mb-2 flex items-center gap-2 pl-1 text-[13px] font-semibold text-muted">
              Niveau {lvl} <LevelDots level={lvl} />
            </h3>
            <List>
              {group.map((t) => {
                const st = status.get(t.id)
                const external = t.prereqs.filter((p) => TRICK_BY_ID.get(p)?.track !== track)
                return (
                  <Row
                    key={t.id}
                    to={`/tricks/${t.id}`}
                    icon={<StatusDot status={st} />}
                    title={t.name}
                    detail={external.length ? `na ${external.map((p) => TRICK_BY_ID.get(p)?.name).join(', ')}` : t.summary}
                    value={st ? STATUS_LABEL[st] : undefined}
                  />
                )
              })}
            </List>
          </section>
        )
      })}
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
      <List className="mt-2">
        <Row icon="vault" title="Je kluis" detail="Alle gelande tricks met je clips" to="/kluis" />
      </List>
    </Page>
  )
}
