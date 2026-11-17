/**
 * Lasius niger (BU 4 mm; GDD 07 §5.1.1, docs/research/bio-lasius-niger.md): worker 3.4-5 mm, queen 8-9 mm, male
 * 3.5-4.7 mm; one petiole scale, acidopore, silk cocoons; dark brown to blackish, queen brownish black with a
 * massive mesosoma; hyaline wings. Shapes from the ants spike (spike-ants.md section 4), tuned by eye there; the
 * cuticle uses the GDD 08 §11.6 base values (glossy, greyish sheen).
 */
import type { AntColors, AntMorphology } from './types';
import { CUTICLE } from '../tuning';

export const LASIUS_COLORS: AntColors = {
  head: '#2b221d', mesosoma: '#30251f', gaster: '#231d1a', legs: '#3a2c22', tarsi: '#5a4433', antenna: '#3a2c23',
  mandible: '#40261a', teeth: '#1a0f09', eye: '#141312', membrane: '#8c7a5e', hair: '#5f5243',
  wingMembrane: '#c8b896', wingVein: '#6b5034', callow: '#b98a52',
};

export const LASIUS_WORKER: AntMorphology = {
  name: 'lasius-niger|worker',
  bodyLength: 4.0,
  head: { length: 0.235, width: 0.225, height: 0.62, squareness: 2.7, tilt: 0.42, notch: 0.12 },
  mesosoma: { length: 0.33, width: 0.145, height: 0.135, profile: 'worker' },
  gaster: { length: 0.35, width: 0.255, height: 0.215, segments: 5, fullness: 0 },
  petiole: { nodes: 1, shape: 'scale', height: 0.105 },
  mandible: { length: 0.36, teeth: 7, width: 0.42 },
  eye: { size: 0.24, position: 0.52 },
  ocelli: false,
  antenna: { scape: 0.95, funiculus: 1.25, segments: 11, thickness: 1, club: 0 },
  legs: { length: 1.0, thickness: 1.0 },
  spines: { propodeal: 0, pronotal: 0, mesonotal: 0 },
  wings: 'none', wingLength: 0,
  hairs: 70, gasterHairs: 1,
  rearWeapon: 'acidopore',
  colors: LASIUS_COLORS,
  roughness: CUTICLE.roughness, sheen: 0.35, clearcoat: CUTICLE.clearcoat,
  gait: { stride: 0.5, lift: 0.065, duty: 0.55 },
};

/** Mated, dealate queen: big mesosoma (wing muscles), wing stubs, ocelli, fat gaster. */
export const LASIUS_QUEEN: AntMorphology = {
  ...LASIUS_WORKER,
  name: 'lasius-niger|queen',
  bodyLength: 8.6,
  head: { length: 0.17, width: 0.175, height: 0.62, squareness: 2.6, tilt: 0.36, notch: 0.06 },
  mesosoma: { length: 0.355, width: 0.205, height: 0.215, profile: 'alate' },
  gaster: { length: 0.47, width: 0.3, height: 0.255, segments: 5, fullness: 0.2 },
  petiole: { nodes: 1, shape: 'scale', height: 0.085 },
  mandible: { length: 0.33, teeth: 7, width: 0.42 },
  eye: { size: 0.27, position: 0.52 },
  ocelli: true,
  antenna: { scape: 0.85, funiculus: 1.2, segments: 11, thickness: 1.05, club: 0 },
  legs: { length: 0.72, thickness: 1.25 },
  wings: 'stubs', wingLength: 0,
  hairs: 110,
  colors: { ...LASIUS_COLORS, mesosoma: '#2a1f1a', gaster: '#201a17', head: '#251d19' },
  roughness: CUTICLE.roughness - 0.03, sheen: 0.45, clearcoat: CUTICLE.clearcoat,
  gait: { stride: 0.36, lift: 0.045, duty: 0.6 },
};

/** Virgin queen before the nuptial flight: the queen's body plus four wings. */
export const LASIUS_GYNE: AntMorphology = { ...LASIUS_QUEEN, name: 'lasius-niger|gyne', wings: 'full', wingLength: 1.08 };

/** Male: small head, big eyes and ocelli, small mandibles, 12 funicular segments, slender gaster, wings. */
export const LASIUS_MALE: AntMorphology = {
  ...LASIUS_WORKER,
  name: 'lasius-niger|male',
  bodyLength: 4.2,
  head: { length: 0.15, width: 0.165, height: 0.66, squareness: 2.3, tilt: 0.5, notch: 0 },
  mesosoma: { length: 0.37, width: 0.17, height: 0.19, profile: 'male' },
  gaster: { length: 0.37, width: 0.19, height: 0.165, segments: 6, fullness: 0 },
  petiole: { nodes: 1, shape: 'scale', height: 0.07 },
  mandible: { length: 0.22, teeth: 2, width: 0.3 },
  eye: { size: 0.42, position: 0.58 },
  ocelli: true,
  antenna: { scape: 0.75, funiculus: 2.0, segments: 12, thickness: 0.8, club: 0 },
  legs: { length: 1.05, thickness: 0.8 },
  wings: 'full', wingLength: 1.02,
  hairs: 40,
  colors: { ...LASIUS_COLORS, head: '#1d1917', mesosoma: '#1f1a17', gaster: '#221c19', legs: '#5a4634', tarsi: '#7a644c', antenna: '#5b4836', mandible: '#6a4a2c' },
  roughness: CUTICLE.roughness, sheen: 0.4, clearcoat: CUTICLE.clearcoat,
};
