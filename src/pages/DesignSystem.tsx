import { useState } from 'react'
import {
  Button,
  Card,
  Chip,
  List,
  Page,
  PageHeader,
  Progress,
  Row,
  Section,
  Segmented,
  Stepper,
  LevelDots,
  CountryTag,
} from '../components/ui'
import { Icon, ICON_NAMES, MOOD_LABELS } from '../design/icons'
import { MoodPick, MoodSticker, ReactionSticker } from '../design/Stickers'
import { LevelPoster, Segments, Stamp, Sticker } from '../components/Poster'
import { REACTIONS } from '../lib/crew'
import { levelFor } from '../lib/progress'
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
  '--hot',
  '--block',
  '--sticker',
  '--tab-pill',
  '--warn',
  '--danger',
  '--heel',
  '--toe',
]

/** Levende referentie van het design system. Zie ook docs/DESIGN.md. */
export default function DesignSystem() {
  const [seg, setSeg] = useState<'a' | 'b'>('a')
  const [n, setN] = useState(3)
  const [mood, setMood] = useState(4)
  // opnieuw afspelen: een nieuwe key zet de animaties opnieuw in gang
  const [replay, setReplay] = useState(0)
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
          <div className="display text-[44px] uppercase leading-[0.88]">
            Titel <span className="outline-text">44</span>
          </div>
          <div className="display text-[26px] uppercase">Sectiekop 26</div>
          <div className="text-[17px]">Body 17: chill, kort, Nederlands met snowboardtermen.</div>
          <div className="text-[15px] text-muted">Secundair 15 muted</div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">Label 11 in kapitalen</div>
          <div className="display num text-[32px]">1234 XP</div>
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

      <Section title="Poster">
        <div key={replay} className="space-y-6 pt-4">
          <LevelPoster level={levelFor(615)} badges={4} season="26/27" />
          <Card className="relative">
            <Stamp className="absolute -top-3 right-3">+15 XP</Stamp>
            <div className="font-semibold">Kaart met stempel</div>
            <Segments value={0.62} className="mt-3 text-text" />
          </Card>
          <div className="relative h-24">
            <Sticker className="left-4 top-0">
              <span>
                Ster
                <span className="display block text-[28px] tracking-normal">5</span>
              </span>
            </Sticker>
          </div>
        </div>
      </Section>

      <Section title="Stickers">
        <Card className="flex justify-between">
          {[1, 2, 3, 4, 5].map((m) => (
            <button key={m} onClick={() => setMood(m)} className="flex flex-col items-center gap-1" aria-pressed={mood === m}>
              <MoodPick value={m} on={mood === m} size={44} />
              <span className="label">{MOOD_LABELS[m - 1]}</span>
            </button>
          ))}
        </Card>
        <Card className="mt-2 flex justify-between">
          {REACTIONS.map((r) => (
            <div key={r.key} className="flex flex-col items-center gap-1">
              <ReactionSticker kind={r.key} size={44} />
              <span className="label">{r.label}</span>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-xs text-muted">Die-cut stickers met witte rand. Artwork met vaste kleuren, zoals de pistekleuren.</p>
        <div className="mt-2 flex items-center gap-2 text-muted">
          <MoodSticker value={5} size={20} /> klein in een lijst
        </div>
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

      <Section
        title="Beweging"
        action={
          <Button size="sm" variant="ghost" onClick={() => setReplay((x) => x + 1)}>
            Opnieuw
          </Button>
        }
      >
        <p className="mb-3 text-[15px] text-muted">
          rise voor titels, slap voor stickers en stempels, stagger voor lijsten, grow voor balken, en de harde schaduw waar je een knop in
          drukt.
        </p>
        <div key={replay} className="space-y-3">
          <div className="display rise text-[32px] uppercase">Rise</div>
          <List>
            <Row icon="board" title="Stagger" detail="Rijen komen kort na elkaar binnen" />
            <Row icon="board" title="Rij twee" />
            <Row icon="board" title="Rij drie" />
          </List>
          <Progress value={0.7} />
          <Button className="w-full">Druk mij in</Button>
        </div>
      </Section>

      <Section title="Trick-animatie">
        <TrickAnimation anim={TRICK_BY_ID.get('grab-indy')!.anim!} compact />
      </Section>
    </Page>
  )
}
