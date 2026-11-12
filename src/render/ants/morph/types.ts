/**
 * The parameter object of the procedural ant generator (one per species x caste x size class).
 * Units: millimetres. Proportions are fractions of `bodyLength` (mandible tip to gaster tip, rest pose, mandibles
 * closed) unless the comment says otherwise. The generator scales the assembled mesh so its real length is exactly
 * `bodyLength`; individual size variation within a variant is a uniform instance scale.
 */

export type PetioleShape = 'scale' | 'node';
/** Side profile of the mesosoma: worker (metanotal groove), arched (evenly convex, Camponotus), alate/male (flight muscles). */
export type MesoProfile = 'worker' | 'arched' | 'alate' | 'male';
export type WingMode = 'none' | 'stubs' | 'full';

export interface AntColors {
  head: string; mesosoma: string; gaster: string; legs: string; tarsi: string; antenna: string;
  mandible: string; teeth: string; eye: string; membrane: string; hair: string;
  wingMembrane: string; wingVein: string;
  /** Freshly eclosed (callow) adults start this colour and darken to the base colours. */
  callow: string;
}

export interface AntMorphology {
  /** Variant key, e.g. 'lasius-niger|worker'. */
  name: string;
  bodyLength: number;
  /** length/width as fraction of bodyLength; height as fraction of head width; squareness = superellipse exponent. */
  head: { length: number; width: number; height: number; squareness: number; /** rest pitch, rad down */ tilt: number; /** posterior emargination 0..1 */ notch: number };
  mesosoma: { length: number; width: number; height: number; profile: MesoProfile };
  gaster: { length: number; width: number; height: number; segments: number; /** extra rest fullness 0..1 */ fullness: number };
  petiole: { nodes: 1 | 2; shape: PetioleShape; height: number };
  /** Mandible length as fraction of head length; teeth count on the masticatory margin; width (fraction of half head width). */
  mandible: { length: number; teeth: number; width: number };
  eye: { size: number; position: number };
  ocelli: boolean;
  /** Scape and funiculus as fraction of head length; funicular segments; thickness multiplier; club 0..1 (thickened apical segments). */
  antenna: { scape: number; funiculus: number; segments: number; thickness: number; club: number };
  legs: { length: number; thickness: number };
  /** Spine lengths as fraction of bodyLength, 0 = none. Atta has three pairs (pronotal, mesonotal, propodeal). */
  spines: { propodeal: number; pronotal: number; mesonotal: number };
  wings: WingMode;
  wingLength: number;
  /** Erect setae count (LOD0 only); gasterHairs multiplies the share on the gaster (Camponotus pale gaster pile). */
  hairs: number;
  gasterHairs: number;
  /** Formicines: acidopore with coronula; myrmicines: sting. */
  rearWeapon: 'acidopore' | 'sting';
  colors: AntColors;
  roughness: number; sheen: number; clearcoat: number;
  /** Clearcoat roughness (default CUTICLE.clearcoatRoughness). */
  clearcoatRoughness?: number;
  /** Stride per gait cycle and swing lift as fraction of bodyLength; duty factor (stance fraction). */
  gait: { stride: number; lift: number; duty: number };
}
