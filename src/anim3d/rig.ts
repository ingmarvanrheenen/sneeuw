// De mannequin: strakke 3D-pop met ronde ledematen in de huisstijl.
// Segmenten hebben vaste lengtes (de IK houdt ze heel), dus capsules hoeven niet te vervormen.
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { BodyPart } from '../anim/engine'
import { BOARD, type Body3 } from './solve'

export interface RigColors {
  jacket: string
  pants: string
  gear: string
  board: string
  accent: string
  heel: string
  toe: string
}

const UP = new Vector3(0, 1, 0)
const tmpQ = new Quaternion()
const tmpM = new Matrix4()

function mat(color: string, rough = 0.62) {
  return new MeshStandardMaterial({ color: new Color(color), roughness: rough, metalness: 0 })
}

/** Snowboard met taille (sidecut) en opgebogen neus en tail. */
function boardGeometry() {
  const L = BOARD.length / 2
  const W = BOARD.width / 2
  const waist = W * 0.86
  const shape = new Shape()
  const N = 24
  // omtrek in (x, z): taille in het midden, ronde tips
  const pts: [number, number][] = []
  for (let i = 0; i <= N; i++) {
    const x = -L * 0.86 + (1.72 * L * i) / N
    const t = x / (L * 0.86)
    pts.push([x, waist + (W - waist) * t * t])
  }
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 12
    pts.push([L * 0.86 + Math.cos(a) * L * 0.14, Math.sin(-a) * W])
  }
  for (let i = N; i >= 0; i--) pts.push([pts[i][0], -pts[i][1]])
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 12
    pts.push([-L * 0.86 + Math.cos(a) * L * 0.14, -Math.sin(a) * W])
  }
  shape.moveTo(pts[0][0], pts[0][1])
  for (const [x, z] of pts.slice(1)) shape.lineTo(x, z)
  const geo = new ExtrudeGeometry(shape, {
    depth: BOARD.thick,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 2,
    curveSegments: 8,
  })
  // shape ligt in XY; draaien naar XZ met de dikte langs Y
  geo.rotateX(Math.PI / 2)
  geo.translate(0, BOARD.thick / 2, 0)
  // tips omhoog buigen
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const ax = Math.abs(x)
    const start = L * 0.8
    if (ax > start) pos.setY(i, pos.getY(i) + 0.42 * (ax - start) ** 2 * (1 / (L * 0.2)))
  }
  geo.computeVertexNormals()
  return geo
}

type JointKey = keyof Body3['j']

interface Segment {
  mesh: Mesh
  a: JointKey
  b: JointKey
}

export class Rider {
  group = new Group()
  boardGroup = new Group()
  private mats: Record<'jacket' | 'pants' | 'gear' | 'board' | 'accent', MeshStandardMaterial>
  private segs: Segment[] = []
  private joints: { mesh: Mesh; at: JointKey }[] = []
  private torso: Mesh
  private pelvis: Mesh
  private head: Mesh
  private goggle: Mesh
  private bootF: Mesh
  private bootB: Mesh
  private edgeHeel: Mesh
  private edgeToe: Mesh
  private halo: Mesh
  private haloMat: MeshBasicMaterial
  private edgeMats: { heel: MeshBasicMaterial; toe: MeshBasicMaterial }

