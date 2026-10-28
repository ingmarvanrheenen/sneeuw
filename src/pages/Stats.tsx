import { useMemo } from 'react'
import { Card, Empty, List, Page, PageHeader, Row, Section, Stat, StatGroup } from '../components/ui'
import { BarChart, HBar, LineChart } from '../components/Charts'
import { Icon, Mood, MOOD_LABELS } from '../design/icons'
import { useProgress } from '../lib/useProgress'
import { seasonsWithData } from '../lib/wrapped'
import { monthLabel, fmtShort, plural } from '../lib/format'
import { TRACKS, TRICKS } from '../content/tricks'
import { PISTES } from '../content/logOptions'

export default function Stats() {
  const p = useProgress()
  const data = useMemo(() => {
    if (!p) return null
    const sessions = [...p.input.sessions].sort((a, b) => a.date.localeCompare(b.date))
    // dagen per maand (laatste 8 maanden met data)
    const months = new Map<string, Set<string>>()
    for (const s of sessions) {
      const k = s.date.slice(0, 7)
      months.set(k, (months.get(k) ?? new Set()).add(s.date))
    }
    const perMonth = [...months.entries()].slice(-8).map(([k, v]) => ({ label: monthLabel(k), value: v.size }))
    const fallRate = sessions.filter((s) => s.hours > 0).map((s) => ({ label: fmtShort(s.date), value: s.falls / s.hours }))
    const landed = new Set(p.input.tricks.filter((t) => t.status === 'geland' || t.status === 'beheerst').map((t) => t.trickId))
    const tracks = TRACKS.map((t) => {
      const all = TRICKS.filter((x) => x.track === t.id)
      return { ...t, total: all.length, done: all.filter((x) => landed.has(x.id)).length }
    })
    const moods = [1, 2, 3, 4, 5].map((m) => ({
      label: MOOD_LABELS[m - 1],
      value: sessions.filter((s) => s.mood === m).length,
      tick: <Mood value={m} size={18} className="mx-auto" />,
      detail: `${MOOD_LABELS[m - 1]}: ${plural(sessions.filter((s) => s.mood === m).length, 'dag', 'dagen')}`,
    }))
    const pistes = PISTES.map((pi) => ({ ...pi, n: sessions.filter((s) => s.pistes.includes(pi.id)).length }))
    const first = sessions.slice(0, 3)
    const last = sessions.slice(-3)
    const rate = (l: typeof sessions) => {
      const h = l.reduce((a, s) => a + s.hours, 0)
      return h ? l.reduce((a, s) => a + s.falls, 0) / h : 0
    }
    return { perMonth, fallRate, tracks, moods, pistes, trend: sessions.length >= 4 ? { before: rate(first), now: rate(last) } : null }
  }, [p])

  if (!p || !data) return null
  const s = p.stats

  return (
    <Page>
      <PageHeader title="Je progressie" back />
      {s.days === 0 ? (
        <Empty
          icon={<Icon name="chart" size={40} className="text-muted" />}
          title="Nog geen data"
          body="Log je eerste dag en hier verschijnen je grafieken."
        />
      ) : (
        <>
          <List className="mb-4">
            {seasonsWithData(p.input.sessions).map((season) => (
              <Row
                key={season}
                icon="sparkle"
                title={`Season Wrapped ${season}`}
                detail="Je seizoen als story, om te delen"
                to={`/wrapped?seizoen=${encodeURIComponent(season)}`}
              />
            ))}
          </List>
          <StatGroup>
            <Stat label="Dagen" value={s.days} />
            <Stat label="Uren" value={s.hours} />
            <Stat label="Gevallen" value={s.falls} />
          </StatGroup>
          <StatGroup className="mt-2">
            <Stat label="Tricks geland" value={s.tricksLanded} />
            <Stat label="Gebieden" value={s.resorts} />
            <Stat label="Val per uur" value={s.fallsPerHour.toFixed(1)} />
          </StatGroup>

          {data.trend && (
            <Card className="mt-2 flex items-center gap-3">
              <Icon name={data.trend.now <= data.trend.before ? 'stomp' : 'impact'} size={26} className="text-accent-text" />
              <div className="text-sm">
                {data.trend.now <= data.trend.before ? 'Je valt minder dan in het begin: ' : 'Je valt nu vaker (meer proberen = goed): '}
                <span className="num font-semibold">{data.trend.before.toFixed(1)}</span> →{' '}
                <span className="num font-semibold">{data.trend.now.toFixed(1)}</span> per uur
              </div>
            </Card>
          )}

          <Section title="Dagen per maand">
            <Card>
              <BarChart data={data.perMonth} ariaLabel="Aantal dagen op de plank per maand" />
            </Card>
          </Section>

          <Section title="Valpartijen per uur">
            <Card>
              <LineChart data={data.fallRate} ariaLabel="Valpartijen per uur per gelogde dag" />
              <p className="mt-2 text-xs text-muted">
                Lager is stabieler. Hoger kan ook betekenen dat je nieuwe dingen probeert, en dat is precies goed.
              </p>
            </Card>
          </Section>

          <Section title="Progressie per onderdeel">
            <Card className="space-y-3">
              {data.tracks.map((t) => (
                <HBar key={t.id} label={t.name} value={t.done} total={t.total} />
              ))}
            </Card>
          </Section>

          <Section title="Mood">
            <Card>
              <BarChart data={data.moods} ariaLabel="Verdeling van je mood per dag" />
            </Card>
          </Section>

          <Section title="Pistes">
            <Card className="space-y-3">
              {data.pistes.map((pi) => (
                <HBar key={pi.id} label={pi.label} value={pi.n} total={s.days} right={plural(pi.n, 'dag', 'dagen')} />
              ))}
            </Card>
          </Section>
        </>
      )}
    </Page>
  )
}
