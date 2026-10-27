import { useEffect, useState } from 'react'
import { Button, Card, Empty, Field, Page, PageHeader, Section, Segmented, Sheet, Stepper, cx, inputCls } from '../components/ui'
import { Icon, type IconName } from '../design/icons'
import { create, remove, update, useKind } from '../lib/repo'
import { getProfile, saveProfile } from '../lib/auth'
import { updateSettings } from '../lib/settings'
import { toast } from '../lib/toast'
import type { Gear, GearKind, Profile } from '../lib/types'

const KINDS: { id: GearKind; label: string; icon: IconName }[] = [
  { id: 'board', label: 'Board', icon: 'board' },
  { id: 'binding', label: 'Binding', icon: 'link' },
  { id: 'boots', label: 'Boots', icon: 'mountain' },
  { id: 'helm', label: 'Helm', icon: 'user' },
  { id: 'goggle', label: 'Goggle', icon: 'sun' },
  { id: 'kleding', label: 'Kleding', icon: 'snowflake' },
  { id: 'protectie', label: 'Protectie', icon: 'bandage' },
  { id: 'overig', label: 'Overig', icon: 'more' },
]

/** Grove boardlengte-indicatie op basis van lengte en gewicht (vuistregel, geen wet). */
function boardAdvice(heightCm: number, weightKg: number, style: 'park' | 'allround' | 'poeder') {
  let base = heightCm * 0.88
  base += (weightKg - 70) * 0.35
  if (style === 'park') base -= 3
  if (style === 'poeder') base += 3
  return Math.round(base)
}

