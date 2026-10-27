// Korte confetti-burst. Klein en snel, niet overweldigend.
export function confetti(intensity = 1) {
  if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '100' })
  document.body.appendChild(canvas)
  const c = canvas.getContext('2d')!
  c.scale(dpr, dpr)
  const styles = getComputedStyle(document.documentElement)
  const colors = [styles.getPropertyValue('--accent').trim() || '#9be564', '#ffffff', '#0b0d0a', '#6cc3ff']
  const n = Math.round(70 * intensity)
  const parts = Array.from({ length: n }, () => ({
    x: window.innerWidth / 2 + (Math.random() - 0.5) * 80,
    y: window.innerHeight * 0.4,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 5 + Math.random() * 6,
    h: 3 + Math.random() * 4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }))
  const start = performance.now()
  const frame = (now: number) => {
    const t = now - start
    c.clearRect(0, 0, window.innerWidth, window.innerHeight)
    for (const p of parts) {
      p.vy += 0.38
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.r += p.vr
      c.save()
      c.globalAlpha = Math.max(0, 1 - t / 1600)
      c.translate(p.x, p.y)
      c.rotate(p.r)
      c.fillStyle = p.color
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      c.restore()
    }
    if (t < 1600) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
