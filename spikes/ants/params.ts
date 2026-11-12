/**
 * Ant parameter object + presets (spike). Units: millimetres. All proportions are fractions of
 * `bodyLength` (mandible tip to gaster tip, rest pose, mandibles closed) unless the comment says otherwise.
 * The generator normalises the assembled mesh so its real length is exactly `bodyLength`.
 *
 * Biology sources for the Lasius niger numbers: docs/research/bio-lasius-niger.md
 * (worker 3.4-5 mm, queen 8-9 mm, male 3.5-4.7 mm, single petiole scale, acidopore, silk cocoons,
 * dark brown to blackish, queen brownish black with a massive mesosoma, hyaline wings).
 */

export type PetioleShape = 'scale' | 'node';
export type MesoProfile = 'worker' | 'alate' | 'male';
export type WingMode = 'none' | 'stubs' | 'full';

export interface AntColors {
  head: string; mesosoma: string; gaster: string; legs: string; tarsi: string; antenna: string;
  mandible: string; teeth: string; eye: string; membrane: string; hair: string;
  wingMembrane: string; wingVein: string;
}

export interface AntParams {
  name: string;
  /** mm, mandible tip to gaster tip */
  bodyLength: number;
  /** length/width as fraction of bodyLength; height as fraction of head width; squareness = superellipse exponent (2 = ellipse, 3-4 = boxy) */
  head: { length: number; width: number; height: number; squareness: number; /** rest pitch, radians down from horizontal */ tilt: number; /** posterior emargination 0..1 (heart-shaped majors) */ notch: number };
  mesosoma: { length: number; width: number; height: number; profile: MesoProfile };
  gaster: { length: number; width: number; height: number; /** visible tergites */ segments: number; /** extra crop fullness baked into rest shape 0..1 (queens are naturally fat) */ fullness: number };
  petiole: { nodes: 1 | 2; shape: PetioleShape; /** node height, fraction of bodyLength */ height: number };
  /** mandible length as fraction of head length, teeth count on the masticatory margin */
  mandible: { length: number; teeth: number; width: number };
  /** eye length as fraction of head length; position 0 (occiput) .. 1 (clypeus) */
  eye: { size: number; position: number };
  ocelli: boolean;
  /** scape and funiculus lengths as fraction of head length; funicular segment count (worker/queen 11, male 12 in Lasius) */
  antenna: { scape: number; funiculus: number; segments: number; thickness: number };
  /** multiplier on the standard worker leg lengths, thickness multiplier */
  legs: { length: number; thickness: number };
  /** spine length as fraction of bodyLength, 0 = off */
  spines: { propodeal: number; pronotal: number };
  wings: WingMode;
  /** forewing length as fraction of bodyLength */
  wingLength: number;
  /** number of erect setae (LOD0 only) */
  hairs: number;
  colors: AntColors;
  /** cuticle roughness (0 glossy .. 1 matt), pubescence sheen 0..1, clearcoat 0..1 */
  roughness: number; sheen: number; clearcoat: number;
  /** stride length per gait cycle (fraction of bodyLength), swing lift (fraction of bodyLength), duty factor (stance fraction) */
  gait: { stride: number; lift: number; duty: number };
}

const lasiusColors: AntColors = {
  head: '#2b221d', mesosoma: '#30251f', gaster: '#231d1a', legs: '#3a2c22', tarsi: '#5a4433', antenna: '#3a2c23',
  mandible: '#40261a', teeth: '#1a0f09', eye: '#141312', membrane: '#bba98a', hair: '#5f5243',
  wingMembrane: '#c8b896', wingVein: '#6b5034',
};

