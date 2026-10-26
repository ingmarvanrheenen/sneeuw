import { Icon, type IconName } from './icons'

/** Badge-medaille: zeshoek met icoon en optioneel een cijfer. Op slot = gestippeld en gedimd. */
export function Medal({ icon, mark, unlocked, size = 64 }: { icon: IconName; mark?: string; unlocked: boolean; size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <path
          d="M32 3 57 17.5v29L32 61 7 46.5v-29z"
          fill={unlocked ? 'var(--accent-soft)' : 'transparent'}
          stroke={unlocked ? 'var(--accent-text)' : 'var(--line)'}
          strokeWidth={2}
          strokeDasharray={unlocked ? undefined : '4 4'}
        />
        {unlocked && (
          <path d="M32 9 52 20.5v23L32 55 12 43.5v-23z" fill="none" stroke="var(--accent-text)" strokeOpacity={0.35} strokeWidth={1} />
        )}
      </svg>
      <div className={`absolute inset-0 grid place-items-center ${unlocked ? 'text-accent-text' : 'text-muted/50'}`}>
        <div className="flex flex-col items-center">
          <Icon name={icon} size={size * 0.36} />
          {mark && <span className="num -mt-0.5 text-[10px] font-bold leading-none">{mark}</span>}
        </div>
      </div>
    </div>
  )
}
