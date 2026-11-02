// Compacte 3D-speler voor een beweging in een lus (warming-up): geen knoppen, één scène die blijft staan als
// de beweging wisselt. Lukt WebGL niet, dan meldt hij dat (`onFail`) zodat de pagina de 2D-versie laat zien.
import { useEffect, useRef, useState } from 'react'
import { settingsStore } from '../lib/settings'
import { readColors, Stage } from './stage'
import type { Motion } from './types'

export default function Loop3D({ motion, onFail, label }: { motion: Motion; onFail?: () => void; label?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const goofy = settingsStore.use().goofy
  const [ready, setReady] = useState(false)
  const t0 = useRef(0)

  // scène één keer opbouwen
  useEffect(() => {
    if (!host.current) return
    let s: Stage
    try {
      s = new Stage(host.current, readColors())
    } catch {
      onFail?.()
      return
    }
    stage.current = s
    const recolor = () => s.setColors(readColors())
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', recolor)
    return () => {
      mq.removeEventListener('change', recolor)
      s.dispose()
      stage.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // nieuwe beweging: in dezelfde scène, van voren af aan
  useEffect(() => {
    const s = stage.current
    if (!s) return
    s.setMotion(motion)
    s.setMirror(goofy)
    t0.current = performance.now()
  }, [motion, goofy])

  useEffect(() => {
    let raf = 0
    const tick = (now: number) => {
      const s = stage.current
      if (s) {
        const t = (((now - t0.current) / 1000) % motion.duration) / motion.duration
        s.update(t, null, now / 1000)
        s.render()
        setReady(true)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [motion])

  return (
    <div className="card relative aspect-[4/3] overflow-hidden" role="img" aria-label={label}>
      <div ref={host} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-[13px] text-muted">Rider laden…</div>}
    </div>
  )
}
