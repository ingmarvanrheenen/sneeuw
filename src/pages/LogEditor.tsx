import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Chip, Field, Page, PageHeader, Section, Stepper, cx, inputCls } from '../components/ui'
import { Icon, Mood, MOOD_LABELS } from '../design/icons'
import { ResortPicker, TrickPicker } from '../components/Pickers'
import { MediaAddButton, MediaGrid } from '../components/Media'
import { remove, useKind, useRecord } from '../lib/repo'
import { db } from '../lib/db'
import { uid } from '../lib/ids'
import { PAINS, PISTES, SNOW, WEATHER } from '../content/logOptions'
import { TRICK_BY_ID } from '../content/tricks'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import { cachedCrews, myCrews, type Crew } from '../lib/crew'
import { EMPTY_DRAFT, saveSession, smartDraft, type SessionDraft } from '../lib/sessions'
import type { MediaMeta, PisteColor } from '../lib/types'

type Draft = SessionDraft

export default function LogEditor() {
  const { id: editId } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const existing = useRecord('session', editId)
  const trips = useKind('trip')
  const [id] = useState(() => editId ?? uid())
  const [d, setD] = useState<Draft>(EMPTY_DRAFT)
  const [loaded, setLoaded] = useState(false)
  const [resortOpen, setResortOpen] = useState(false)
  const [pickPracticed, setPickPracticed] = useState(false)
  const [pickLanded, setPickLanded] = useState(false)
  const [buddy, setBuddy] = useState('')
  const [crews, setCrews] = useState<Crew[]>([])
  const [saving, setSaving] = useState(false)
  const { user } = authStore.use()

  useEffect(() => {
    if (editId && existing && !loaded) {
      const { id: _i, userId: _u, createdAt: _c, updatedAt: _up, kind: _k, ...rest } = existing
      void [_i, _u, _c, _up, _k]
      setD({ ...EMPTY_DRAFT, ...rest })
      setLoaded(true)
    }
  }, [editId, existing, loaded])

  // nieuwe dag: verder met wat je in het snelle scherm al had, anders slim voorinvullen
  useEffect(() => {
    if (editId) return
    const fromQuick = (location.state as { draft?: Draft } | null)?.draft
    if (fromQuick) {
      setD(fromQuick)
      setLoaded(true)
    } else
      void smartDraft().then((x) => {
        setD(x)
        setLoaded(true)
      })
  }, [editId, location.state])

  // crews: eerst de lokale lijst (werkt zonder bereik), daarna verversen als je online bent
  useEffect(() => {
    if (!hasBackend || !user) return
    let alive = true
    const apply = (list: Crew[]) => alive && setCrews(list)
    void cachedCrews().then(apply)
    if (navigator.onLine)
      myCrews()
        .then(apply)
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [user])

  // Actieve trip voorselecteren bij een nieuwe dag
  useEffect(() => {
    if (editId || !trips) return
    const t = trips.find((t) => t.startDate && t.startDate <= d.date && (t.endDate ?? t.startDate) >= d.date)
    if (t && !d.tripId)
      setD((x) => ({ ...x, tripId: t.id, resortName: x.resortName || t.resortName || '', resortId: x.resortId || t.resortId }))
  }, [trips, editId, d.date, d.tripId])

  const media = useLiveQuery(
    async () => (await db.records.where('sessionId').equals(id).toArray()).filter((r) => r.kind === 'media' && !r.deleted) as MediaMeta[],
    [id],
  )

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const toggleIn = <K extends 'pistes' | 'pains'>(k: K, v: string) =>
    setD((x) => {
      const arr = x[k] as string[]
      return { ...x, [k]: arr.includes(v) ? arr.filter((a) => a !== v) : [...arr, v] }
    })

  const landedSet = useMemo(() => new Set(d.landed), [d.landed])

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await saveSession({ id, draft: d, existing, media: media ?? [] })
      nav(`/log/${id}`, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  async function cancel() {
    if (!existing) for (const m of media ?? []) await remove(m) // geen weesbestanden
    nav(-1)
  }

  if (!loaded)
    return (
      <Page>
        <PageHeader title="Laden…" back />
      </Page>
    )

  return (
    <Page className="pb-36">
      <PageHeader
        title={d.resortName || 'Log je dag'}
        right={
          <button onClick={cancel} className="label h-9 px-2">
            Annuleer
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Datum">
          <input type="date" value={d.date} onChange={(e) => set('date', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Waar">
          <button type="button" onClick={() => setResortOpen(true)} className={cx(inputCls, 'flex items-center gap-2 text-left')}>
            <Icon name="pin" size={16} className="text-muted" />
            <span className={cx('truncate', !d.resortName && 'text-muted')}>{d.resortName || 'Kies…'}</span>
          </button>
        </Field>
      </div>
      {!!trips?.length && (
        <Field label="Trip">
          <select value={d.tripId ?? ''} onChange={(e) => set('tripId', e.target.value || undefined)} className={inputCls}>
            <option value="">Geen trip</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Section title="Hoe was het?">
        <div className="card flex justify-between p-2">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => set('mood', v)}
              className={cx(
                'flex flex-1 flex-col items-center gap-1 rounded-[6px] py-2 transition',
                d.mood === v ? 'bg-accent text-accent-ink' : 'text-muted',
              )}
            >
              <Mood value={v} size={28} />
              <span className="text-[10px] font-medium">{MOOD_LABELS[v - 1]}</span>
            </button>
          ))}
        </div>
        <input
          value={d.highlight ?? ''}
          onChange={(e) => set('highlight', e.target.value)}
          placeholder="Beste moment van de dag…"
          className={cx(inputCls, 'mt-2')}
        />
      </Section>

      <Section title="Op de piste">
        <div className="card grid grid-cols-2 divide-x divide-[var(--line)] p-0">
          <div className="flex flex-col items-center gap-2 p-3">
            <span className="label flex items-center gap-1">
              <Icon name="clock" size={12} /> Uren
            </span>
            <Stepper value={d.hours} onChange={(v) => set('hours', v)} step={0.5} max={12} />
          </div>
          <div className="flex flex-col items-center gap-2 p-3">
            <span className="label flex items-center gap-1">
              <Icon name="impact" size={12} /> Gevallen
            </span>
            <Stepper value={d.falls} onChange={(v) => set('falls', v)} max={200} />
          </div>
        </div>
        <div className="label mb-1.5 mt-4">Pistes</div>
        <div className="flex flex-wrap gap-2">
          {PISTES.map((p) => (
            <Chip key={p.id} active={d.pistes.includes(p.id)} onClick={() => toggleIn('pistes', p.id as PisteColor)}>
              <span className="size-2.5 rounded-full ring-1 ring-[var(--line)]" style={{ background: p.color }} />
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Sneeuw & weer">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {SNOW.map((s) => (
            <Chip key={s.id} active={d.snow === s.id} onClick={() => set('snow', d.snow === s.id ? undefined : s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          {WEATHER.map((w) => (
            <Chip key={w.id} active={d.weather === w.id} onClick={() => set('weather', d.weather === w.id ? undefined : w.id)}>
              <Icon name={w.icon} size={16} />
              {w.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Tricks">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPickPracticed(true)} className="card p-3 text-left">
            <div className="label">Geoefend</div>
            <div className="num mt-1 text-2xl font-semibold">{d.practiced.length}</div>
          </button>
          <button type="button" onClick={() => setPickLanded(true)} className="card border-accent p-3 text-left">
            <div className="label !text-accent-text">Geland</div>
            <div className="num mt-1 text-2xl font-semibold">{d.landed.length}</div>
          </button>
        </div>
        {(d.practiced.length > 0 || d.landed.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...new Set([...d.landed, ...d.practiced])].map((tid) => (
              <span
                key={tid}
                className={cx('rounded-full px-2.5 py-1 text-xs', landedSet.has(tid) ? 'bg-accent text-accent-ink' : 'bg-surface-2')}
              >
                {TRICK_BY_ID.get(tid)?.name ?? tid}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Pijntjes">
        <div className="flex flex-wrap gap-2">
          {PAINS.map((p) => (
            <Chip key={p} active={d.pains.includes(p)} onClick={() => toggleIn('pains', p)}>
              {p}
            </Chip>
          ))}
        </div>
        {d.pains.length > 0 && (
          <input
            value={d.painNote ?? ''}
            onChange={(e) => set('painNote', e.target.value)}
            placeholder="Wat is er gebeurd?"
            className={cx(inputCls, 'mt-2')}
          />
        )}
      </Section>

      <Section title="Met wie">
        <div className="flex gap-2">
          <input
            value={buddy}
            onChange={(e) => setBuddy(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && buddy.trim()) {
                e.preventDefault()
                set('buddies', [...d.buddies, buddy.trim()])
                setBuddy('')
              }
            }}
            placeholder="Naam + enter"
            className={inputCls}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (!buddy.trim()) return
              set('buddies', [...d.buddies, buddy.trim()])
              setBuddy('')
            }}
          >
            <Icon name="plus" size={18} />
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.buddies.map((b) => (
            <button
              key={b}
              onClick={() =>
                set(
                  'buddies',
                  d.buddies.filter((x) => x !== b),
                )
              }
              className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm"
            >
              {b} <Icon name="close" size={12} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="Foto's & video's">
        <MediaGrid items={media ?? []} editable />
        <div className="mt-2">
          <MediaAddButton link={{ sessionId: id, crewId: d.crewId ?? null }} />
        </div>
      </Section>

      <Section title="Notities">
        <textarea
          value={d.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          rows={4}
          placeholder="Wat ging goed, wat moet beter, wat zei je trainer…"
          className={inputCls}
        />
      </Section>

      {crews.length > 0 && (
        <Section title="Delen">
          <div className="flex flex-wrap gap-2">
            <Chip active={!d.crewId} onClick={() => set('crewId', null)}>
              <Icon name="device" size={14} /> Privé
            </Chip>
            {crews.map((c) => (
              <Chip key={c.id} active={d.crewId === c.id} onClick={() => set('crewId', c.id)}>
                <Icon name="crew" size={14} /> {c.name}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t hairline bg-bg/90 px-4 pt-3 backdrop-blur-md">
        <div className="mx-auto max-w-xl">
          <Button size="lg" className="w-full" onClick={save} disabled={saving} icon={<Icon name="check" size={20} />}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </div>
      </div>

      <ResortPicker
        open={resortOpen}
        onClose={() => setResortOpen(false)}
        onPick={(r) => {
          setD((x) => ({ ...x, resortId: r.id, resortName: r.name, snow: x.snow ?? (r.resort?.indoor ? 'indoor' : x.snow) }))
          setResortOpen(false)
        }}
      />
      <TrickPicker
        open={pickPracticed}
        onClose={() => setPickPracticed(false)}
        selected={d.practiced}
        onChange={(v) => set('practiced', v)}
        title="Wat heb je geoefend?"
      />
      <TrickPicker
        open={pickLanded}
        onClose={() => setPickLanded(false)}
        selected={d.landed}
        onChange={(v) => set('landed', v)}
        title="Wat heb je geland?"
      />
    </Page>
  )
}
