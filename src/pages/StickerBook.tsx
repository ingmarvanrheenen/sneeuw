// Stickerboek: per seizoen een albumpagina met de badges en trick-stickers die je dat seizoen haalde,
// ook te delen als story.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Button, Chip, Heading, List, Page, PageHeader, Row } from '../components/ui'
import { Peaks } from '../components/Poster'
import { TrickSticker } from '../components/RiderParts'
import { Medal } from '../design/Medal'
import { useProgress } from '../lib/useProgress'
import { album, albumTotals } from '../lib/album'
import { plural } from '../lib/format'
import { Icon } from '../design/icons'
import { renderAlbumCard, shareImage } from '../lib/shareCard'
import { toast } from '../lib/toast'
import { errMsg } from '../lib/errors'

/** Schuin erop geplakt, kort na elkaar. */
const slap = (i: number) => ({ '--tilt': `${[-6, 4, -2, 6, -4, 2][i % 6]}deg`, '--delay': `${Math.min(i, 14) * 45}ms` }) as CSSProperties

export default function StickerBook() {
  const p = useProgress()
  const pages = useMemo(() => (p ? album(p.input) : []), [p])
  const [season, setSeason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (pages.length && !season) setSeason(pages.at(-1)!.season)
  }, [pages, season])
  if (!p || !pages.length) return null

  const page = pages.find((x) => x.season === season) ?? pages.at(-1)!
  const { have, total } = albumTotals(pages)
  const count = page.badges.length + page.tricks.length

  async function share() {
    setBusy(true)
    try {
      await shareImage(
        await renderAlbumCard(page, { have, total }),
        `stickerboek-${page.season.replace('/', '-')}.png`,
        `Stickerboek ${page.season}`,
      )
    } catch (e) {
      toast({ title: 'Delen lukte niet', body: errMsg(e), tone: 'error', icon: 'alert' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <PageHeader title="Stickerboek" subtitle={`${have} van ${total} stickers verzameld`} back />

      {pages.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Seizoen">
          {[...pages].reverse().map((x) => (
            <Chip key={x.season} active={x.season === page.season} onClick={() => setSeason(x.season)}>
              {x.season}
            </Chip>
          ))}
        </div>
      )}

      <div
        key={page.season}
        role="group"
        aria-label={`Seizoen ${page.season}`}
        className="relative overflow-hidden rounded-[6px] bg-block p-5 text-block-ink"
      >
        <Peaks className="bottom-0 right-0 w-[170px]" />
        <div className="text-[12px] font-extrabold uppercase tracking-[0.1em]">{page.current ? 'Dit seizoen' : 'Seizoen'}</div>
        <div className="display rise mt-1 text-[56px] leading-[0.9]">{page.season}</div>
        <div className="mt-3 text-[15px]">
          {plural(page.days, 'dag', 'dagen')} · {Math.round(page.hours)} uur · {plural(count, 'sticker', 'stickers')}
        </div>
      </div>

      {count > 0 && (
        <Button variant="ghost" className="mt-3 w-full" icon={<Icon name="share" size={18} />} disabled={busy} onClick={() => void share()}>
          {busy ? 'Even maken…' : 'Deel als story'}
        </Button>
      )}

      {count === 0 && (
        <p className="mt-6 text-[15px] text-muted">
          {page.current
            ? 'Deze pagina is nog leeg. Log je eerste dag of land een trick, dan plak je hier je eerste sticker.'
            : 'Dit seizoen bleef leeg.'}
        </p>
      )}

      {page.badges.length > 0 && (
        <section className="mt-8">
          <Heading>Badges</Heading>
          <div className="grid grid-cols-3 gap-x-2 gap-y-4">
            {page.badges.map((b, i) => (
              <Link key={b.id} to="/badges" className="flex flex-col items-center text-center" aria-label={`${b.name}: ${b.desc}`}>
                <span className="slap block" style={slap(i)}>
                  <Medal icon={b.icon} mark={b.mark} unlocked rare={b.rare} size={72} />
                </span>
                <span className="mt-1.5 text-[13px] font-semibold leading-tight">{b.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {page.tricks.length > 0 && (
        <section className="mt-8">
          <Heading>Tricks</Heading>
          <div className="flex flex-wrap gap-2.5">
            {page.tricks.map((t, i) => (
              <Link key={t.id} to={`/tricks/${t.id}`} aria-label={t.name} className="slap block" style={slap(i + page.badges.length)}>
                <TrickSticker trick={t} rotate={[-4, 3, -2, 5][i % 4]} className="max-w-none text-[13px]" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <List className="mb-6 mt-8">
        <Row icon="trophy" title="Alle badges" detail="Ook die je nog kunt halen" to="/badges" />
      </List>
    </Page>
  )
}