export const LASIUS_WORKER: AntParams = {
  name: 'Lasius niger worker',
  bodyLength: 4.0,
  head: { length: 0.235, width: 0.225, height: 0.62, squareness: 2.7, tilt: 0.42, notch: 0.12 },
  mesosoma: { length: 0.33, width: 0.145, height: 0.135, profile: 'worker' },
  gaster: { length: 0.35, width: 0.255, height: 0.215, segments: 5, fullness: 0 },
  petiole: { nodes: 1, shape: 'scale', height: 0.105 },
  mandible: { length: 0.36, teeth: 7, width: 0.42 },
  eye: { size: 0.24, position: 0.52 },
  ocelli: false,
  antenna: { scape: 0.95, funiculus: 1.25, segments: 11, thickness: 1 },
  legs: { length: 1.0, thickness: 1.0 },
  spines: { propodeal: 0, pronotal: 0 },
  wings: 'none', wingLength: 0,
  hairs: 70,
  colors: lasiusColors,
  roughness: 0.42, sheen: 0.3, clearcoat: 0.3,
  gait: { stride: 0.5, lift: 0.065, duty: 0.55 },
};

/** Mated, dealate founding queen: big mesosoma (wing muscles), wing stubs, ocelli, fat gaster. */
export const LASIUS_QUEEN: AntParams = {
  ...LASIUS_WORKER,
  name: 'Lasius niger queen (dealate)',
  bodyLength: 8.6,
  head: { length: 0.17, width: 0.175, height: 0.62, squareness: 2.6, tilt: 0.36, notch: 0.06 },
  mesosoma: { length: 0.355, width: 0.205, height: 0.215, profile: 'alate' },
  gaster: { length: 0.47, width: 0.3, height: 0.255, segments: 5, fullness: 0.2 },
  petiole: { nodes: 1, shape: 'scale', height: 0.085 },
  mandible: { length: 0.33, teeth: 7, width: 0.42 },
  eye: { size: 0.27, position: 0.52 },
  ocelli: true,
  antenna: { scape: 0.85, funiculus: 1.2, segments: 11, thickness: 1.05 },
  legs: { length: 0.72, thickness: 1.25 },
  wings: 'stubs', wingLength: 0,
  hairs: 110,
  colors: { ...lasiusColors, mesosoma: '#2a1f1a', gaster: '#201a17', head: '#251d19' },
  roughness: 0.32, sheen: 0.45, clearcoat: 0.55,
  gait: { stride: 0.36, lift: 0.045, duty: 0.6 },
};

/** Virgin queen (gyne) before the nuptial flight: same body as the queen plus four hyaline wings. */
export const LASIUS_GYNE: AntParams = {
  ...LASIUS_QUEEN,
  name: 'Lasius niger gyne (winged virgin queen)',
  wings: 'full', wingLength: 1.08,
};

/** Male: small head, big eyes and ocelli, small mandibles, 12 funicular segments, slender gaster, wings, paler legs. */
export const LASIUS_MALE: AntParams = {
  ...LASIUS_WORKER,
  name: 'Lasius niger male',
  bodyLength: 4.2,
  head: { length: 0.15, width: 0.165, height: 0.66, squareness: 2.3, tilt: 0.5, notch: 0 },
  mesosoma: { length: 0.37, width: 0.17, height: 0.19, profile: 'male' },
  gaster: { length: 0.37, width: 0.19, height: 0.165, segments: 6, fullness: 0 },
  petiole: { nodes: 1, shape: 'scale', height: 0.07 },
  mandible: { length: 0.22, teeth: 2, width: 0.3 },
  eye: { size: 0.42, position: 0.58 },
  ocelli: true,
  antenna: { scape: 0.75, funiculus: 2.0, segments: 12, thickness: 0.8 },
  legs: { length: 1.05, thickness: 0.8 },
  wings: 'full', wingLength: 1.02,
  hairs: 40,
  colors: { ...lasiusColors, head: '#1d1917', mesosoma: '#1f1a17', gaster: '#221c19', legs: '#5a4634', tarsi: '#7a644c', antenna: '#5b4836', mandible: '#6a4a2c' },
  roughness: 0.4, sheen: 0.4, clearcoat: 0.4,
};

