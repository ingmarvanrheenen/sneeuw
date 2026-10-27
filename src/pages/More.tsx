import { List, Page, PageHeader, Row } from '../components/ui'
import { SyncBadge } from '../components/SyncBadge'
import type { IconName } from '../design/icons'

type Item = { to: string; label: string; icon: IconName }

// Gegroepeerd op wat je ermee doet, zoals iOS Instellingen.
const GROUPS: Item[][] = [
  [
    { to: '/coach', label: 'Coach Daddy', icon: 'chat' },
    { to: '/stats', label: 'Stats', icon: 'chart' },
    { to: '/badges', label: 'Levels en badges', icon: 'trophy' },
    { to: '/kluis', label: 'Kluis', icon: 'vault' },
  ],
  [
    { to: '/doelen', label: 'Doelen', icon: 'target' },
    { to: '/reizen', label: 'Trips en paklijst', icon: 'suitcase' },
    { to: '/weer', label: 'Sneeuwradar', icon: 'snow' },
    { to: '/gear', label: 'Gear en stance', icon: 'board' },
    { to: '/quiz', label: 'Quiz', icon: 'quiz' },
  ],
  [
    { to: '/instellingen', label: 'Instellingen', icon: 'sliders' },
    // ontwikkelaarspagina: alleen in dev zichtbaar
    ...(import.meta.env.DEV ? [{ to: '/design', label: 'Design system', icon: 'palette' as const }] : []),
  ],
]

export default function More() {
  return (
    <Page>
      <PageHeader title="Meer" right={<SyncBadge />} />
      <div className="space-y-6">
        {GROUPS.map((g, i) => (
          <List key={i}>
            {g.map((it) => (
              <Row key={it.to} icon={it.icon} title={it.label} to={it.to} />
            ))}
          </List>
        ))}
      </div>
    </Page>
  )
}