  constructor(c: RigColors) {
    this.mats = {
      jacket: mat(c.jacket, 0.7),
      pants: mat(c.pants, 0.75),
      gear: mat(c.gear, 0.45),
      board: mat(c.board, 0.4),
      accent: mat(c.accent, 0.35),
    }
    const add = (m: Mesh) => {
      m.castShadow = true
      this.group.add(m)
      return m
    }
    const capsule = (r: number, len: number, m: MeshStandardMaterial, a: JointKey, b: JointKey) => {
      const mesh = add(new Mesh(new CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14), m))
      this.segs.push({ mesh, a, b })
    }
    const joint = (r: number, m: MeshStandardMaterial, at: JointKey) => {
      this.joints.push({ mesh: add(new Mesh(new SphereGeometry(r, 18, 14), m)), at })
    }
    // benen
    capsule(0.078, 0.45, this.mats.pants, 'hipF', 'kneeF')
    capsule(0.078, 0.45, this.mats.pants, 'hipB', 'kneeB')
    capsule(0.062, 0.45, this.mats.pants, 'kneeF', 'ankleF')
    capsule(0.062, 0.45, this.mats.pants, 'kneeB', 'ankleB')
    joint(0.07, this.mats.pants, 'kneeF')
    joint(0.07, this.mats.pants, 'kneeB')
    // armen
    capsule(0.056, 0.29, this.mats.jacket, 'shF', 'elbowF')
    capsule(0.056, 0.29, this.mats.jacket, 'shB', 'elbowB')
    capsule(0.05, 0.27, this.mats.jacket, 'elbowF', 'handF')
    capsule(0.05, 0.27, this.mats.jacket, 'elbowB', 'handB')
    joint(0.062, this.mats.jacket, 'shF')
    joint(0.062, this.mats.jacket, 'shB')
    joint(0.052, this.mats.gear, 'handF')
    joint(0.052, this.mats.gear, 'handB')
    capsule(0.05, 0.12, this.mats.jacket, 'neck', 'head')
    // romp, bekken, hoofd
    this.torso = add(new Mesh(new CapsuleGeometry(0.15, 0.24, 8, 18), this.mats.jacket))
    this.pelvis = add(new Mesh(new SphereGeometry(0.13, 18, 14), this.mats.pants))
    this.head = add(new Mesh(new SphereGeometry(0.115, 24, 18), this.mats.gear))
    this.goggle = add(new Mesh(new RoundedBoxGeometry(0.17, 0.065, 0.06, 3, 0.025), this.mats.accent))
    this.bootF = add(new Mesh(new RoundedBoxGeometry(0.13, 0.13, 0.31, 3, 0.04), this.mats.gear))
    this.bootB = add(new Mesh(new RoundedBoxGeometry(0.13, 0.13, 0.31, 3, 0.04), this.mats.gear))

    // board + bindingen + edge-markering
    const board = new Mesh(boardGeometry(), this.mats.board)
    board.castShadow = true
    board.receiveShadow = true
    this.boardGroup.add(board)
    for (const [x, deg] of [
      [BOARD.stance, BOARD.angleF],
      [-BOARD.stance, BOARD.angleB],
    ]) {
      const base = new Mesh(new BoxGeometry(0.16, 0.012, 0.27), this.mats.accent)
      base.position.set(x, BOARD.thick + 0.006, 0)
      base.rotation.y = (-deg * Math.PI) / 180
      const highback = new Mesh(new BoxGeometry(0.15, 0.17, 0.02), this.mats.accent)
      highback.position.set(0, 0.09, -0.13)
      highback.rotation.x = -0.25
      base.add(highback)
      this.boardGroup.add(base)
    }
    this.edgeMats = {
      heel: new MeshBasicMaterial({ color: new Color(c.heel), transparent: true, opacity: 0 }),
      toe: new MeshBasicMaterial({ color: new Color(c.toe), transparent: true, opacity: 0 }),
    }
    this.edgeHeel = new Mesh(new BoxGeometry(BOARD.length * 0.78, 0.022, 0.03), this.edgeMats.heel)
    this.edgeHeel.position.set(0, BOARD.thick / 2, -BOARD.width * 0.45)
    this.edgeToe = new Mesh(new BoxGeometry(BOARD.length * 0.78, 0.022, 0.03), this.edgeMats.toe)
    this.edgeToe.position.set(0, BOARD.thick / 2, BOARD.width * 0.45)
    this.boardGroup.add(this.edgeHeel, this.edgeToe)
    this.group.add(this.boardGroup)

