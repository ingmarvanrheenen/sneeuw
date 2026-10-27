// Lichaams-solver: van een keyframe naar gewrichtsposities in het hellingsassenstelsel.
// Het lichaam wordt opgebouwd in het assenstelsel van het board (X = neus, Y = omhoog, Z = tenen),
// zodat kantelen op de edge automatisch ook het lichaam de bocht in laat hangen.
// Benen en armen worden met two-bone IK opgelost: voeten blijven in de bindingen.
import { Quaternion, Vector3 } from 'three'
import type { GrabKind } from '../anim/engine'
import type { ArmPose, FullKey3 } from './types'

export const BOARD = { length: 1.55, width: 0.26, thick: 0.02, stance: 0.27, angleF: 15, angleB: -15 }
const L = BOARD.length
const W = BOARD.width
const S = BOARD.stance
const TOP = BOARD.thick / 2
const ANKLE = TOP + 0.085
const THIGH = 0.45
const SHIN = 0.45
const UPPER = 0.29
const FORE = 0.27
const SPINE = 0.47
export const MAX_ROLL = (42 * Math.PI) / 180

export const GRAB: Record<GrabKind, { hand: 'F' | 'B'; x: number; z: number }> = {
  indy: { hand: 'B', x: -0.03, z: 1 },
  mute: { hand: 'F', x: 0.3, z: 1 },
  melon: { hand: 'F', x: 0.05, z: -1 },
  stalefish: { hand: 'B', x: -0.15, z: -1 },
  nose: { hand: 'F', x: 0.95, z: 0 },
  tail: { hand: 'B', x: -0.95, z: 0 },
  method: { hand: 'F', x: 0, z: -1 },
  japan: { hand: 'F', x: 0.35, z: 1 },
  roast: { hand: 'B', x: -0.3, z: -1 },
  seatbelt: { hand: 'F', x: -0.85, z: 0 },
}

export interface Body3 {
  boardPos: Vector3
  boardQuat: Quaternion
  roll: number
  j: Record<
    | 'pelvis'
    | 'hipF'
    | 'hipB'
    | 'kneeF'
    | 'kneeB'
    | 'ankleF'
    | 'ankleB'
    | 'chest'
    | 'neck'
    | 'head'
    | 'shF'
    | 'shB'
    | 'elbowF'
    | 'elbowB'
    | 'handF'
    | 'handB',
    Vector3
  >
  /** kijkrichting van het gezicht (wereld) */
  face: Vector3
  /** omhoog-richting van het hoofd (wereld) */
  headUp: Vector3
  /** neusrichting van de boots (wereld) */
  bootF: Vector3
  bootB: Vector3
  /** ruggengraat-richting (wereld) */
  spine: Vector3
  /** schouderas (wereld, van achter naar voor) */
  shoulderAxis: Vector3
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
const Y = v(0, 1, 0)

/** Two-bone IK: plaats het middelste gewricht zodat beide segmenten hun lengte houden. */
export function ik(root: Vector3, target: Vector3, l1: number, l2: number, pole: Vector3): Vector3 {
  const delta = target.clone().sub(root)
  const d = Math.min(Math.max(delta.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
  const dir = delta.normalize()
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)))
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1)
  p.normalize()
  return root.clone().add(dir.multiplyScalar(a)).add(p.multiplyScalar(h))
}

const rotY = (vec: Vector3, a: number) => vec.clone().applyAxisAngle(Y, a)

export function boardQuaternion(heading: number, pitch: number, roll: number): Quaternion {
  const yaw = new Quaternion().setFromAxisAngle(Y, (-heading * Math.PI) / 180)
  const pq = new Quaternion().setFromAxisAngle(v(0, 0, 1), (pitch * Math.PI) / 180)
  const rq = new Quaternion().setFromAxisAngle(v(1, 0, 0), roll)
  return yaw.multiply(pq).multiply(rq)
}

