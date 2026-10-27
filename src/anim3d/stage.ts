// De 3D-scène: helling met corduroy, sporen in de sneeuw, obstakels, licht en een camera
// die de rider volgt. Je kunt zelf om de rider heen draaien (OrbitControls).
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
  SphereGeometry,
  BoxGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { BodyPart } from '../anim/engine'
import { normalize, sample } from '../anim/engine'
import { Rider, type RigColors } from './rig'
import { headingVectors, solve, type Body3 } from './solve'
import { SIDE_SCALE } from './builders'
import { KEY3_DEFAULT, type CameraPreset, type FullKey3, type Motion } from './types'

export interface StageColors extends RigColors {
  bg: string
  snow: string
  line: string
  trail: string
  terrain: string
}

/** Kleuren uit de design-tokens halen, zodat 3D licht en donker volgt. */
export function readColors(): StageColors {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f
  const bg = v('--bg', '#f3f5f2')
  const dark = new Color(bg).getHSL({ h: 0, s: 0, l: 0 }).l < 0.3
  return {
    bg,
    snow: dark ? '#262d29' : '#fbfcfb',
    line: dark ? '#2f3832' : '#e5eae6',
    trail: dark ? '#3a443d' : '#dfe6e1',
    terrain: dark ? '#323b35' : '#e6ebe7',
    jacket: v('--jacket', '#1f7a3d'),
    pants: dark ? '#cfd6cd' : '#2a312b',
    gear: dark ? '#edf1eb' : '#151a16',
    board: dark ? '#e6ebe4' : '#1a201b',
    accent: v('--accent', '#1f7a3d'),
    heel: v('--heel', '#1767b0'),
    toe: v('--toe', '#b8561b'),
  }
}

const TRAIL_MAX = 400

export class Stage {
  renderer: WebGLRenderer
  scene = new Scene()
  camera = new PerspectiveCamera(38, 1, 0.05, 200)
  controls: OrbitControls
  private world = new Group()
  private rider: Rider
  private sun: DirectionalLight
  private hemi: HemisphereLight
  private snowMat: MeshStandardMaterial
  private terrainMat: MeshStandardMaterial
  private lineMat: LineBasicMaterial
  private trailMat: MeshStandardMaterial
  private trailGeo = new BufferGeometry()
  private terrainGroup = new Group()
  private motion: Motion | null = null
  private keys: FullKey3[] = []
  private lastTarget = new Vector3()
  private preset: CameraPreset = 'zij'
  private ro: ResizeObserver
  body: Body3 | null = null
  key: FullKey3 | null = null

