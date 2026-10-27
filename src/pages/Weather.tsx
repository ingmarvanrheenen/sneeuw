import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Chip, Page, PageHeader, cx, CountryTag } from '../components/ui'
import { Icon, Spinner } from '../design/icons'
import { RESORTS, type Resort } from '../content/resorts'
import { cachedWeather, fetchWeather, wmoIcon, wmoLabel, type ResortWeather } from '../lib/weather'
import { getProfile, saveProfile } from '../lib/auth'
import { parseISO } from '../lib/format'
import type { Profile } from '../lib/types'
import { errMsg } from '../lib/errors'

const DAY = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

function Row({ r, w, fav, onFav }: { r: Resort; w?: ResortWeather; fav: boolean; onFav: () => void }) {
  const [open, setOpen] = useState(false)
  const today = w?.days[0]
  const week = w ? Math.round(w.days.reduce((a, d) => a + d.snowCm, 0)) : 0
  const pow = week >= 20
  return (
    <Card className={cx('p-0', pow && 'border-accent')}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-3.5 text-left">
        <CountryTag code={r.country} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{r.name}</span>
            {pow && <span className="label rounded-full bg-accent px-1.5 py-px !text-[9px] !text-accent-ink">pow alert</span>}
          </div>
          <div className="label">
            {r.base}–{r.top} m{w?.snowDepthCm != null ? ` · ${w.snowDepthCm} cm ligt er` : ''}
          </div>
        </div>
        {today ? (
          <div className="flex items-center gap-2 text-right">
            <Icon name={wmoIcon(today.code)} size={24} className="text-muted" />
            <div>
              <div className="num text-sm font-semibold">{Math.round(today.tMax)}°</div>
              <div className="num text-[11px] text-accent-text">+{week} cm</div>
            </div>
          </div>
        ) : (
          <span className="label">–</span>
        )}
      </button>
      {open && w && (
        <div className="pop-in border-t hairline px-3.5 pb-3.5 pt-3">
          <div className="grid grid-cols-7 gap-1 text-center">
            {w.days.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <span className="label">{DAY[parseISO(d.date).getDay()]}</span>
                <Icon name={wmoIcon(d.code)} size={20} className={d.snowCm > 0 ? 'text-accent-text' : 'text-muted'} />
                <span className="num text-xs">{Math.round(d.tMax)}°</span>
                <span className="num text-[10px] text-muted">{Math.round(d.tMin)}°</span>
                <span className={cx('num text-[10px]', d.snowCm > 0 ? 'text-accent-text' : 'text-muted/50')}>
                  {d.snowCm > 0 ? `${Math.round(d.snowCm)}` : '0'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span>
              {wmoLabel(w.days[0].code)} · wind {Math.round(w.days[0].windMax)} km/u
              {w.freezingLevel != null ? ` · nulgraden ${Math.round(w.freezingLevel)} m` : ''}
            </span>
            <button onClick={onFav} className={cx('flex items-center gap-1', fav && 'text-accent-text')}>
              <Icon name="star" size={14} /> {fav ? 'favoriet' : 'favoriet maken'}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">{r.note}</p>
        </div>
      )}
    </Card>
  )
}

export default function Weather() {
  const [data, setData] = useState<Record<string, ResortWeather>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [country, setCountry] = useState<'alle' | 'FR' | 'AT'>('alle')
  const [profile, setProfile] = useState<Profile | null>(null)
  const outdoor = useMemo(() => RESORTS.filter((r) => !r.indoor), [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchWeather(outdoor))
    } catch (e) {
      setError(navigator.onLine ? errMsg(e) : 'Offline: je ziet de laatst opgehaalde voorspelling.')
    } finally {
      setLoading(false)
    }
  }, [outdoor])

  useEffect(() => {
    void cachedWeather().then(setData)
    void getProfile().then(setProfile)
    void refresh()
  }, [refresh])

  const favs = profile?.favoriteResorts ?? []
  const toggleFav = async (id: string) => {
    if (!profile) return
    const next = { ...profile, favoriteResorts: favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id] }
    setProfile(next)
    await saveProfile(next)
  }
  const week = (id: string) => data[id]?.days.reduce((a, d) => a + d.snowCm, 0) ?? 0
  const list = outdoor
    .filter((r) => country === 'alle' || r.country === country)
    .sort((a, b) => Number(favs.includes(b.id)) - Number(favs.includes(a.id)) || week(b.id) - week(a.id))
  const updated = Object.values(data)[0]?.fetchedAt

  return (
    <Page>
      <PageHeader
        title="Sneeuwradar"
        back
        right={
          <button aria-label="Vernieuwen" onClick={refresh} className="grid size-9 place-items-center rounded-full border hairline">
            {loading ? <Spinner size={16} /> : <Icon name="sync" size={16} />}
          </button>
        }
      />
      <div className="flex gap-2">
        {(['alle', 'FR', 'AT'] as const).map((c) => (
          <Chip key={c} active={country === c} onClick={() => setCountry(c)}>
            {c === 'alle' ? 'Alles' : c === 'FR' ? 'Frankrijk' : 'Oostenrijk'}
          </Chip>
        ))}
      </div>
      <div className="label mb-3 mt-3">
        Gesorteerd op verse sneeuw komende 7 dagen
        {updated
          ? ` · ${new Date(updated).toLocaleString('nl-NL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}`
          : ''}
      </div>
      {error && (
        <Card className="mb-3 flex items-center gap-2 text-sm text-warn">
          <Icon name="cloudOff" size={16} /> {error}
        </Card>
      )}
      <div className="space-y-2">
        {list.map((r) => (
          <Row key={r.id} r={r} w={data[r.id]} fav={favs.includes(r.id)} onFav={() => toggleFav(r.id)} />
        ))}
      </div>
      <p className="mt-6 text-xs text-muted">
        Bron: Open-Meteo, berekend op de gemiddelde hoogte van het skigebied. Check voor de lawinesituatie altijd het officiële
        lawinebericht.
      </p>
    </Page>
  )
}
