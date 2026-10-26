import { Link } from 'react-router-dom'
import { Page, PageHeader } from '../components/ui'
import { Icon, type IconName } from '../design/icons'
import { SyncBadge } from '../components/SyncBadge'

const ITEMS: { to: string; label: string; sub: string; icon: IconName }[] = [
  { to: '/coach', label: 'Coach Daddy', sub: 'Je AI-buddy', icon: 'chat' },
  { to: '/stats', label: 'Stats', sub: 'Grafieken & progressie', icon: 'chart' },
  { to: '/badges', label: 'Levels & badges', sub: 'Je trofeeënkast', icon: 'trophy' },
  { to: '/kluis', label: 'Kluis', sub: 'Gelande tricks + clips', icon: 'vault' },
  { to: '/doelen', label: 'Doelen', sub: 'Wat wil je leren', icon: 'target' },
  { to: '/reizen', label: 'Trips & paklijst', sub: 'Aftellen en inpakken', icon: 'suitcase' },
  { to: '/weer', label: 'Weer & sneeuw', sub: 'Frankrijk & Oostenrijk', icon: 'snow' },
  { to: '/gear', label: 'Gear & stance', sub: 'Je setup', icon: 'board' },
  { to: '/quiz', label: 'Quiz', sub: 'Ken je de termen?', icon: 'quiz' },
  { to: '/instellingen', label: 'Instellingen', sub: 'Account, thema, geluid', icon: 'sliders' },
]

export default function More() {
  return (
    <Page>
      <PageHeader kicker="04 / Meer" title="Meer" right={<SyncBadge />} />
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map((it) => (
          <Link key={it.to} to={it.to} className="card flex flex-col gap-3 p-4 active:scale-[0.98]">
            <Icon name={it.icon} size={26} className="text-accent-text" />
            <div>
              <div className="font-semibold leading-tight">{it.label}</div>
              <div className="mt-0.5 text-xs text-muted">{it.sub}</div>
            </div>
          </Link>
        ))}
      </div>
      <Link to="/design" className="label mt-8 block text-center">
        Design system
      </Link>
    </Page>
  )
}
