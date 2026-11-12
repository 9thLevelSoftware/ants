/**
 * Messor barbarus (BU 7 mm; GDD 07 §5.3.1, docs/research/bio-messor.md): black / dark brown, majors with a subtle
 * reddish head (unverified tint, kept subtle per GDD 08 §11.6), two-segmented waist, functional sting, continuous
 * polymorphism minor 0.7 / media 1.05 / major 1.55 BU (macrocephalic), queen 2.3 BU, male 1.3 BU. Myrmicine:
 * naked pupae. Worker antennae 12-segmented (funiculus 11).
 */
import type { AntColors, AntMorphology } from './types';

const COLORS: AntColors = {
  head: '#1c1411', mesosoma: '#1e1512', gaster: '#171110', legs: '#2c1e17', tarsi: '#4a3324', antenna: '#2c1d16',
  mandible: '#3a2015', teeth: '#120a06', eye: '#121110', membrane: '#b3a185', hair: '#8a7356',
  wingMembrane: '#c9bea4', wingVein: '#5a4430', callow: '#b8875a',
};

export const MESSOR_MEDIA: AntMorphology = {
  name: 'messor-barbarus|media',
  bodyLength: 7.35,
  head: { length: 0.27, width: 0.27, height: 0.6, squareness: 2.9, tilt: 0.38, notch: 0.2 },
  mesosoma: { length: 0.3, width: 0.13, height: 0.125, profile: 'worker' },
  gaster: { length: 0.3, width: 0.22, height: 0.185, segments: 4, fullness: 0 },
  petiole: { nodes: 2, shape: 'node', height: 0.08 },
  mandible: { length: 0.36, teeth: 6, width: 0.48 },
  eye: { size: 0.17, position: 0.45 },
  ocelli: false,
  antenna: { scape: 0.75, funiculus: 0.95, segments: 11, thickness: 1.0, club: 0.15 },
  legs: { length: 0.92, thickness: 1.05 },
  spines: { propodeal: 0, pronotal: 0, mesonotal: 0 },
  wings: 'none', wingLength: 0,
  hairs: 80, gasterHairs: 1,
  rearWeapon: 'sting',
  colors: { ...COLORS, head: '#2a1610' },
  roughness: 0.4, sheen: 0.3, clearcoat: 0.45,
  gait: { stride: 0.44, lift: 0.058, duty: 0.55 },
};

export const MESSOR_MINOR: AntMorphology = {
  ...MESSOR_MEDIA,
  name: 'messor-barbarus|minor',
  bodyLength: 4.9,
  head: { length: 0.23, width: 0.21, height: 0.62, squareness: 2.5, tilt: 0.42, notch: 0.04 },
  mesosoma: { length: 0.33, width: 0.13, height: 0.13, profile: 'worker' },
  gaster: { length: 0.33, width: 0.23, height: 0.19, segments: 4, fullness: 0 },
  mandible: { length: 0.34, teeth: 6, width: 0.42 },
  eye: { size: 0.2, position: 0.5 },
  antenna: { scape: 0.95, funiculus: 1.2, segments: 11, thickness: 0.95, club: 0.15 },
  legs: { length: 1.06, thickness: 0.95 },
  hairs: 55,
  colors: COLORS,
  gait: { stride: 0.5, lift: 0.065, duty: 0.55 },
};

/** Major: very large, square, slightly emarginate head with a reddish tint; short scape relative to the head. */
export const MESSOR_MAJOR: AntMorphology = {
  ...MESSOR_MEDIA,
  name: 'messor-barbarus|major',
  bodyLength: 10.85,
  head: { length: 0.32, width: 0.33, height: 0.56, squareness: 2.4, tilt: 0.36, notch: 0.45 },
  mesosoma: { length: 0.27, width: 0.13, height: 0.12, profile: 'worker' },
  gaster: { length: 0.27, width: 0.21, height: 0.18, segments: 4, fullness: 0 },
  mandible: { length: 0.42, teeth: 4, width: 0.52 },
  eye: { size: 0.13, position: 0.42 },
  antenna: { scape: 0.6, funiculus: 0.8, segments: 11, thickness: 1.0, club: 0.15 },
  legs: { length: 0.8, thickness: 1.15 },
  hairs: 100,
  colors: { ...COLORS, head: '#3a1a12', mandible: '#3a1a0e' },
  roughness: 0.38, clearcoat: 0.5,
  gait: { stride: 0.42, lift: 0.055, duty: 0.55 },
};

export const MESSOR_QUEEN: AntMorphology = {
  ...MESSOR_MEDIA,
  name: 'messor-barbarus|queen',
  bodyLength: 16.1,
  head: { length: 0.2, width: 0.21, height: 0.6, squareness: 2.8, tilt: 0.36, notch: 0.1 },
  mesosoma: { length: 0.34, width: 0.19, height: 0.2, profile: 'alate' },
  gaster: { length: 0.43, width: 0.29, height: 0.24, segments: 4, fullness: 0.2 },
  petiole: { nodes: 2, shape: 'node', height: 0.075 },
  eye: { size: 0.2, position: 0.48 },
  ocelli: true,
  antenna: { scape: 0.78, funiculus: 1.0, segments: 11, thickness: 1.05, club: 0.15 },
  legs: { length: 0.76, thickness: 1.2 },
  wings: 'stubs',
  hairs: 120,
  colors: COLORS,
  gait: { stride: 0.36, lift: 0.045, duty: 0.6 },
};

export const MESSOR_GYNE: AntMorphology = { ...MESSOR_QUEEN, name: 'messor-barbarus|gyne', wings: 'full', wingLength: 0.95 };

export const MESSOR_MALE: AntMorphology = {
  ...MESSOR_MEDIA,
  name: 'messor-barbarus|male',
  bodyLength: 9.1,
  head: { length: 0.15, width: 0.16, height: 0.66, squareness: 2.3, tilt: 0.5, notch: 0 },
  mesosoma: { length: 0.38, width: 0.17, height: 0.19, profile: 'male' },
  gaster: { length: 0.36, width: 0.19, height: 0.165, segments: 5, fullness: 0 },
  petiole: { nodes: 2, shape: 'node', height: 0.06 },
  mandible: { length: 0.22, teeth: 2, width: 0.3 },
  eye: { size: 0.4, position: 0.58 },
  ocelli: true,
  antenna: { scape: 0.5, funiculus: 2.0, segments: 12, thickness: 0.8, club: 0 },
  legs: { length: 1.05, thickness: 0.8 },
  wings: 'full', wingLength: 1.0,
  hairs: 40,
  colors: COLORS,
};
