// Bewegingsmodel voor de 3D-speler.
// Assenstelsel van de helling (vlak, daarna als geheel gekanteld):
//   x = dwars over de helling (rechts +), z = het dal in (+), y = omhoog.
// Board: `heading` 0 = neus naar +x, 90 = neus recht naar het dal.
// Een regular rider kijkt naar de toe-kant: toe = (-sin h, 0, cos h).
import type { BodyPart, GrabKind, Step } from '../anim/engine'

export type ArmPose = 'uit' | 'los' | 'omhoog' | 'voor' | 'sneeuw'

export interface Key3 {
  t: number
  x?: number
  z?: number
  /** hoogte boven de sneeuw in meters */
  y?: number
  heading?: number
  /** -1 = vol op de heel edge, 0 = plat, 1 = vol op de toe edge */
  edge?: number
  /** graden, + = neus omhoog */
  pitch?: number
  /** 0 = rechtop, 1 = diep door de knieën */
  crouch?: number
  /** gewicht langs het board: -1 tail .. 1 neus */
  lean?: number
  /** romp/schouders gedraaid t.o.v. het board in graden (+ = richting neus open) */
  twist?: number
  /** hoofd gedraaid t.o.v. de borst in graden (0 = naar de tenen, +90 = over de voorste schouder) */
  look?: number
  arms?: ArmPose
  grab?: GrabKind | null
  g?: number
  /** -1 = voorover gevallen, 1 = achterover (op je billen) */
  down?: number
  /** 0 = beide voeten vast, 1 = achterste voet los en op de sneeuw (skaten, lift) */
  free?: number
  /** losse voet: -1 achter je board (afzetten) .. 1 naast je voorste voet */
  stride?: number
}

export type Terrain = 'piste' | 'vlak' | 'kicker' | 'box' | 'rail' | 'bulten' | 'bomen' | 'poeder' | 'lift'

export type CameraPreset = 'zij' | 'achter' | 'voor' | 'boven' | 'mee'

export interface Motion {
  duration: number
  terrain: Terrain
  /** hellingshoek in graden */
  slope: number
  keys: Key3[]
  steps: (Step & { cue?: BodyPart | null })[]
  camera: CameraPreset
}

export const KEY3_DEFAULT: Required<Omit<Key3, 't'>> = {
  x: 0,
  z: 0,
  y: 0,
  heading: 90,
  edge: 0,
  pitch: 0,
  crouch: 0.3,
  lean: 0,
  twist: 0,
  look: 55,
  arms: 'uit',
  grab: null,
  g: 0,
  down: 0,
  free: 0,
  stride: 0,
}

export type FullKey3 = Required<Key3>