export default function GearPage() {
  const gear = useKind('gear')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [edit, setEdit] = useState<Partial<Gear> | null>(null)
  const [h, setH] = useState(180)
  const [w, setW] = useState(75)
  const [style, setStyle] = useState<'park' | 'allround' | 'poeder'>('allround')

  useEffect(() => {
    void getProfile().then((p) => setProfile({ angleFront: 15, angleBack: -15, stanceWidth: 52, ...p }))
  }, [])

  async function saveStance(p: Profile) {
    setProfile(p)
    await saveProfile(p)
    if (p.stance === 'goofy' || p.stance === 'regular') updateSettings({ goofy: p.stance === 'goofy' })
  }

  async function saveGear() {
    if (!edit?.name?.trim()) return
    if (edit.id) await update(edit as Gear, edit)
    else
      await create('gear', {
        gearKind: edit.gearKind ?? 'board',
        name: edit.name.trim(),
        brand: edit.brand,
        size: edit.size,
        owned: edit.owned ?? 'eigen',
        notes: edit.notes,
      })
    setEdit(null)
    toast({ title: 'Gear opgeslagen', icon: 'check' })
  }

  return (
    <Page>
      <PageHeader title="Gear & stance" back />

      {profile && (
        <Card>
          <div className="label">Stance</div>
          <div className="mt-2">
            <Segmented
              value={profile.stance ?? 'onbekend'}
              onChange={(v) => saveStance({ ...profile, stance: v })}
              options={[
                { value: 'regular', label: 'Regular' },
                { value: 'goofy', label: 'Goofy' },
                { value: 'onbekend', label: 'Nog niet' },
              ]}
            />
          </div>
          {/* Bovenaanzicht van je board met bindinghoeken */}
          <svg viewBox="0 0 300 110" className="mt-4 w-full" role="img" aria-label="Je bindinghoeken">
            <rect x="20" y="30" width="260" height="50" rx="25" fill="var(--surface-2)" stroke="var(--line)" />
            {[
              {
                x: profile.stance === 'goofy' ? 150 + (profile.stanceWidth ?? 52) : 150 - (profile.stanceWidth ?? 52),
                a: profile.angleFront ?? 15,
                label: 'voor',
              },
              {
                x: profile.stance === 'goofy' ? 150 - (profile.stanceWidth ?? 52) : 150 + (profile.stanceWidth ?? 52),
                a: profile.angleBack ?? -15,
                label: 'achter',
              },
            ].map((b) => (
              <g key={b.label} transform={`translate(${b.x} 55) rotate(${-b.a})`}>
                <rect x="-9" y="-24" width="18" height="48" rx="5" fill="var(--accent)" />
                <line x1="0" y1="-20" x2="0" y2="-12" stroke="var(--accent-ink)" strokeWidth="2" />
              </g>
            ))}
            <text x="150" y="104" textAnchor="middle" className="label" fill="var(--muted)" style={{ fontSize: 10 }}>
              {(profile.stanceWidth ?? 52) * 1} cm breed · {profile.angleFront}° / {profile.angleBack}°
            </text>
          </svg>
          <div className="mt-3 divide-y divide-[var(--line)]">
            {(
              [
                ['Voorste binding', 'angleFront', 15, -30, 45, 3, '°'],
                ['Achterste binding', 'angleBack', -15, -30, 30, 3, '°'],
                ['Stance-breedte', 'stanceWidth', 52, 40, 65, 1, ' cm'],
              ] as const
            ).map(([label, key, def, min, max, step, unit]) => (
              <div key={key} className="flex items-center justify-between gap-3 py-2">
                <span className="text-[15px]">{label}</span>
                <span className="flex items-center gap-2">
                  <span className="num w-14 text-right text-[17px] font-semibold">
                    {profile[key] ?? def}
                    {unit}
                  </span>
                  <span className="flex overflow-hidden rounded-[9px] bg-surface-2">
                    <button
                      type="button"
                      aria-label={`${label} lager`}
                      onClick={() => saveStance({ ...profile, [key]: Math.max(min, (profile[key] ?? def) - step) })}
                      className="grid h-8 w-11 place-items-center active:bg-line"
                    >
                      <Icon name="minus" size={16} />
                    </button>
                    <span className="my-1.5 w-px bg-line" />
                    <button
                      type="button"
                      aria-label={`${label} hoger`}
                      onClick={() => saveStance({ ...profile, [key]: Math.min(max, (profile[key] ?? def) + step) })}
                      className="grid h-8 w-11 place-items-center active:bg-line"
                    >
                      <Icon name="plus" size={16} />
                    </button>
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Beginners: +15 / −15 (duck) is een prima start. Fijn voor switch, en dat ga je willen.</p>
        </Card>
      )}

      <Section title="Boardlengte-check">
        <Card>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="label mb-1">Lengte cm</div>
              <Stepper value={h} onChange={setH} min={140} max={210} />
            </div>
            <div>
              <div className="label mb-1">Gewicht kg</div>
              <Stepper value={w} onChange={setW} min={40} max={130} />
            </div>
          </div>
          <div className="mt-3">
            <Segmented
              value={style}
              onChange={setStyle}
              options={[
                { value: 'park', label: 'Park' },
                { value: 'allround', label: 'Allround' },
                { value: 'poeder', label: 'Poeder' },
              ]}
            />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div className="text-sm text-muted">Ongeveer</div>
            <div className="num text-3xl font-semibold text-accent-text">
              {boardAdvice(h, w, style) - 2}–{boardAdvice(h, w, style) + 2}
              <span className="text-base text-muted"> cm</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">Vuistregel. Gewicht telt meer dan lengte. Schoenmaat 44+? Kijk naar een wide board.</p>
        </Card>
      </Section>

      <Section
        title="Je gear"
        action={
          <button
            onClick={() => setEdit({ gearKind: 'board', owned: 'eigen' })}
            className="label flex items-center gap-1 !text-accent-text"
          >
            <Icon name="plus" size={12} /> toevoegen
          </button>
        }
      >
        {!gear?.length ? (
          <Empty
            icon={<Icon name="board" size={36} className="text-muted" />}
            title="Nog geen gear"
            body="Houd bij wat je hebt, wat je huurt en wat op je wishlist staat."
          />
        ) : (
          <div className="card divide-y divide-[var(--line)] overflow-hidden">
            {gear.map((g) => {
              const k = KINDS.find((x) => x.id === g.gearKind)!
              return (
                <button
                  key={g.id}
                  onClick={() => setEdit(g)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                >
                  <Icon name={k.icon} size={22} className="text-accent-text" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {g.brand ? `${g.brand} ` : ''}
                      {g.name}
                    </div>
                    <div className="label">
                      {k.label}
                      {g.size ? ` · ${g.size}` : ''}
                    </div>
                  </div>
                  <span
                    className={cx(
                      'label rounded-full border px-2 py-0.5',
                      g.owned === 'wishlist' ? 'border-accent !text-accent-text' : 'hairline',
                    )}
                  >
                    {g.owned}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Section>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Gear bewerken' : 'Gear toevoegen'}>
        {edit && (
          <>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setEdit({ ...edit, gearKind: k.id })}
                  className={cx(
                    'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm',
                    edit.gearKind === k.id ? 'border-accent bg-accent text-accent-ink' : 'hairline',
                  )}
                >
                  <Icon name={k.icon} size={14} /> {k.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Merk">
                <input
                  value={edit.brand ?? ''}
                  onChange={(e) => setEdit({ ...edit, brand: e.target.value })}
                  className={inputCls}
                  placeholder="Burton"
                />
              </Field>
              <Field label="Maat">
                <input
                  value={edit.size ?? ''}
                  onChange={(e) => setEdit({ ...edit, size: e.target.value })}
                  className={inputCls}
                  placeholder="154"
                />
              </Field>
            </div>
            <Field label="Naam / model">
              <input
                value={edit.name ?? ''}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                className={inputCls}
                placeholder="Process Flying V"
              />
            </Field>
            <div className="mt-4">
              <Segmented
                value={edit.owned ?? 'eigen'}
                onChange={(v) => setEdit({ ...edit, owned: v })}
                options={[
                  { value: 'eigen', label: 'Eigen' },
                  { value: 'huur', label: 'Huur' },
                  { value: 'wishlist', label: 'Wishlist' },
                ]}
              />
            </div>
            <Field label="Notities">
              <textarea
                value={edit.notes ?? ''}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                rows={2}
                className={inputCls}
              />
            </Field>
            <div className="mb-4 mt-4 flex gap-2">
              {edit.id && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    await remove(edit as Gear)
                    setEdit(null)
                  }}
                >
                  <Icon name="trash" size={16} />
                </Button>
              )}
              <Button className="flex-1" disabled={!edit.name?.trim()} onClick={saveGear}>
                Opslaan
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </Page>
  )
}
