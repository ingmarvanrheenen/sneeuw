import { useState } from 'react'
import { Button, Card, Chip, Page, PageHeader, Progress, Section, Segmented, Stepper, LevelDots, CountryTag } from '../components/ui'
import { Icon, ICON_NAMES, Mood, MOOD_LABELS } from '../design/icons'
import { Medal } from '../design/Medal'
import { TrickAnimation } from '../anim/TrickAnimation'
import { TRICK_BY_ID } from '../content/tricks'
import { StatusDot } from './Tricks'

const TOKENS = [
  '--bg',
  '--surface',
  '--surface-2',
  '--line',
  '--text',
  '--muted',
  '--accent',
  '--accent-text',
  '--accent-soft',
  '--warn',
  '--danger',
  '--heel',
  '--toe',
]

/** Levende referentie van het design system. Zie ook docs/DESIGN.md. */
export default function DesignSystem() {
  const [seg, setSeg] = useState<'a' | 'b'>('a')
  const [n, setN] = useState(3)
  return (
    <Page>
      <PageHeader title="Design system" back />

      <Section title="Kleur-tokens" className="mt-0">
        <div className="grid grid-cols-3 gap-2">
          {TOKENS.map((t) => (
            <div key={t} className="card overflow-hidden p-0">
              <div className="h-12 border-b hairline" style={{ background: `var(${t})` }} />
              <div className="label p-2 !text-[9px]">{t}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typografie">
        <Card className="space-y-2">
          <div className="text-[26px] font-semibold tracking-tight">Space Grotesk / titel 26</div>
          <div className="text-lg font-semibold">Sectiekop 18</div>
          <div className="text-[15px]">Body 15 — chill, kort, Nederlands met snowboardtermen.</div>
          <div className="text-sm text-muted">Secundair 14 muted</div>
          <div className="label">JetBrains Mono / label 10.5 caps</div>
          <div className="num text-3xl font-semibold">1234 XP</div>
        </Card>
      </Section>

      <Section title={`Iconen (${ICON_NAMES.length})`}>
        <div className="grid grid-cols-6 gap-2">
          {ICON_NAMES.map((name) => (
            <div key={name} className="card flex flex-col items-center gap-1 p-2">
              <Icon name={name} size={22} />
              <span className="w-full truncate text-center text-[9px] text-muted">{name}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">24-grid · stroke 1.8 · square caps · miter joins · nooit emoji.</p>
      </Section>

      <Section title="Mood">
        <Card className="flex justify-between">
          {[1, 2, 3, 4, 5].map((m) => (
            <div key={m} className="flex flex-col items-center gap-1 text-accent-text">
              <Mood value={m} size={30} />
              <span className="label">{MOOD_LABELS[m - 1]}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Medailles">
        <div className="flex gap-3">
          <Medal icon="snowflake" unlocked />
          <Medal icon="calendar" mark="10" unlocked />
          <Medal icon="trophy" unlocked={false} />
        </div>
      </Section>

      <Section title="Componenten">
        <Card className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button>Primair</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip active>Actief</Chip>
            <Chip>Chip</Chip>
            <Chip>
              <Icon name="sun" size={16} /> Met icoon
            </Chip>
          </div>
          <Segmented
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'a', label: 'Optie A' },
              { value: 'b', label: 'Optie B' },
            ]}
          />
          <Stepper value={n} onChange={setN} />
          <Progress value={0.62} />
          <div className="flex items-center gap-4">
            <LevelDots level={3} />
            <StatusDot status="wil" />
            <StatusDot status="bezig" />
            <StatusDot status="geland" />
            <StatusDot status="beheerst" />
            <CountryTag code="FR" />
          </div>
        </Card>
      </Section>

      <Section title="Animatie">
        <TrickAnimation anim={TRICK_BY_ID.get('grab-indy')!.anim!} compact />
      </Section>
    </Page>
  )
}
