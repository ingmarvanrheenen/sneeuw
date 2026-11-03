// Seizoensboek: je seizoen als boek, om terug te lezen of als PDF te bewaren (via het printscherm: op de iPhone
// "Bewaar in Bestanden"). Cover, hoofdstukken uit Wrapped, je tricks en stickers, je beste clips en je dagen.
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Chip, Empty, Heading, List, Page, PageHeader } from '../components/ui'
import { Peaks, Stamp } from '../components/Poster'
import { MediaThumb, MediaViewer } from '../components/Media'
import { TrickSticker } from '../components/RiderParts'
import { Medal } from '../design/Medal'
import { Icon } from '../design/icons'
import { useProgress } from '../lib/useProgress'
import { seasonBook } from '../lib/seasonBook'
import { seasonsWithData } from '../lib/wrapped'
import { fmtShort, plural } from '../lib/format'
import type { MediaMeta } from '../lib/types'

export default function SeasonBook() {
  const p = useProgress()
  const [params, setParams] = useSearchParams()
  const [viewing, setViewing] = useState<MediaMeta | null>(null)
  const seasons = useMemo(() => (p ? seasonsWithData(p.input.sessions) : []), [p])
  const season = params.get('seizoen') ?? seasons[0]
  const book = useMemo(() => (p && season ? seasonBook(p.input, season) : null), [p, season])
  if (!p) return null

  if (!book || !book.days)
    return (
      <Page>
        <PageHeader title="Seizoensboek" back />
        <Empty
          icon={<Icon name="book" size={36} className="text-muted" />}
          title="Nog geen seizoen om te bewaren"
          body="Log je dagen op de plank, dan maken we hier een boek van je seizoen."
        />
      </Page>
    )

  const hours = book.months.flatMap((m) => m.days).reduce((a, s) => a + (s.hours || 0), 0)
  const stickers = (book.page?.badges.length ?? 0) + (book.page?.tricks.length ?? 0)

  return (
    <Page>
      <div className="no-print">
        <PageHeader title="Seizoensboek" subtitle="Je seizoen om te bewaren" back />
        {seasons.length > 1 && (
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Seizoen">
            {seasons.map((s) => (
              <Chip key={s} active={s === season} onClick={() => setParams({ seizoen: s })}>
                {s}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div
        role="group"
        aria-label={`Seizoensboek ${book.season}`}
        className="book-page relative overflow-hidden rounded-[6px] bg-block p-6 text-block-ink"
      >
        <Peaks className="bottom-0 right-0 w-[200px]" />
        <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">Seizoensboek</div>
        <div className="display rise mt-2 text-[88px] leading-[0.85]">{book.season}</div>
        <div className="mt-4 text-[17px]">
          {plural(book.days, 'dag', 'dagen')} · {Math.round(hours)} uur · {plural(stickers, 'sticker', 'stickers')}
        </div>
        <Stamp className="absolute right-4 top-4" tilt={8}>
          Gereden
        </Stamp>
      </div>

      <Button className="no-print mt-3 w-full" variant="ghost" icon={<Icon name="download" size={18} />} onClick={() => window.print()}>
        Bewaar als PDF
      </Button>
      <p className="no-print mt-1 text-center text-[13px] text-muted">
        Kies in het printscherm "Bewaar in Bestanden" of "Opslaan als PDF".
      </p>

      {book.chapters.length > 0 && (
        <section className="book-page mt-8">
          <Heading>Het seizoen</Heading>
          <List>
            {book.chapters.map((c) => (
              <div key={c.id} className="flex items-start gap-4 px-4 py-4">
                <span className="display num min-w-[88px] text-[34px] leading-none">{c.big}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{c.title}</span>
                  <span className="block text-[13px] text-muted">{c.body}</span>
                </span>
              </div>
            ))}
          </List>
        </section>
      )}

      {book.page && (book.page.badges.length > 0 || book.page.tricks.length > 0) && (
        <section className="book-page mt-8">
          <Heading>Stickers</Heading>
          {book.page.badges.length > 0 && (
            <div className="grid grid-cols-4 gap-x-2 gap-y-3">
              {book.page.badges.map((b) => (
                <div key={b.id} className="flex flex-col items-center text-center">
                  <Medal icon={b.icon} mark={b.mark} unlocked rare={b.rare} size={56} />
                  <span className="mt-1 text-[12px] font-semibold leading-tight">{b.name}</span>
                </div>
              ))}
            </div>
          )}
          {book.page.tricks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {book.page.tricks.map((t, i) => (
                <TrickSticker key={t.id} trick={t} rotate={[-3, 2, -1, 3][i % 4]} className="max-w-none text-[13px]" />
              ))}
            </div>
          )}
        </section>
      )}

      {book.clips.length > 0 && (
        <section className="book-page mt-8">
          <Heading>Beste clips</Heading>
          <div className="grid grid-cols-3 gap-1.5">
            {book.clips.map((m) => (
              <MediaThumb
                key={m.id}
                m={m}
                onClick={() => setViewing(m)}
                className="aspect-square w-full"
                label={`Clip van ${fmtShort(new Date(m.createdAt).toISOString().slice(0, 10))}`}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mb-8 mt-8">
        <Heading>Je dagen</Heading>
        {book.months.map((m) => (
          <div key={m.label} className="book-month mb-4">
            <h3 className="display mb-2 text-[20px] uppercase">{m.label}</h3>
            <List>
              {m.days.map((s) => (
                <Link key={s.id} to={`/log/${s.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-surface-2">
                  <span className="display num w-16 shrink-0 text-[20px]">{fmtShort(s.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{s.resortName || 'Op de plank'}</span>
                    <span className="block text-[13px] text-muted">
                      {[`${String(s.hours).replace('.', ',')} u`, s.falls ? `${s.falls}x gevallen` : '', s.runs ? `${s.runs} runs` : '']
                        .filter(Boolean)
                        .join(' · ')}
                      {s.highlight ? ` · "${s.highlight}"` : ''}
                    </span>
                  </span>
                </Link>
              ))}
            </List>
          </div>
        ))}
      </section>
      <MediaViewer m={viewing} onClose={() => setViewing(null)} />
    </Page>
  )
}
