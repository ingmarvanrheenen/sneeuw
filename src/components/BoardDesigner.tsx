// Board-ontwerper: kies patroon en kleuren voor je board op je skipas, met je stickers er live op.
import { Button, Chip, Sheet, cx } from './ui'
import { StickerBoard } from './RiderParts'
import { Icon } from '../design/icons'
import { BOARD_COLORS, BOARD_PATTERNS } from '../content/boards'
import { checkDesign, randomDesign, type BoardDesign } from '../lib/boardDesign'

const START: BoardDesign = { pattern: 'strepen', base: 'nacht', accent: 'lime' }

function Swatches({ label, value, onPick, not }: { label: string; value: string; onPick: (id: string) => void; not?: string }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-2 text-[15px] font-medium">{label}</div>
      <div className="flex flex-wrap gap-2.5">
        {BOARD_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.name}
            aria-pressed={value === c.id}
            disabled={not === c.id}
            onClick={() => onPick(c.id)}
            className={cx(
              'grid size-10 place-items-center rounded-full border hairline transition-transform duration-150 active:scale-95 disabled:opacity-25',
              value === c.id && 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--bg)]',
            )}
            style={{ backgroundColor: c.hex }}
          >
            {value === c.id && <Icon name="check" size={16} className={c.dark ? 'text-white' : 'text-black'} />}
          </button>
        ))}
      </div>
    </div>
  )
}

export function BoardDesigner({
  open,
  onClose,
  value,
  onChange,
  landed,
}: {
  open: boolean
  onClose: () => void
  value: unknown
  onChange: (d: BoardDesign | undefined) => void
  landed: string[]
}) {
  const d = checkDesign(value)
  const cur = d ?? START
  const set = (patch: Partial<BoardDesign>) => onChange({ ...cur, ...patch })
  return (
    <Sheet open={open} onClose={onClose} title="Je board">
      <StickerBoard landed={landed} design={d ?? undefined} />
      <p className="mb-4 mt-2 text-center text-[13px] text-muted">
        {d ? 'Zo ziet je crew hem op je skipas.' : 'Standaard board. Kies een patroon om te beginnen.'}
      </p>

      <div className="mb-2 text-[15px] font-medium">Patroon</div>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {BOARD_PATTERNS.map((p) => (
          <Chip key={p.id} active={d?.pattern === p.id} onClick={() => set({ pattern: p.id })}>
            {p.name}
          </Chip>
        ))}
      </div>

      <div className="space-y-5">
        <Swatches
          label="Basiskleur"
          value={d?.base ?? ''}
          onPick={(base) => set({ base, accent: base === cur.accent ? cur.base : cur.accent })}
        />
        <Swatches label="Accentkleur" value={d?.accent ?? ''} not={cur.base} onPick={(accent) => set({ accent })} />
      </div>

      <div className="mb-6 mt-6 flex gap-2">
        <Button variant="ghost" className="flex-1" icon={<Icon name="sparkle" size={18} />} onClick={() => onChange(randomDesign())}>
          Verras me
        </Button>
        <Button variant="ghost" className="flex-1" disabled={!d} onClick={() => onChange(undefined)}>
          Standaard
        </Button>
      </div>
    </Sheet>
  )
}
