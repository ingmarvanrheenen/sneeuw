import { Icon, Spinner } from '../design/icons'
import { Link } from 'react-router-dom'
import { syncStore } from '../lib/sync'
import { authStore } from '../lib/auth'
import { hasBackend } from '../lib/supabase'

export function SyncBadge() {
  const s = syncStore.use()
  const { user } = authStore.use()
  // zonder server is alles lokaal en valt er niks te melden
  if (!hasBackend) return null
  if (!user)
    return (
      <Link
        to="/instellingen"
        className="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-medium text-accent-text"
      >
        <Icon name="user" size={14} />
        Inloggen
      </Link>
    )
  let icon = <Icon name="cloud" size={14} />
  let text = 'gesynct'
  if (s.status === 'syncing') {
    icon = <Spinner size={14} />
    text = 'sync'
  } else if (s.status === 'offline') {
    icon = <Icon name="cloudOff" size={14} />
    text = s.pending ? `${s.pending} wacht` : 'offline'
  } else if (s.status === 'error') {
    icon = <Icon name="alert" size={14} />
    text = 'fout'
  } else if (s.pending) {
    text = `${s.pending} wacht`
  }
  return (
    <Link to="/instellingen" className="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] text-muted">
      {icon}
      {text}
    </Link>
  )
}
