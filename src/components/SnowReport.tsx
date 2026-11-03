// Sneeuw en lawines op de trippagina: de sneeuwhoogte in het dal en bovenop (schatting van het weermodel, offline
// de laatste stand), de link naar het officiële lawinebericht, en wat de gevarenschaal betekent.
import { useEffect, useState } from 'react'
import { Heading, List, Row, Stat, StatGroup } from './ui'
import { Icon } from '../design/icons'
import { bulletinFor, DANGER_LEVELS } from '../content/avalanche'
import { age, cachedSnowpack, loadSnowpack, type Snowpack } from '../lib/snowpack'
import type { Resort } from '../content/resorts'

export function SnowReport({ resort }: { resort: Resort }) {
  const [pack, setPack] = useState<Snowpack | null>(null)
  const [failed, setFailed] = useState(false)
  const [scale, setScale] = useState(false)
  useEffect(() => {
    let alive = true
    void cachedSnowpack(resort.id).then((c) => alive && c && setPack((cur) => cur ?? c))
    if (navigator.onLine)
      loadSnowpack(resort)
        .then((p) => alive && p && setPack(p))
        .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [resort])
  if (resort.indoor) return null
  const bulletin = bulletinFor(resort)

  return (
    <section className="mt-8" aria-label="Sneeuw en lawines">
      <Heading>Sneeuw en lawines</Heading>
      {pack ? (
        <>
          <StatGroup>
            <Stat label={`Dal · ${resort.base} m`} value={`${pack.base} cm`} />
            <Stat label={`Boven · ${resort.top} m`} value={`${pack.top} cm`} />
          </StatGroup>
          <p className="mt-2 text-[13px] text-muted">Schatting van het weermodel, {age(pack.at)}. Geen meting op de piste.</p>
        </>
      ) : (
        <p className="text-[15px] text-muted">{failed ? 'Sneeuwhoogte ophalen lukte nu niet.' : 'Sneeuwhoogte ophalen…'}</p>
      )}
      <List className="mt-3">
        {bulletin && (
          <a href={bulletin.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3">
            <Icon name="alert" size={22} className="shrink-0 text-hot-text" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Lawinebericht van vandaag</span>
              <span className="block truncate text-[13px] text-muted">{bulletin.name}</span>
            </span>
            <Icon name="external" size={16} className="shrink-0 text-muted" />
          </a>
        )}
        <Row icon="info" title="Wat betekent het niveau?" detail="De gevarenschaal van 1 tot 5" onClick={() => setScale((s) => !s)} />
        {scale &&
          DANGER_LEVELS.map((d) => (
            <div key={d.level} className="flex gap-3 px-4 py-3">
              <span className="display num w-6 shrink-0 text-[24px] leading-none">{d.level}</span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{d.name}</span>
                <span className="block text-[13px] text-muted">{d.meaning}</span>
              </span>
            </div>
          ))}
      </List>
      <p className="mt-2 text-[13px] text-muted">Naast de piste: lees elke ochtend het bericht. De pistes zelf worden voor je beveiligd.</p>
    </section>
  )
}
