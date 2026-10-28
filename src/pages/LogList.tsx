import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, Heading, Page, PageHeader, Stat, StatGroup } from '../components/ui'
import { Icon, Mood } from '../design/icons'
import { sessionsSorted, useKind } from '../lib/repo'
import { parseISO, seasonOf } from '../lib/format'
import { PISTES } from '../content/logOptions'
import type { Session } from '../lib/types'

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export default function LogList() {
  const nav = useNavigate()
  const sessions = useKind('session')
  const sorted = useMemo(() => sessionsSorted(sessions ?? []), [sessions])
  const seasons = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const s of sorted) {
      const k = seasonOf(s.date)
      map.set(k, [...(map.get(k) ?? []), s])
    }
    return [...map.entries()]
  }, [sorted])

  return (
    <Page>
      <PageHeader
        title="Logboek"
        right={
          <Button size="sm" icon={<Icon name="plus" size={16} />} onClick={() => nav('/log/nieuw')}>
            Dag
          </Button>
        }
      />
      {sessions && !sorted.length && (
        <Empty
          icon={<Icon name="log" size={40} className="text-accent-text" />}
          title="Nog geen dagen gelogd"
          body="Log elke dag op de berg of in de hal: waar, hoe lang, wat je oefende en hoe vaak je viel. Zo zie je jezelf beter worden."
          action={<Button onClick={() => nav('/log/nieuw')}>Eerste dag loggen</Button>}
        />
      )}
      {seasons.map(([season, list]) => {
        const hours = list.reduce((a, s) => a + s.hours, 0)
        const falls = list.reduce((a, s) => a + s.falls, 0)
        return (
          <section key={season} className="mb-8">
            <Heading>Seizoen {season}</Heading>
            <StatGroup className="mb-3">
              <Stat label="Dagen" value={new Set(list.map((s) => s.date)).size} />
              <Stat label="Uren" value={hours} />
              <Stat label="Valpartijen" value={falls} />
            </StatGroup>
            <div className="card divide-y divide-[var(--line)] overflow-hidden">
              {list.map((s) => {
                const date = parseISO(s.date)
                return (
                  <button
                    key={s.id}
                    onClick={() => nav(`/log/${s.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                  >
                    <div className="w-11 shrink-0 text-center">
                      <div className="display num text-[24px]">{date.getDate()}</div>
                      <div className="text-[12px] text-muted">{MONTHS[date.getMonth()]}</div>
                    </div>
                    <div className="h-9 w-px bg-line" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.resortName || 'Onbekend'}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {s.pistes.map((p) => (
                          <span
                            key={p}
                            className="size-2 rounded-full ring-1 ring-[var(--line)]"
                            style={{ background: PISTES.find((x) => x.id === p)?.color }}
                          />
                        ))}
                        <span className="num text-xs text-muted">
                          {s.hours}u · {s.falls} val{s.landed.length ? ` · ${s.landed.length} geland` : ''}
                        </span>
                      </div>
                    </div>
                    {s.mediaIds.length > 0 && <Icon name="image" size={16} className="text-muted" />}
                    <Mood value={s.mood} className="text-accent-text" />
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </Page>
  )
}