  constructor(
    private host: HTMLElement,
    colors: StageColors,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    // verticaal vegen scrolt de pagina, horizontaal draait de camera
    this.renderer.domElement.style.touchAction = 'pan-y'

    this.scene.background = new Color(colors.bg)
    this.scene.fog = new Fog(colors.bg, 18, 48)
    this.hemi = new HemisphereLight('#ffffff', '#b7c3bb', 1.6)
    this.scene.add(this.hemi)
    this.sun = new DirectionalLight('#ffffff', 1.9)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    const sc = this.sun.shadow.camera
    sc.left = -3
    sc.right = 3
    sc.top = 3
    sc.bottom = -3
    sc.near = 0.5
    sc.far = 20
    this.sun.shadow.bias = -0.0008
    this.scene.add(this.sun, this.sun.target)

    this.scene.add(this.world)
    // sneeuw
    this.snowMat = new MeshStandardMaterial({ color: new Color(colors.snow), roughness: 0.95 })
    const snow = new Mesh(new PlaneGeometry(120, 260), this.snowMat)
    snow.rotation.x = -Math.PI / 2
    snow.position.z = 40
    snow.receiveShadow = true
    this.world.add(snow)
    // corduroy: lijntjes langs de valrichting geven gevoel voor snelheid en richting
    const cord: number[] = []
    for (let x = -30; x <= 30; x += 0.6) cord.push(x, 0.003, -60, x, 0.003, 160)
    for (let z = -60; z <= 160; z += 4) cord.push(-30, 0.003, z, 30, 0.003, z)
    const cordGeo = new BufferGeometry()
    cordGeo.setAttribute('position', new BufferAttribute(new Float32Array(cord), 3))
    this.lineMat = new LineBasicMaterial({ color: new Color(colors.line) })
    this.world.add(new LineSegments(cordGeo, this.lineMat))
    // spoor
    this.trailGeo.setAttribute('position', new BufferAttribute(new Float32Array(TRAIL_MAX * 2 * 3), 3))
    const idx: number[] = []
    for (let i = 0; i < TRAIL_MAX - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    this.trailGeo.setIndex(idx)
    this.trailMat = new MeshStandardMaterial({ color: new Color(colors.trail), roughness: 1, side: DoubleSide })
    const trail = new Mesh(this.trailGeo, this.trailMat)
    trail.receiveShadow = true
    trail.frustumCulled = false
    this.world.add(trail)
    this.terrainMat = new MeshStandardMaterial({ color: new Color(colors.terrain), roughness: 0.9 })
    this.world.add(this.terrainGroup)

    this.rider = new Rider(colors)
    this.world.add(this.rider.group)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.enablePan = false
    this.controls.minDistance = 2
    this.controls.maxDistance = 14
    this.controls.rotateSpeed = 0.8

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
  }

  setColors(c: StageColors) {
    ;(this.scene.background as Color).set(c.bg)
    ;(this.scene.fog as Fog).color.set(c.bg)
    this.snowMat.color.set(c.snow)
    this.lineMat.color.set(c.line)
    this.trailMat.color.set(c.trail)
    this.terrainMat.color.set(c.terrain)
    this.rider.setColors(c)
  }

  /** Goofy: spiegel de hele wereld, zodat de rider met rechts voor staat. */
  setMirror(on: boolean) {
    this.world.scale.x = on ? -1 : 1
    this.world.updateMatrixWorld()
    if (this.motion) this.setCamera(this.preset)
  }

  private resize() {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  setMotion(m: Motion) {
    this.motion = m
    this.keys = normalize(m.keys, KEY3_DEFAULT) as FullKey3[]
    this.world.rotation.x = (m.slope * Math.PI) / 180
    this.buildTerrain(m)
    this.update(0)
    this.setCamera(m.camera)
  }

  private buildTerrain(m: Motion) {
    this.terrainGroup.clear()
    const mesh = (geo: BufferGeometry, x = 0, y = 0, z = 0) => {
      const o = new Mesh(geo, this.terrainMat)
      o.position.set(x, y, z)
      o.castShadow = true
      o.receiveShadow = true
      this.terrainGroup.add(o)
      return o
    }
    const Z = SIDE_SCALE.z
    const Y = SIDE_SCALE.y
    if (m.terrain === 'kicker') {
      // zijprofiel in (z, y), uitgetrokken over de breedte
      const s = new Shape()
      s.moveTo(-0.52 * Z, 0)
      s.quadraticCurveTo(-0.26 * Z, 0, -0.17 * Z, 0.3 * Y)
      s.lineTo(0.22 * Z, 0.3 * Y)
      s.lineTo(0.64 * Z, 0)
      s.lineTo(-0.52 * Z, 0)
      const g = new ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: false, curveSegments: 16 })
      g.rotateY(-Math.PI / 2)
      g.translate(1.3, 0, 0)
      mesh(g)
    } else if (m.terrain === 'box') {
      mesh(new BoxGeometry(0.5, 0.2 * Y, 0.8 * Z), 0, 0.1 * Y, 0)
    } else if (m.terrain === 'rail') {
      const rail = mesh(new CylinderGeometry(0.035, 0.035, 0.8 * Z, 16), 0, 0.3 * Y, 0)
      rail.rotation.x = Math.PI / 2
      for (const z of [-0.3 * Z, 0.3 * Z]) mesh(new CylinderGeometry(0.03, 0.03, 0.3 * Y, 10), 0, 0.15 * Y, z)
    } else if (m.terrain === 'bulten') {
      for (let i = 0; i < 26; i++) {
        const b = mesh(new SphereGeometry(1, 20, 12), -6 + (i % 5) * 3 + (Math.floor(i / 5) % 2) * 1.5, -0.55, -8 + Math.floor(i / 5) * 4)
        b.scale.set(1.1, 0.75, 0.9)
      }
    } else if (m.terrain === 'bomen') {
      const treeMat = new MeshStandardMaterial({ color: new Color('#2f5a3a'), roughness: 0.9 })
      for (const [x, z] of [
        [-4, -3],
        [5, 1],
        [-5, 6],
        [6, 9],
        [0.5, -6],
        [3.5, 4],
        [-1.5, 12],
      ]) {
        const tree = new Mesh(new ConeGeometry(0.9, 3.2, 10), treeMat)
        tree.position.set(x, 1.6, z)
        tree.castShadow = true
        this.terrainGroup.add(tree)
      }
    } else if (m.terrain === 'poeder') {
      const fluff = new Mesh(
        new PlaneGeometry(120, 260),
        new MeshStandardMaterial({ color: this.snowMat.color.clone(), roughness: 1, transparent: true, opacity: 0.88 }),
      )
      fluff.rotation.x = -Math.PI / 2
      fluff.position.set(0, 0.11, 40)
      this.terrainGroup.add(fluff)
    } else if (m.terrain === 'lift') {
      const cable = mesh(new CylinderGeometry(0.015, 0.015, 40, 6), -0.7, 2.6, 0)
      cable.rotation.x = Math.PI / 2
      for (const z of [-12, 6]) mesh(new CylinderGeometry(0.12, 0.15, 3, 10), -0.7, 1.5, z)
    }
  }

