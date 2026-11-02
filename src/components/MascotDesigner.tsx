// Mascotte-ontwerper: je eigen Episch-sticker. Kleuren, goggles, wat er op je hoofd zit en je lach.
import type { CSSProperties } from 'react'
import { Button, Chip, Sheet, cx } from './ui'
import { MascotSticker } from '../design/Mascot'
import { Icon } from '../design/icons'
import { checkMascot, FACES, GOGGLES, HEADS, MOUTHS, randomMascot, STARS, type Mascot } from '../lib/mascot'

function Swatches({
  label,
  options,
  value,
  onPick,
  not,
}: {
  label: string
  options: { id: string; name: string; hex: string }[]
  value: string
  onPick: (id: string) => void
  not?: string
}) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-2 text-[15px] font-medium">{label}</div>
      <div className="flex flex-wrap gap-2.5">
        {options.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.name}
            aria-pressed={value === c.id}
            disabled={not === c.id}
            onClick={() => onPick(c.id)}
            className={cx(
              'size-10 rounded-full border hairline transition-transform duration-150 active:scale-95 disabled:opacity-25',
              value === c.id && 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--bg)]',
            )}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>
    </div>
  )
}

function Chips({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: { id: string; name: string }[]
  value: string
  onPick: (id: string) => void
}) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-2 text-[15px] font-medium">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.id} active={value === o.id} onClick={() => onPick(o.id)}>
            {o.name}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export function MascotDesigner({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean
  onClose: () => void
  value: unknown
  onChange: (m: Mascot | undefined) => void
}) {
  const m = checkMascot(value)
  const set = (patch: Partial<Mascot>) => onChange({ ...m, ...patch })
  return (
    <Sheet open={open} onClose={onClose} title="Je mascotte">
      <div className="grid place-items-center rounded-[6px] bg-block py-5">
        {/* key: bij elke wijziging klapt hij opnieuw op de pas */}
        <span key={JSON.stringify(m)} className="slap block" style={{ '--tilt': '-6deg', '--delay': '0ms' } as CSSProperties}>
          <MascotSticker mascot={m} size={150} label="Je mascotte" />
        </span>
      </div>
      <p className="mb-4 mt-2 text-center text-[13px] text-muted">
        {value ? 'Staat op je skipas (zonder foto) en onder je deelkaarten.' : 'De standaard. Pas hem aan, dan is hij van jou.'}
      </p>

      <div className="space-y-5">
        <Swatches
          label="Gezicht"
          options={FACES}
          value={m.face}
          onPick={(face) => set({ face: face as Mascot['face'], ster: face === m.ster ? STARS.find((s) => s.id !== face)!.id : m.ster })}
        />
        <Swatches label="Ster" options={STARS} value={m.ster} not={m.face} onPick={(ster) => set({ ster: ster as Mascot['ster'] })} />
        <Swatches
          label="Goggles"
          options={GOGGLES}
          value={m.goggles}
          onPick={(goggles) => set({ goggles: goggles as Mascot['goggles'] })}
        />
        <Chips label="Op je hoofd" options={HEADS} value={m.hoofd} onPick={(hoofd) => set({ hoofd: hoofd as Mascot['hoofd'] })} />
        <Chips label="Lach" options={MOUTHS} value={m.mond} onPick={(mond) => set({ mond: mond as Mascot['mond'] })} />
      </div>

      <div className="mb-6 mt-6 flex gap-2">
        <Button variant="ghost" className="flex-1" icon={<Icon name="sparkle" size={18} />} onClick={() => onChange(randomMascot())}>
          Verras me
        </Button>
        <Button variant="ghost" className="flex-1" disabled={!value} onClick={() => onChange(undefined)}>
          Standaard
        </Button>
      </div>
    </Sheet>
  )
}
