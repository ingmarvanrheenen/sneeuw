// Sneeuwspray: deeltjes die van de edge spatten als je remt, slipt of hard carvet.
// Loopt op echte tijd (niet op de tijdlijn), zodat het ook bij ¼× snelheid natuurlijk oogt.
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Points, PointsMaterial, Vector3 } from 'three'

const MAX = 420
const GRAVITY = 6

function dot() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (g) {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.4, 'rgba(255,255,255,0.6)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
  }
  return new CanvasTexture(c)
}

export class Spray {
  points: Points
  private pos = new Float32Array(MAX * 3)
  private vel = new Float32Array(MAX * 3)
  private life = new Float32Array(MAX)
  private maxLife = new Float32Array(MAX)
  private col = new Float32Array(MAX * 3)
  private from = new Color()
  private to = new Color()
  private tmp = new Color()
  private next = 0
  private carry = 0
  private mat: PointsMaterial

  /** `color` = verse spray, `fade` = waar hij naartoe vervaagt (de sneeuw) */
  constructor(color: string, fade: string) {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new BufferAttribute(this.col, 3))
    this.from.set(color)
    this.to.set(fade)
    this.mat = new PointsMaterial({
      size: 0.17,
      map: dot(),
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      opacity: 0.7,
    })
    this.points = new Points(geo, this.mat)
    this.points.frustumCulled = false
    this.clear()
  }

  setColor(color: string, fade: string) {
    this.from.set(color)
    this.to.set(fade)
  }

  clear() {
    this.life.fill(0)
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -100
    ;(this.points.geometry.attributes.position as BufferAttribute).needsUpdate = true
  }

  /**
   * @param at contactpunt van de edge (hellingsassenstelsel)
   * @param push richting waarin de sneeuw weggeduwd wordt (m/s)
   * @param rate deeltjes per seconde
   */
  emit(at: Vector3, push: Vector3, rate: number, along: Vector3, dt: number) {
    this.carry += rate * dt
    while (this.carry >= 1) {
      this.carry -= 1
      const i = this.next
      this.next = (this.next + 1) % MAX
      const s = (Math.random() - 0.5) * 1.3
      this.pos[i * 3] = at.x + along.x * s
      this.pos[i * 3 + 1] = at.y + 0.02
      this.pos[i * 3 + 2] = at.z + along.z * s
      const j = 0.6 + Math.random() * 0.7
      this.vel[i * 3] = push.x * j + (Math.random() - 0.5) * 0.6
      this.vel[i * 3 + 1] = 0.8 + Math.random() * 1.6 + push.length() * 0.15
      this.vel[i * 3 + 2] = push.z * j + (Math.random() - 0.5) * 0.6
      this.life[i] = this.maxLife[i] = 0.45 + Math.random() * 0.5
    }
  }

  step(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      if (this.life[i] <= 0 || this.pos[i * 3 + 1] < 0) {
        this.life[i] = 0
        this.pos[i * 3 + 1] = -100
        continue
      }
      // luchtweerstand + zwaartekracht
      const drag = Math.exp(-2.2 * dt)
      this.vel[i * 3] *= drag
      this.vel[i * 3 + 2] *= drag
      this.vel[i * 3 + 1] -= GRAVITY * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      // vers = duidelijk zichtbaar, daarna vervagen in de sneeuw
      this.tmp.copy(this.from).lerp(this.to, 1 - this.life[i] / this.maxLife[i])
      this.col[i * 3] = this.tmp.r
      this.col[i * 3 + 1] = this.tmp.g
      this.col[i * 3 + 2] = this.tmp.b
    }
    ;(this.points.geometry.attributes.position as BufferAttribute).needsUpdate = true
    ;(this.points.geometry.attributes.color as BufferAttribute).needsUpdate = true
  }
}