/** Generic polymorphic myrmicine (seed harvester-like): two petiole nodes, short propodeal spines. */
const myrmColors: AntColors = {
  ...lasiusColors, head: '#4a1e12', mesosoma: '#2a1712', gaster: '#1c1311', legs: '#3a2218', tarsi: '#5c3b26',
  antenna: '#3e2419', mandible: '#3a1a0e', teeth: '#140a06',
};

export const GENERIC_MAJOR: AntParams = {
  ...LASIUS_WORKER,
  name: 'generic major (big-headed, 2 nodes)',
  bodyLength: 9.0,
  head: { length: 0.33, width: 0.36, height: 0.6, squareness: 3.0, tilt: 0.33, notch: 0.5 },
  mesosoma: { length: 0.27, width: 0.13, height: 0.12, profile: 'worker' },
  gaster: { length: 0.27, width: 0.21, height: 0.18, segments: 4, fullness: 0 },
  petiole: { nodes: 2, shape: 'node', height: 0.075 },
  mandible: { length: 0.36, teeth: 4, width: 0.5 },
  eye: { size: 0.13, position: 0.42 },
  antenna: { scape: 0.6, funiculus: 0.8, segments: 10, thickness: 1.0 },
  legs: { length: 0.78, thickness: 1.15 },
  spines: { propodeal: 0.03, pronotal: 0 },
  hairs: 90,
  colors: myrmColors,
  roughness: 0.38, sheen: 0.3, clearcoat: 0.5,
  gait: { stride: 0.42, lift: 0.055, duty: 0.55 },
};

export const GENERIC_MEDIA: AntParams = {
  ...GENERIC_MAJOR,
  name: 'generic media',
  bodyLength: 6.5,
  head: { length: 0.27, width: 0.27, height: 0.6, squareness: 2.8, tilt: 0.38, notch: 0.25 },
  mesosoma: { length: 0.3, width: 0.13, height: 0.125, profile: 'worker' },
  gaster: { length: 0.3, width: 0.22, height: 0.185, segments: 4, fullness: 0 },
  mandible: { length: 0.36, teeth: 5, width: 0.46 },
  eye: { size: 0.17, position: 0.45 },
  antenna: { scape: 0.75, funiculus: 0.95, segments: 10, thickness: 1.0 },
  legs: { length: 0.9, thickness: 1.05 },
  colors: { ...myrmColors, head: '#3a1a10' },
};

export const GENERIC_MINIM: AntParams = {
  ...GENERIC_MAJOR,
  name: 'generic minim',
  bodyLength: 3.2,
  head: { length: 0.22, width: 0.2, height: 0.62, squareness: 2.4, tilt: 0.42, notch: 0 },
  mesosoma: { length: 0.33, width: 0.13, height: 0.13, profile: 'worker' },
  gaster: { length: 0.33, width: 0.23, height: 0.19, segments: 4, fullness: 0 },
  petiole: { nodes: 2, shape: 'node', height: 0.08 },
  mandible: { length: 0.34, teeth: 6, width: 0.4 },
  eye: { size: 0.2, position: 0.5 },
  antenna: { scape: 0.95, funiculus: 1.2, segments: 10, thickness: 0.95 },
  legs: { length: 1.08, thickness: 0.95 },
  spines: { propodeal: 0.022, pronotal: 0 },
  hairs: 50,
  colors: { ...myrmColors, head: '#2a1712' },
  gait: { stride: 0.5, lift: 0.065, duty: 0.55 },
};

export const PRESETS = {
  worker: LASIUS_WORKER,
  queen: LASIUS_QUEEN,
  gyne: LASIUS_GYNE,
  male: LASIUS_MALE,
  major: GENERIC_MAJOR,
  media: GENERIC_MEDIA,
  minim: GENERIC_MINIM,
} as const;
export type PresetName = keyof typeof PRESETS;