  /** Camera-standpunt t.o.v. de rider, in het hellingsassenstelsel. */
  setCamera(preset: CameraPreset) {
    this.preset = preset
    const k = this.key ?? (this.keys[0] as FullKey3 | undefined)
    const heading = this.keys[0]?.heading ?? 90
    const { nose, toe } = headingVectors(heading)
    const up = new Vector3(0, 1, 0)
    const down = new Vector3(0, 0, 1)
    let off: Vector3
    switch (preset) {
      case 'achter':
        off = toe.clone().multiplyScalar(-4.4).add(up.clone().multiplyScalar(1.2))
        break
      case 'voor':
        off = nose.clone().multiplyScalar(4.6).add(up.clone().multiplyScalar(1.1))
        break
      case 'boven':
        off = up.clone().multiplyScalar(7.5).add(down.clone().multiplyScalar(-0.6))
        break
      case 'mee':
        off = down.clone().multiplyScalar(-4.3).add(up.clone().multiplyScalar(2.1))
        break
      default:
        off = toe.clone().multiplyScalar(4.4).add(up.clone().multiplyScalar(1.1)).add(nose.clone().multiplyScalar(-0.4))
    }
    const target = this.targetPoint(k)
    off.x *= this.world.scale.x
    off.applyQuaternion(this.world.quaternion)
    this.camera.position.copy(target).add(off)
    this.controls.target.copy(target)
    this.lastTarget.copy(target)
    this.controls.update()
  }

  private targetPoint(k: FullKey3 | null | undefined) {
    const p = this.body ? this.body.j.pelvis.clone().lerp(this.body.boardPos, 0.25) : new Vector3(k?.x ?? 0, 0.7, k?.z ?? 0)
    return this.world.localToWorld(p)
  }

  /** Teken de stand op tijd t (0..1). */
  update(t: number, cue: BodyPart | null = null, time = 0) {
    if (!this.motion || !this.keys.length) return
    const k = sample(this.keys, t) as FullKey3
    this.key = k
    const body = solve(k)
    this.body = body
    this.world.updateMatrixWorld()
    this.rider.update(body, k.edge)
    this.rider.setCue(body, cue, time)
    this.updateTrail(t)

    // camera schuift mee met de rider; draaien blijft van de gebruiker
    const target = this.targetPoint(k)
    const delta = target.clone().sub(this.lastTarget)
    this.camera.position.add(delta)
    this.controls.target.copy(target)
    this.lastTarget.copy(target)
    // zon volgt mee zodat de schaduw scherp blijft
    this.sun.position.copy(target).add(new Vector3(3, 7, 2))
    this.sun.target.position.copy(target)
  }

  private updateTrail(t: number) {
    const pos = this.trailGeo.attributes.position as BufferAttribute
    const n = Math.max(2, Math.min(TRAIL_MAX, Math.round(t * TRAIL_MAX)))
    let prev: FullKey3 | null = null
    for (let i = 0; i < n; i++) {
      const u = (i / (TRAIL_MAX - 1)) * 1
      const k = sample(this.keys, Math.min(t, u)) as FullKey3
      const { nose } = headingVectors(k.heading)
      let dir = nose.clone()
      if (prev) {
        const d = new Vector3(k.x - prev.x, 0, k.z - prev.z)
        if (d.lengthSq() > 1e-6) dir = d.normalize()
      }
      // breedte: hoe dwars het board staat t.o.v. de rijrichting (slippen) vs. strak (carven)
      const skid = Math.abs(nose.clone().cross(dir).y)
      const air = k.y > 0.06 || k.down !== 0
      const w = air ? 0 : 0.07 + skid * 0.75
      const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar(w / 2)
      pos.setXYZ(i * 2, k.x + side.x, 0.004, k.z + side.z)
      pos.setXYZ(i * 2 + 1, k.x - side.x, 0.004, k.z - side.z)
      prev = k
    }
    pos.needsUpdate = true
    this.trailGeo.setDrawRange(0, (n - 1) * 6)
  }

  render() {
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
