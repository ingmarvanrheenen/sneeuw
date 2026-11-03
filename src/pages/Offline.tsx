// Offline-check: wat er op de berg zonder bereik werkt, wat nog moet syncen, en of de app offline klaarstaat.
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Heading, List, Page, PageHeader, Row, cx } from '../components/ui'
import { Stamp } from '../components/Poster'
import { Icon, Spinner } from '../design/icons'
import { NEEDS_INTERNET, WORKS_OFFLINE } from '../content/offline'
import { appCached, askPersist, loadWaiting, storagePersisted } from '../lib/offline'
import { syncNow, syncStore } from '../lib/sync'
import { hasBackend } from '../lib/supabase'
import { authStore } from '../lib/auth'
import { db } from '../lib/db'
import { toast } from '../lib/toast'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export default function Offline() {
  const online = useOnline()
  const sync = syncStore.use()
  const { user } = authStore.use()
  const waiting = useLiveQuery(() => loadWaiting(), [sync.lastSync, sync.pending], undefined)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [count, setCount] = useState(0)
  useEffect(() => {
    void storagePersisted().then(setPersisted)
    void db.records.count().then(setCount)
  }, [])
  const cached = appCached()
  const syncing = hasBackend && !!user
  const pending = (waiting?.total ?? 0) + (waiting?.files ?? 0)

  return (
    <Page>
      <PageHeader title="Offline" subtitle="Wat werkt er op de berg zonder bereik" back />

      <div
        role="group"
        aria-label="Nu"
        className={cx('relative overflow-hidden rounded-[6px] p-5', online ? 'bg-block text-block-ink' : 'bg-hot text-hot-ink')}
      >
        <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">{online ? 'Je hebt bereik' : 'Geen bereik'}</div>
        <div className="display rise mt-1 text-[44px] uppercase leading-[0.9]">{cached ? 'Klaar voor de berg' : 'Nog niet klaar'}</div>
        <p className="mt-2 text-[15px]">
          {cached
            ? `De app en ${count} ${count === 1 ? 'ding' : 'dingen'} van je staan op dit toestel.`
            : 'Open de app een keer met bereik vanaf je beginscherm, dan staat hij daarna offline klaar.'}
        </p>
        {cached && (
          <Stamp className="absolute right-4 top-4" tilt={8}>
            Offline klaar
          </Stamp>
        )}
      </div>

      <section className="mt-8">
        <Heading>Nog te syncen</Heading>
        {!syncing ? (
          <p className="text-[15px] text-muted">
            {hasBackend
              ? 'Log in om je data te bewaren in de cloud en te delen met je crew.'
              : 'Alles staat op dit toestel; er is geen server gekoppeld.'}
          </p>
        ) : !waiting ? (
          <Spinner size={18} />
        ) : pending === 0 ? (
          <List>
            <Row
              icon="check"
              title="Alles is gesynct"
              detail={
                sync.lastSync
                  ? `Laatst om ${new Date(sync.lastSync).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
                  : undefined
              }
            />
          </List>
        ) : (
          <>
            <List>
              {waiting.items.map((w) => (
                <Row key={w.kind} icon="sync" title={w.label} detail="Gewijzigd, nog niet op de server" />
              ))}
              {waiting.files > 0 && (
                <Row
                  icon="cloud"
                  title={waiting.files === 1 ? '1 bestand' : `${waiting.files} bestanden`}
                  detail="Foto's, clips of memo's die nog geüpload moeten"
                />
              )}
            </List>
            <p className="mt-2 text-[13px] text-muted">
              {online ? 'Dit gaat vanzelf, of tik hieronder.' : 'Dit staat veilig op je toestel en gaat vanzelf zodra je bereik hebt.'}
            </p>
            {online && (
              <Button
                variant="ghost"
                className="mt-3 w-full"
                icon={sync.status === 'syncing' ? <Spinner size={16} /> : <Icon name="sync" size={18} />}
                disabled={sync.status === 'syncing'}
                onClick={() => void syncNow()}
              >
                Nu syncen
              </Button>
            )}
          </>
        )}
      </section>

      {persisted === false && (
        <section className="mt-8">
          <Heading>Vast bewaren</Heading>
          <p className="text-[15px] text-muted">
            Je telefoon kan data van websites opruimen als hij ruimte zoekt. Vraag om je data vast te bewaren.
          </p>
          <Button
            variant="ghost"
            className="mt-3 w-full"
            icon={<Icon name="vault" size={18} />}
            onClick={async () => {
              const ok = await askPersist()
              setPersisted(ok)
              toast(
                ok
                  ? { title: 'Vast bewaard', icon: 'check', tone: 'success' }
                  : { title: 'Lukt nu niet', body: 'Zet de app op je beginscherm, dan bewaart iOS hem beter.', icon: 'info' },
              )
            }}
          >
            Bewaar mijn data vast
          </Button>
        </section>
      )}

      <section className="mt-8">
        <Heading>Werkt zonder bereik</Heading>
        <List>
          {WORKS_OFFLINE.map((x) => (
            <Row key={x.title} icon={x.icon} title={x.title} detail={x.detail} />
          ))}
        </List>
      </section>

      <section className="mb-6 mt-8">
        <Heading>Heeft internet nodig</Heading>
        <List>
          {NEEDS_INTERNET.map((x) => (
            <Row key={x.title} icon={x.icon} title={x.title} detail={x.detail} />
          ))}
        </List>
      </section>
    </Page>
  )
}