    // coaching-halo: altijd zichtbaar, ook door het lichaam heen
    this.haloMat = new MeshBasicMaterial({ color: new Color(c.accent), transparent: true, opacity: 0, depthTest: false })
    this.halo = new Mesh(new SphereGeometry(0.12, 20, 14), this.haloMat)
    this.halo.renderOrder = 10
    this.group.add(this.halo)
  }

  setColors(c: RigColors) {
    this.mats.jacket.color.set(c.jacket)
    this.mats.pants.color.set(c.pants)
    this.mats.gear.color.set(c.gear)
    this.mats.board.color.set(c.board)
    this.mats.accent.color.set(c.accent)
    this.edgeMats.heel.color.set(c.heel)
    this.edgeMats.toe.color.set(c.toe)
    this.haloMat.color.set(c.accent)
  }

  /** Oriënteer een mesh met lokale Y langs `dir` en lokale X zo dicht mogelijk bij `side`. */
  private orient(mesh: Mesh, dir: Vector3, side: Vector3) {
    const y = dir.clone().normalize()
    const x = side.clone().sub(y.clone().multiplyScalar(side.dot(y)))
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0)
    x.normalize()
    const z = new Vector3().crossVectors(x, y)
    tmpM.makeBasis(x, y, z)
    mesh.quaternion.setFromRotationMatrix(tmpM)
  }

  update(b: Body3, edge: number) {
    for (const s of this.segs) {
      const a = b.j[s.a]
      const c = b.j[s.b]
      s.mesh.position.copy(a).add(c).multiplyScalar(0.5)
      tmpQ.setFromUnitVectors(UP, c.clone().sub(a).normalize())
      s.mesh.quaternion.copy(tmpQ)
    }
    for (const j of this.joints) j.mesh.position.copy(b.j[j.at])

    // romp: van bekken naar nek, breed langs de schouderas
    this.torso.position.copy(b.j.pelvis).lerp(b.j.neck, 0.55)
    this.orient(this.torso, b.spine, b.shoulderAxis)
    this.torso.scale.set(1.12, 1, 0.82)
    this.pelvis.position.copy(b.j.pelvis)
    this.orient(this.pelvis, b.spine, b.j.hipF.clone().sub(b.j.hipB))
    this.pelvis.scale.set(1.25, 0.8, 0.95)

    this.head.position.copy(b.j.head)
    this.goggle.position.copy(b.j.head).add(b.face.clone().multiplyScalar(0.098)).add(b.headUp.clone().multiplyScalar(0.012))
    {
      const z = b.face.clone()
      const y = b.headUp
        .clone()
        .sub(z.clone().multiplyScalar(b.headUp.dot(z)))
        .normalize()
      const x = new Vector3().crossVectors(y, z)
      tmpM.makeBasis(x, y, z)
      this.goggle.quaternion.setFromRotationMatrix(tmpM)
    }

    // boots: zool op het board, neus volgens de bindinghoek
    const boardUp = UP.clone().applyQuaternion(b.boardQuat)
    for (const [boot, ankle, dir] of [
      [this.bootF, b.j.ankleF, b.bootF],
      [this.bootB, b.j.ankleB, b.bootB],
    ] as const) {
      boot.position.copy(ankle).add(boardUp.clone().multiplyScalar(-0.035)).add(dir.clone().multiplyScalar(0.03))
      const z = dir.clone()
      const x = new Vector3().crossVectors(boardUp, z).normalize()
      const y = new Vector3().crossVectors(z, x)
      tmpM.makeBasis(x, y, z)
      boot.quaternion.setFromRotationMatrix(tmpM)
    }

    this.boardGroup.position.copy(b.boardPos)
    this.boardGroup.quaternion.copy(b.boardQuat)
    // de edge die in de sneeuw staat licht op in heel- of toe-kleur
    this.edgeMats.heel.opacity = Math.min(1, Math.max(0, -edge - 0.08) * 2.2)
    this.edgeMats.toe.opacity = Math.min(1, Math.max(0, edge - 0.08) * 2.2)
  }

  /** Waar zit een lichaamsdeel (voor de coaching-halo). */
  partPosition(b: Body3, part: BodyPart): Vector3 {
    const j = b.j
    const mid = (p: Vector3, q: Vector3) => p.clone().add(q).multiplyScalar(0.5)
    const boardPoint = (x: number, z: number) => new Vector3(x, BOARD.thick, z).applyQuaternion(b.boardQuat).add(b.boardPos)
    switch (part) {
      case 'head':
        return j.head.clone()
      case 'shoulders':
        return mid(j.shF, j.shB)
      case 'hands':
        return mid(j.handF, j.handB)
      case 'front-hand':
        return j.handF.clone()
      case 'back-hand':
        return j.handB.clone()
      case 'hips':
        return j.pelvis.clone()
      case 'knees':
        return mid(j.kneeF, j.kneeB)
      case 'front-foot':
        return j.ankleF.clone()
      case 'back-foot':
        return j.ankleB.clone()
      case 'nose':
        return boardPoint(BOARD.length * 0.46, 0)
      case 'tail':
        return boardPoint(-BOARD.length * 0.46, 0)
      case 'heel-edge':
        return boardPoint(0, -BOARD.width / 2)
      case 'toe-edge':
        return boardPoint(0, BOARD.width / 2)
      default:
        return b.boardPos.clone()
    }
  }

  setCue(b: Body3 | null, part: BodyPart | null, time: number) {
    if (!b || !part) {
      this.haloMat.opacity = 0
      return
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 5)
    this.halo.position.copy(this.partPosition(b, part))
    const big = part === 'board' ? 2.4 : part === 'heel-edge' || part === 'toe-edge' ? 1.4 : 1
    this.halo.scale.setScalar(big * (1 + 0.25 * pulse))
    this.haloMat.opacity = 0.22 + 0.2 * pulse
  }
}
