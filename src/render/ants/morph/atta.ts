/**
 * Atta texana (BU 7 mm; GDD 07 §5.4.1, docs/research/bio-atta.md): rusty brown, matte, spiny (three pairs of
 * thoracic spines), two-node waist, strongly polymorphic: minim 0.35 BU, small media 0.7, media 1.0, major 1.8
 * (huge heart-shaped head), queen 2.6, male 1.9. Myrmicine: naked pupae. Worker antennae 11-segmented.
 */
import type { AntColors, AntMorphology } from './types';

const COLORS: AntColors = {
  head: '#5c2f18', mesosoma: '#60321a', gaster: '#4e2915', legs: '#6a3b20', tarsi: '#7c4a2c', antenna: '#66391d',
  mandible: '#3a1b0c', teeth: '#140804', eye: '#141110', membrane: '#c9ad86', hair: '#a87a4e',
  wingMembrane: '#c8b27c', wingVein: '#6a4a26', callow: '#d0a476',
};

export const ATTA_MEDIA: AntMorphology = {
  name: 'atta-texana|media',
  bodyLength: 7.0,
  head: { length: 0.27, width: 0.27, height: 0.62, squareness: 2.6, tilt: 0.4, notch: 0.35 },
  mesosoma: { length: 0.32, width: 0.12, height: 0.13, profile: 'worker' },
  gaster: { length: 0.26, width: 0.2, height: 0.17, segments: 4, fullness: 0 },
  petiole: { nodes: 2, shape: 'node', height: 0.075 },
  mandible: { length: 0.36, teeth: 7, width: 0.44 },
  eye: { size: 0.15, position: 0.45 },
  ocelli: false,
  antenna: { scape: 1.0, funiculus: 1.1, segments: 10, thickness: 0.95, club: 0.1 },
  legs: { length: 1.15, thickness: 0.9 },
  spines: { propodeal: 0.045, pronotal: 0.04, mesonotal: 0.025 },
  wings: 'none', wingLength: 0,
  hairs: 45, gasterHairs: 0.6,
  rearWeapon: 'sting',
  colors: COLORS,
  roughness: 0.72, sheen: 0.2, clearcoat: 0.05,
  gait: { stride: 0.5, lift: 0.065, duty: 0.55 },
};

export const ATTA_SMALL_MEDIA: AntMorphology = {
  ...ATTA_MEDIA,
  name: 'atta-texana|media|small-media',
  bodyLength: 4.9,
  head: { length: 0.25, width: 0.24, height: 0.62, squareness: 2.5, tilt: 0.42, notch: 0.2 },
  mesosoma: { length: 0.33, width: 0.12, height: 0.13, profile: 'worker' },
  spines: { propodeal: 0.035, pronotal: 0.03, mesonotal: 0.018 },
  antenna: { scape: 1.05, funiculus: 1.15, segments: 10, thickness: 0.95, club: 0.1 },
};

/** Minim (gardener, hitchhiker): tiny, proportionally long antennae, faint spines. */
export const ATTA_MINIM: AntMorphology = {
  ...ATTA_MEDIA,
  name: 'atta-texana|minor',
  bodyLength: 2.45,
  head: { length: 0.24, width: 0.22, height: 0.62, squareness: 2.4, tilt: 0.42, notch: 0.08 },
  mesosoma: { length: 0.34, width: 0.125, height: 0.135, profile: 'worker' },
  gaster: { length: 0.27, width: 0.21, height: 0.18, segments: 4, fullness: 0 },
  eye: { size: 0.17, position: 0.5 },
  antenna: { scape: 1.1, funiculus: 1.25, segments: 10, thickness: 1.0, club: 0.1 },
  legs: { length: 1.08, thickness: 1.0 },
  spines: { propodeal: 0.02, pronotal: 0.015, mesonotal: 0.008 },
  hairs: 25,
  colors: { ...COLORS, head: '#6a3b20', mesosoma: '#6c3d22', gaster: '#5c331c' },
};

/** Major (soldier): enormous, deeply emarginate head, massive mandibles. */
export const ATTA_MAJOR: AntMorphology = {
  ...ATTA_MEDIA,
  name: 'atta-texana|major',
  bodyLength: 12.6,
  head: { length: 0.35, width: 0.38, height: 0.54, squareness: 2.3, tilt: 0.34, notch: 0.75 },
  mesosoma: { length: 0.27, width: 0.115, height: 0.12, profile: 'worker' },
  gaster: { length: 0.23, width: 0.18, height: 0.155, segments: 4, fullness: 0 },
  mandible: { length: 0.4, teeth: 6, width: 0.55 },
  eye: { size: 0.1, position: 0.4 },
  antenna: { scape: 0.62, funiculus: 0.72, segments: 10, thickness: 1.0, club: 0.1 },
  legs: { length: 0.86, thickness: 1.1 },
  spines: { propodeal: 0.04, pronotal: 0.035, mesonotal: 0.02 },
  hairs: 60,
  gait: { stride: 0.42, lift: 0.055, duty: 0.56 },
};

export const ATTA_QUEEN: AntMorphology = {
  ...ATTA_MEDIA,
  name: 'atta-texana|queen',
  bodyLength: 18.2,
  head: { length: 0.2, width: 0.22, height: 0.6, squareness: 2.7, tilt: 0.36, notch: 0.3 },
  mesosoma: { length: 0.34, width: 0.18, height: 0.2, profile: 'alate' },
  gaster: { length: 0.42, width: 0.3, height: 0.25, segments: 4, fullness: 0.25 },
  petiole: { nodes: 2, shape: 'node', height: 0.07 },
  eye: { size: 0.17, position: 0.48 },
  ocelli: true,
  antenna: { scape: 0.85, funiculus: 0.95, segments: 10, thickness: 1.05, club: 0.1 },
  legs: { length: 0.8, thickness: 1.15 },
  spines: { propodeal: 0.025, pronotal: 0.02, mesonotal: 0 },
  wings: 'stubs',
  hairs: 70,
  roughness: 0.62, clearcoat: 0.1,
  gait: { stride: 0.36, lift: 0.045, duty: 0.6 },
};

export const ATTA_GYNE: AntMorphology = { ...ATTA_QUEEN, name: 'atta-texana|gyne', wings: 'full', wingLength: 0.98 };

export const ATTA_MALE: AntMorphology = {
  ...ATTA_MEDIA,
  name: 'atta-texana|male',
  bodyLength: 13.3,
  head: { length: 0.13, width: 0.15, height: 0.66, squareness: 2.3, tilt: 0.5, notch: 0 },
  mesosoma: { length: 0.38, width: 0.17, height: 0.2, profile: 'male' },
  gaster: { length: 0.36, width: 0.19, height: 0.165, segments: 5, fullness: 0 },
  petiole: { nodes: 2, shape: 'node', height: 0.06 },
  mandible: { length: 0.22, teeth: 2, width: 0.3 },
  eye: { size: 0.42, position: 0.58 },
  ocelli: true,
  antenna: { scape: 0.5, funiculus: 2.0, segments: 11, thickness: 0.8, club: 0 },
  legs: { length: 1.05, thickness: 0.8 },
  spines: { propodeal: 0.012, pronotal: 0, mesonotal: 0 },
  wings: 'full', wingLength: 1.0,
  hairs: 30,
};
