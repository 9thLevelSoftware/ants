/**
 * Shared geometry contracts of the ant generator: part ids, per-variant rig constants, the variant record and the
 * LOD table.
 *
 * Body frame (BINDING for the shader and the CPU): millimetres, +Y up (surface normal), +Z forward (head), +X = the
 * ant's LEFT, origin on the walking surface directly below the mid coxae. Instance matrices place this frame in the
 * world (Object3D.lookAt convention: +Z points at the target).
 */
import type { BufferGeometry } from 'three';
import type { AntMorphology } from '../morph/types';
import type { V3 } from './meshBuilder';

/**
 * aRig.x part ids. aux (aRig.w): HEAD 0 cuticle / 1 compound eye / 2 ocellus; GASTER 0 sclerite / 1 membrane;
 * ITEM = roughness. Creatures reuse this scheme with their own ids >= 16.
 */
export const PART = { BODY: 0, HEAD: 1, MANDIBLE: 2, SCAPE: 3, FUNICULUS: 4, LEG: 5, GASTER: 6, WING: 7, ITEM: 8, PETIOLE: 9 } as const;

export type V4 = [number, number, number, number];

/** Per-variant rig constants (uploaded as uniforms; identical for all LODs of the variant). Body frame, mm. */
export interface AntRig {
  bodyLength: number;
  /** [pair] xyz = LEFT coxa attachment, w = tarsus elevation angle (rad). */
  legA: V4[];
  /** [pair] xyz = LEFT rest foot position (y = 0), w = coxa angle from vertical (rad). */
  foot: V4[];
  /** [pair] coxa, femur, tibia, tarsus length. */
  legLen: V4[];
  /** stride length (mm per cycle), swing lift (mm), duty factor, body bob amplitude (mm). */
  gait: V4;
  neck: V3; headUp: V3; headFwd: V3; headTilt: number;
  /** LEFT mandible hinge. */
  mand: V3;
  /** LEFT antenna socket and elbow, elbow hinge axis. */
  socket: V3; elbow: V3; elbowAxis: V3;
  gasterPivot: V3; gasterC: V3; gasterAxis: V3;
  /** radial swell gain, axial gap per band (mm), band count, petiole follow fraction. */
  gasterP: V4;
  petPivot: V3;
  /** Where carried items are held (between the closed mandible tips). */
  grip: V3;
  /** LEFT fore-tarsus target while grooming the antenna. */
  groom: V3;
  /** Linear colour of stretched intersegmental membrane, and of a callow adult. */
  membrane: V3;
  callow: V3;
  /** Ommatidium diameter (mm) for the eye shader. */
  facet: number;
  /** Gaster tip (rest), body frame: corpses and stinging poses use it. */
  gasterTip: V3;
}

export interface AntVariant {
  /** Index in the renderer's variant table. */
  id: number;
  key: string;
  morph: AntMorphology;
  rig: AntRig;
  /** LOD0 (near) .. LOD3 (crowd). */
  lods: BufferGeometry[];
  wings: BufferGeometry | null;
  /** Triangles per LOD (body) and of the wing mesh. */
  tris: number[];
  wingTris: number;
}

export interface Lod {
  level: number; headRad: number; headRings: number; mesoRad: number; mesoRings: number; gasRad: number; ringsPerBand: number;
  petRad: number; legRad: number; legDetail: number; eyeRings: number; eyeRad: number; antRad: number; funRings: number;
  hairs: boolean; palps: boolean; teeth: boolean; ocelli: boolean; eyes: boolean; coxa: boolean; extras: boolean;
}

/** LOD contents (spike-ants.md section 2): 0 full, 1 reduced, 2 far, 3 minimal crowd body (still animated). */
export const LODS: Lod[] = [
  { level: 0, headRad: 16, headRings: 13, mesoRad: 14, mesoRings: 20, gasRad: 14, ringsPerBand: 3, petRad: 10, legRad: 5, legDetail: 2, eyeRings: 7, eyeRad: 9, antRad: 5, funRings: 2, hairs: true, palps: true, teeth: true, ocelli: true, eyes: true, coxa: true, extras: true },
  { level: 1, headRad: 7, headRings: 6, mesoRad: 6, mesoRings: 7, gasRad: 7, ringsPerBand: 0, petRad: 4, legRad: 3, legDetail: 1, eyeRings: 3, eyeRad: 4, antRad: 3, funRings: 0, hairs: false, palps: false, teeth: false, ocelli: false, eyes: true, coxa: false, extras: false },
  { level: 2, headRad: 4, headRings: 4, mesoRad: 4, mesoRings: 4, gasRad: 5, ringsPerBand: -1, petRad: 3, legRad: 3, legDetail: 0, eyeRings: 0, eyeRad: 0, antRad: 3, funRings: 0, hairs: false, palps: false, teeth: false, ocelli: false, eyes: false, coxa: false, extras: false },
  { level: 3, headRad: 4, headRings: 2, mesoRad: 4, mesoRings: 2, gasRad: 4, ringsPerBand: -1, petRad: 3, legRad: 2, legDetail: -1, eyeRings: 0, eyeRad: 0, antRad: 3, funRings: 0, hairs: false, palps: false, teeth: false, ocelli: false, eyes: false, coxa: false, extras: false },
];
