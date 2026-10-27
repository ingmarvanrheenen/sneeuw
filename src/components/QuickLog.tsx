// Snel een dag loggen: alles staat al ingevuld, één tik op Opslaan en klaar.
// Gemaakt voor op de berg: grote knoppen, geen typen, werkt offline.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, List, Sheet, Stepper, Toggle, cx } from './ui'
import { ResortPicker } from './Pickers'
import { Icon, Mood, MOOD_LABELS } from '../design/icons'
import { useKind } from '../lib/repo'
import { uid } from '../lib/ids'
import { fmtDate } from '../lib/format'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'
import { cachedCrews, type Crew } from '../lib/crew'
import { saveSession, smartDraft, type SessionDraft } from '../lib/sessions'
import { TRICK_BY_ID } from '../content/tricks'

export function QuickLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { user } = authStore.use()
  const trickRows = useKind('trick')
  const [d, setD] = useState<SessionDraft | null>(null)
  const [crews, setCrews] = useState<Crew[]>([])
  const [resortOpen, setResortOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setD(null)
    void smartDraft().then(setD)
    if (hasBackend && user) void cachedCrews().then(setCrews)
  }, [open, user])

  // tricks waar je mee bezig bent: één tik = vandaag geland
  const working = useMemo(
    () =>
      (trickRows ?? [])
        .filter((r) => r.status === 'bezig')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8)
        .map((r) => r.trickId)
        .filter((id) => TRICK_BY_ID.has(id)),
    [trickRows],
  )

  if (!open) return null
  const set = <K extends keyof SessionDraft>(k: K, v: SessionDraft[K]) => setD((x) => (x ? { ...x, [k]: v } : x))
  const shareCrew = crews.find((c) => c.id === d?.crewId) ?? crews[0]

  async function save() {
    if (!d || saving) return
    setSaving(true)
    try {
      await saveSession({ id: uid(), draft: d })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Log je dag" closeLabel="Annuleer">
      {!d ? (
        <div className="h-[60dvh]" />
      ) : (
        <div className="pb-4">
          <List>
            <button
              onClick={() => setResortOpen(true)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
            >
              <Icon name="pin" size={20} className="shrink-0 text-accent-text" />
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-[17px] font-semibold', !d.resortName && 'text-muted')}>
                  {d.resortName || 'Waar was je?'}
                </span>
                <span className="block text-[13px] text-muted">{fmtDate(d.date, true)}</span>
              </span>
              <Icon name="chevron" size={16} className="shrink-0 text-muted" />
            </button>
          </List>

          <div className="mt-5 text-[15px] font-semibold">Hoe was het?</div>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={d.mood === v}
                onClick={() => set('mood', v)}
                className={cx(
                  'flex h-[72px] flex-col items-center justify-center gap-1 rounded-[14px] transition-colors duration-150',
                  d.mood === v ? 'bg-accent text-accent-ink' : 'bg-surface text-muted',
                )}
              >
                <Mood value={v} size={30} />
                <span className="text-[11px] font-medium">{MOOD_LABELS[v - 1]}</span>
              </button>
            ))}
          </div>

          <List className="mt-5">
            <div className="flex items-center justify-between py-1.5 pl-4 pr-2">
              <span className="text-[17px]">Uren</span>
              <Stepper value={d.hours} onChange={(v) => set('hours', v)} min={0.5} max={12} step={0.5} />
            </div>
            <div className="flex items-center justify-between py-1.5 pl-4 pr-2">
              <span className="text-[17px]">Gevallen</span>
              <Stepper value={d.falls} onChange={(v) => set('falls', v)} max={200} />
            </div>
          </List>

          {working.length > 0 && (
            <>
              <div className="mt-5 text-[15px] font-semibold">Vandaag geland?</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {working.map((tid) => (
                  <Chip
                    key={tid}
                    active={d.landed.includes(tid)}
                    onClick={() => set('landed', d.landed.includes(tid) ? d.landed.filter((x) => x !== tid) : [...d.landed, tid])}
                  >
                    {d.landed.includes(tid) && <Icon name="check" size={14} stroke={2.4} />}
                    {TRICK_BY_ID.get(tid)?.name}
                  </Chip>
                ))}
              </div>
            </>
          )}

          {shareCrew && (
            <List className="mt-5">
              <Toggle
                on={!!d.crewId}
                onChange={(on) => set('crewId', on ? shareCrew.id : null)}
                label={`Delen met ${shareCrew.name}`}
                sub="Je crew ziet je dag in de feed"
              />
            </List>
          )}

          <Button size="lg" className="mt-6 w-full" onClick={save} disabled={saving} icon={<Icon name="check" size={20} stroke={2.2} />}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </Button>
          <button
            onClick={() => {
              onClose()
              nav('/log/nieuw', { state: { draft: d } })
            }}
            className="mt-1 w-full py-3 text-[15px] font-medium text-accent-text"
          >
            Meer invullen: foto's, pistes, pijntjes
          </button>
        </div>
      )}

      <ResortPicker
        open={resortOpen}
        onClose={() => setResortOpen(false)}
        onPick={(r) => {
          setD((x) => (x ? { ...x, resortId: r.id, resortName: r.name, snow: x.snow ?? (r.resort?.indoor ? 'indoor' : x.snow) } : x))
          setResortOpen(false)
        }}
      />
    </Sheet>
  )
}
