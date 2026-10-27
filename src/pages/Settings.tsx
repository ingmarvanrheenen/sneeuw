import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, Page, PageHeader, Section, Segmented, cx, inputCls, List, Row } from '../components/ui'
import { Icon, Spinner } from '../design/icons'
import { authStore, getProfile, saveProfile, signIn, signOut, signUp } from '../lib/auth'
import { backendInfo, hasBackend } from '../lib/supabase'
import { syncNow, syncStore } from '../lib/sync'
import { settingsStore, updateSettings } from '../lib/settings'
import { db } from '../lib/db'
import { toast } from '../lib/toast'
import { sfx } from '../lib/sounds'
import { isIOS, isStandalone } from '../lib/pwa'
import type { Profile } from '../lib/types'
import { errMsg } from '../lib/errors'

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button
      onClick={() => {
        onChange(!on)
        sfx.toggle()
      }}
      className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
      role="switch"
      aria-checked={on}
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition', on ? 'bg-accent' : 'bg-surface-2')}>
        <span className={cx('absolute top-1 size-5 rounded-full transition-all', on ? 'left-6 bg-accent-ink' : 'left-1 bg-muted')} />
      </span>
    </button>
  )
}

function Account() {
  const { user } = authStore.use()
  const sync = syncStore.use()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  if (!hasBackend)
    return (
      <Card className="text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Icon name="device" size={18} /> Lokale modus
        </div>
        <p className="mt-1 text-muted">
          Alles wordt op dit toestel bewaard. Koppel Supabase (zie README) voor een account, sync tussen apparaten, crews en Coach Daddy.
        </p>
      </Card>
    )

  if (user)
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-accent text-accent-ink">
            <Icon name="user" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.email}</div>
            <div className="label">
              {sync.status === 'syncing'
                ? 'bezig met sync…'
                : sync.lastSync
                  ? `laatste sync ${new Date(sync.lastSync).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                  : 'nog niet gesynct'}
              {sync.pending ? ` · ${sync.pending} wacht` : ''}
            </div>
          </div>
        </div>
        {sync.status === 'error' && <p className="mt-2 text-xs text-danger">Sync-fout: {sync.error}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={sync.status === 'syncing' ? <Spinner size={14} /> : <Icon name="sync" size={14} />}
            onClick={() => syncNow()}
          >
            Nu syncen
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Icon name="logout" size={14} />}
            onClick={async () => {
              if (sync.pending && !confirm(`${sync.pending} wijzigingen zijn nog niet gesynct en gaan verloren. Toch uitloggen?`)) return
              await signOut()
              location.reload()
            }}
          >
            Uitloggen
          </Button>
        </div>
      </Card>
    )

  return (
    <Card>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'in', label: 'Inloggen' },
          { value: 'up', label: 'Account maken' },
        ]}
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            if (mode === 'up') {
              await signUp(email.trim(), password, name.trim())
              toast({ title: 'Account gemaakt', body: 'Check je mail als bevestiging aanstaat.', icon: 'check', tone: 'success' })
            } else {
              await signIn(email.trim(), password)
              toast({ title: 'Ingelogd', body: 'Je data wordt gesynct', icon: 'cloud', tone: 'success' })
            }
          } catch (err) {
            toast({ title: 'Mislukt', body: errMsg(err), icon: 'alert', tone: 'error' })
          } finally {
            setBusy(false)
          }
        }}
      >
        {mode === 'up' && (
          <Field label="Naam (zie je crew)">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="nickname" required />
          </Field>
        )}
        <Field label="E-mail">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" required />
        </Field>
        <Field label="Wachtwoord">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
        </Field>
        <Button type="submit" className="mt-4 w-full" disabled={busy}>
          {busy ? 'Even geduld…' : mode === 'up' ? 'Account maken' : 'Inloggen'}
        </Button>
        <p className="mt-2 text-xs text-muted">Wat je al lokaal hebt gelogd, gaat automatisch mee naar je account.</p>
      </form>
    </Card>
  )
}

const KEY_LABEL: Record<string, string> = {
  publishable: 'publishable (goed)',
  anon: 'anon (goed)',
  secret: 'SECRET, geblokkeerd',
  onbekend: 'onbekend formaat',
  geen: 'geen',
}

function Connection() {
  const bad = backendInfo.keyKind === 'secret' || backendInfo.keyKind === 'onbekend'
  return (
    <Card className="text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Icon name={hasBackend ? 'cloud' : 'device'} size={18} /> Verbinding
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted">Project</dt>
        <dd className="num truncate">{backendInfo.host || 'niet ingesteld'}</dd>
        <dt className="text-muted">Key</dt>
        <dd className={cx(bad && 'text-danger')}>{KEY_LABEL[backendInfo.keyKind]}</dd>
        <dt className="text-muted">Uit variabele</dt>
        <dd className="num truncate">{backendInfo.keySource || '–'}</dd>
      </dl>
    </Card>
  )
}

export default function Settings() {
  const settings = settingsStore.use()
  const [profile, setProfile] = useState<Profile | null>(null)
  useEffect(() => {
    void getProfile().then(setProfile)
  }, [])

  async function exportData() {
    const data = { exportedAt: new Date().toISOString(), records: await db.records.toArray(), profile: await getProfile() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sneeuw-daddy-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  return (
    <Page>
      <PageHeader title="Instellingen" back />
      <Section title="Account" className="mt-0">
        <Account />
        <div className="mt-2">
          {(import.meta.env.DEV || !hasBackend || backendInfo.keyKind === 'secret' || backendInfo.keyKind === 'onbekend') && <Connection />}
        </div>
      </Section>

      {profile && (
        <Section title="Profiel">
          <Card>
            <Field label="Naam">
              <input
                value={profile.displayName}
                onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                onBlur={() => saveProfile(profile)}
                className={inputCls}
                placeholder="Hoe heet je?"
              />
            </Field>
            <Link to="/gear" className="mt-3 flex items-center justify-between text-sm">
              Stance & bindingen <Icon name="chevron" size={16} className="text-muted" />
            </Link>
          </Card>
        </Section>
      )}

      <Section title="Uiterlijk">
        <Segmented
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { value: 'system', label: 'Systeem' },
            { value: 'dark', label: 'Donker' },
            { value: 'light', label: 'Licht' },
          ]}
        />
        <div className="card mt-2 divide-y divide-[var(--line)] p-0">
          <Toggle
            on={settings.sounds}
            onChange={(sounds) => updateSettings({ sounds })}
            label="Geluidjes"
            sub="Kleine tikjes en een deuntje bij badges"
          />
          <Toggle
            on={settings.goofy}
            onChange={(goofy) => updateSettings({ goofy })}
            label="Animaties in goofy"
            sub="Spiegelt alle trick-animaties"
          />
        </div>
      </Section>

      {isIOS() && !isStandalone() && (
        <Section title="Installeren op iPhone">
          <Card className="text-sm">
            <ol className="space-y-1.5">
              <li>1. Open deze pagina in Safari</li>
              <li className="flex items-center gap-1">
                2. Tik op <Icon name="share" size={14} /> Deel
              </li>
              <li>3. Kies “Zet op beginscherm”</li>
            </ol>
          </Card>
        </Section>
      )}

      <Section title="Data">
        <List>
          <Row icon="download" title="Exporteer je data" detail="Alles als JSON-bestand, voor een back-up" onClick={exportData} />
        </List>
      </Section>

      <p className="label mt-10 text-center">Sneeuw Daddy v{__APP_VERSION__}</p>
    </Page>
  )
}