export function solve(k: FullKey3 & { arms2?: ArmPose; armsMix?: number }): Body3 {
  // > 1 = tuck in de lucht: knieën naar je borst (grabs)
  const crouch = Math.max(0, Math.min(1.6, k.crouch))
  const bend = Math.min(1, crouch)
  const grabbing = k.grab ? Math.max(0, Math.min(1, k.g)) : 0
  const roll = Math.max(-1.7, Math.min(1.7, k.edge)) * MAX_ROLL
  const quat = boardQuaternion(k.heading, k.pitch, roll)
  // Board draait om de edge die in de sneeuw staat. Bij pitch kan de tip niet onder de sneeuw:
  // het midden zit minstens zo hoog als de tip dat toelaat (press, pop), daarboven telt de sprong.
  const edgeLift = (W / 2) * Math.abs(Math.sin(roll))
  const tipLift = (L / 2) * Math.abs(Math.sin((k.pitch * Math.PI) / 180))
  const boardPos = v(k.x, Math.max(k.y, tipLift) + TOP + edgeLift, k.z)

  // ── lichaam in board-coördinaten ──
  const ankleF = v(S, ANKLE, 0)
  const ankleBound = v(-S, ANKLE, 0)
  const free = Math.max(0, Math.min(1, k.free))
  const ankleFree = v(-0.06 + 0.22 * k.stride, ANKLE - BOARD.thick - 0.01, 0.32)
  const lifted = v(-S * 0.6, ANKLE + 0.12, 0.12)
  const ankleB = free < 0.5 ? ankleBound.clone().lerp(lifted, free * 2) : lifted.clone().lerp(ankleFree, (free - 0.5) * 2)

  const H = 0.86 - 0.37 * crouch - Math.abs(k.down) * 0.22
  const pelvis = v(k.lean * 0.12 + 0.07 * free, H, -0.05 - 0.1 * bend)
  const twist = (k.twist * Math.PI) / 180
  const pelvisAxis = rotY(v(1, 0, 0), twist * 0.35)
  let hipF = pelvis.clone().add(pelvisAxis.clone().multiplyScalar(0.09))
  let hipB = pelvis.clone().sub(pelvisAxis.clone().multiplyScalar(0.09))

  // op de toe edge blijft de borst omhoog: knieën gaan de bocht in, niet het hoofd
  // bij een grab buig je iets mee naar het board (niet bukken: het werk zit in je knieën)
  const fwd = 0.12 + 0.5 * bend + 0.32 * grabbing - 0.45 * Math.max(0, Math.sin(roll))
  const side = k.lean * 0.15
  let spine = v(Math.sin(side), Math.cos(fwd), Math.sin(fwd)).normalize()
  let neck = pelvis.clone().add(spine.clone().multiplyScalar(SPINE))
  let axis = rotY(v(1, 0, 0), twist)
  let fwdDir = rotY(v(0, 0, 1), twist)
    .multiplyScalar(Math.cos(fwd))
    .add(v(0, -Math.sin(fwd), 0))
    .normalize()
  let shF = neck.clone().sub(spine.clone().multiplyScalar(0.04)).add(axis.clone().multiplyScalar(0.19))
  let shB = neck.clone().sub(spine.clone().multiplyScalar(0.04)).sub(axis.clone().multiplyScalar(0.19))
  let head = neck.clone().add(spine.clone().multiplyScalar(0.19))
  let face = rotY(v(0, 0, 1), twist + (k.look * Math.PI) / 180)
  let chest = pelvis.clone().add(spine.clone().multiplyScalar(SPINE * 0.62))

  // rechtop blijven terwijl het board onder je kantelt: bovenlijf terugdraaien om het midden tussen de voeten
  // pitch eerst terug naar -180..180: na een flip is 330° gewoon -30°
  const pitchN = ((((k.pitch + 180) % 360) + 360) % 360) - 180
  const upright = Math.max(0, Math.min(1, k.upright ?? 0)) * ((-pitchN * Math.PI) / 180)
  if (upright) {
    const piv = v(0, ANKLE, 0)
    const Z = v(0, 0, 1)
    for (const p of [pelvis, hipF, hipB, neck, shF, shB, head, chest]) p.sub(piv).applyAxisAngle(Z, upright).add(piv)
    for (const d of [spine, face, axis, fwdDir]) d.applyAxisAngle(Z, upright)
  }

  // handen per armhouding (in het assenstelsel van de borst)
  const at = (base: Vector3, a: number, f: number, u: number) =>
    base.clone().add(axis.clone().multiplyScalar(a)).add(fwdDir.clone().multiplyScalar(f)).add(spine.clone().multiplyScalar(u))
  const handsFor = (arms: ArmPose): [Vector3, Vector3] => {
    switch (arms) {
      case 'los':
        return [at(shF, 0.05, 0.1, -0.52), at(shB, -0.05, 0.1, -0.52)]
      case 'omhoog':
        return [at(shF, 0.15, 0.1, 0.42), at(shB, -0.15, 0.1, 0.42)]
      case 'voor':
        return [at(shF, 0.05, 0.45, -0.18), at(shB, -0.05, 0.45, -0.18)]
      case 'sneeuw':
        return [at(shF, 0.1, 0.35, -0.62), at(shB, -0.3, 0.1, -0.3)]
      default:
        return [at(shF, 0.36, 0.14, -0.33), at(shB, -0.34, 0.12, -0.37)]
    }
  }
  let [handF, handB] = handsFor(k.arms)
  if (k.arms2 && k.armsMix) {
    const [f2, b2] = handsFor(k.arms2)
    handF.lerp(f2, k.armsMix)
    handB.lerp(b2, k.armsMix)
  }
  if (k.grab && k.g > 0) {
    const gt = GRAB[k.grab]
    const p = v((gt.x * L) / 2, TOP + 0.03, ((gt.z * W) / 2) * 1.05)
    // de schouder van de grijphand zakt naar de grab toe (bij heelside grabs: achter je been langs)
    const sh = gt.hand === 'F' ? shF : shB
    sh.add(
      p
        .clone()
        .sub(sh)
        .multiplyScalar(0.22 * grabbing),
    )
    if (gt.hand === 'F') handF = handF.lerp(p, k.g)
    else handB = handB.lerp(p, k.g)
  }

  // vallen: lichaam kantelt om de lijn van de voeten (heel = achterover)
  if (k.down) {
    const ang = -k.down * 1.3
    const piv = v(0, ANKLE, 0)
    const rot = (p: Vector3) =>
      p
        .sub(piv)
        .applyAxisAngle(v(1, 0, 0), ang)
        .add(piv)
    for (const p of [pelvis, hipF, hipB, neck, shF, shB, head, chest, handF, handB]) rot(p)
    spine = spine.applyAxisAngle(v(1, 0, 0), ang)
    face = face.applyAxisAngle(v(1, 0, 0), ang)
    axis = axis.applyAxisAngle(v(1, 0, 0), ang)
    fwdDir = fwdDir.applyAxisAngle(v(1, 0, 0), ang)
  }

  // angulatie: heupen de bocht in, bovenlijf blijft rechter dan het board
  if (roll && !k.down) {
    const ang = -roll * 0.32
    const into = v(0, 0, Math.sin(roll) * 0.07)
    const piv = pelvis.clone()
    for (const p of [neck, shF, shB, head, chest, handF, handB])
      p.sub(piv)
        .applyAxisAngle(v(1, 0, 0), ang)
        .add(piv)
        .add(into)
    for (const p of [pelvis, hipF, hipB]) p.add(into)
    spine = spine.applyAxisAngle(v(1, 0, 0), ang)
    face = face.applyAxisAngle(v(1, 0, 0), ang)
    axis = axis.applyAxisAngle(v(1, 0, 0), ang)
    fwdDir = fwdDir.applyAxisAngle(v(1, 0, 0), ang)
  }

  // IK: knieën wijzen naar de tenen en iets mee met de bindinghoeken
  const kneeF = ik(hipF, ankleF, THIGH, SHIN, v(0.35, 0.1, 1))
  const kneeB = ik(hipB, ankleB, THIGH, SHIN, v(-0.35, 0.1, 1))
  const elbowPoleF = spine.clone().multiplyScalar(-1).add(axis.clone().multiplyScalar(0.4)).add(fwdDir.clone().multiplyScalar(-0.2))
  const elbowPoleB = spine.clone().multiplyScalar(-1).add(axis.clone().multiplyScalar(-0.4)).add(fwdDir.clone().multiplyScalar(-0.2))
  const elbowF = ik(shF, handF, UPPER, FORE, shF.clone().add(elbowPoleF))
  const elbowB = ik(shB, handB, UPPER, FORE, shB.clone().add(elbowPoleB))
  // handen op armlengte houden als het doel buiten bereik lag
  const reach = (el: Vector3, hand: Vector3) => {
    const d = hand.clone().sub(el)
    return d.length() > FORE ? el.clone().add(d.setLength(FORE)) : hand
  }
  handF = reach(elbowF, handF)
  handB = reach(elbowB, handB)
  hipF = hipF.clone()
  hipB = hipB.clone()

  // ── naar het hellingsassenstelsel ──
  const toWorld = (p: Vector3) => p.clone().applyQuaternion(quat).add(boardPos)
  const dirWorld = (d: Vector3) => d.clone().applyQuaternion(quat).normalize()
  const bootAngle = (deg: number) => rotY(v(0, 0, 1), (deg * Math.PI) / 180)

  return {
    boardPos,
    boardQuat: quat,
    roll,
    j: {
      pelvis: toWorld(pelvis),
      hipF: toWorld(hipF),
      hipB: toWorld(hipB),
      kneeF: toWorld(kneeF),
      kneeB: toWorld(kneeB),
      ankleF: toWorld(ankleF),
      ankleB: toWorld(ankleB),
      chest: toWorld(chest),
      neck: toWorld(neck),
      head: toWorld(head),
      shF: toWorld(shF),
      shB: toWorld(shB),
      elbowF: toWorld(elbowF),
      elbowB: toWorld(elbowB),
      handF: toWorld(handF),
      handB: toWorld(handB),
    },
    face: dirWorld(face),
    headUp: dirWorld(spine),
    bootF: dirWorld(bootAngle(BOARD.angleF)),
    bootB: dirWorld(free > 0.5 ? v(0, 0, 1) : bootAngle(BOARD.angleB)),
    spine: dirWorld(spine),
    shoulderAxis: dirWorld(axis),
  }
}

/** Richting van neus en tenen in het hellingsvlak (zonder kanteling). */
export function headingVectors(heading: number) {
  const h = (heading * Math.PI) / 180
  return { nose: v(Math.cos(h), 0, Math.sin(h)), toe: v(-Math.sin(h), 0, Math.cos(h)) }
}
