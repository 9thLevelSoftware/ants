/**
 * Camponotus pennsylvanicus (BU 9 mm; GDD 07 §5.2.1, docs/research/bio-camponotus.md): dull black, fine whitish
 * hairs on the gaster, one petiole node (scale), evenly arched thorax, acidopore, 12-segmented worker antennae,
 * continuous polymorphism minor 0.78 / media 1.1 / major 1.5 BU (large head and mandibles), queen 2.1 BU,
 * male 1.1 BU with a tiny head. Formicine: pupae in tan silk cocoons.
 */
import type { AntColors, AntMorphology } from './types';

const COLORS: AntColors = {
  head: '#16130f', mesosoma: '#181410', gaster: '#14110e', legs: '#241c16', tarsi: '#3a2c20', antenna: '#221a14',
  mandible: '#2a1a10', teeth: '#0e0805', eye: '#0f0e0d', membrane: '#b8a888', hair: '#8f8573',
  wingMembrane: '#cdbf9e', wingVein: '#5e4630', callow: '#b07f4c',
};

export const CAMPONOTUS_MEDIA: AntMorphology = {
  name: 'camponotus-pennsylvanicus|media',
  bodyLength: 9.9,
  head: { length: 0.235, width: 0.235, height: 0.64, squareness: 2.8, tilt: 0.4, notch: 0.15 },
  mesosoma: { length: 0.34, width: 0.14, height: 0.14, profile: 'arched' },
  gaster: { length: 0.34, width: 0.26, height: 0.22, segments: 5, fullness: 0 },
  petiole: { nodes: 1, shape: 'scale', height: 0.1 },
  mandible: { length: 0.34, teeth: 5, width: 0.44 },
  eye: { size: 0.2, position: 0.42 },
  ocelli: false,
  antenna: { scape: 1.0, funiculus: 1.25, segments: 11, thickness: 1, club: 0 },
  legs: { length: 1.02, thickness: 1.0 },
  spines: { propodeal: 0, pronotal: 0, mesonotal: 0 },
  wings: 'none', wingLength: 0,
  hairs: 80, gasterHairs: 3,
  rearWeapon: 'acidopore',
  colors: COLORS,
  // GDD 08 §11.6: dull black (rougher than the glossy base cuticle)
  roughness: 0.58, sheen: 0.35, clearcoat: 0.15,
  gait: { stride: 0.48, lift: 0.06, duty: 0.55 },
};

/** Minor: small head, long appendages. */
export const CAMPONOTUS_MINOR: AntMorphology = {
  ...CAMPONOTUS_MEDIA,
  name: 'camponotus-pennsylvanicus|minor',
  bodyLength: 7.0,
  head: { length: 0.2, width: 0.18, height: 0.64, squareness: 2.5, tilt: 0.44, notch: 0.04 },
  mesosoma: { length: 0.36, width: 0.13, height: 0.135, profile: 'arched' },
  gaster: { length: 0.34, width: 0.24, height: 0.2, segments: 5, fullness: 0 },
  mandible: { length: 0.36, teeth: 5, width: 0.4 },
  eye: { size: 0.23, position: 0.46 },
  antenna: { scape: 1.2, funiculus: 1.45, segments: 11, thickness: 0.95, club: 0 },
  legs: { length: 1.14, thickness: 0.92 },
  gait: { stride: 0.52, lift: 0.065, duty: 0.55 },
};

/** Major: broad, slightly heart-shaped head with strong mandibles (allometry: head grows faster than body). */
export const CAMPONOTUS_MAJOR: AntMorphology = {
  ...CAMPONOTUS_MEDIA,
  name: 'camponotus-pennsylvanicus|major',
  bodyLength: 13.5,
  head: { length: 0.29, width: 0.31, height: 0.6, squareness: 2.7, tilt: 0.34, notch: 0.35 },
  mesosoma: { length: 0.3, width: 0.13, height: 0.13, profile: 'arched' },
  gaster: { length: 0.31, width: 0.24, height: 0.2, segments: 5, fullness: 0 },
  mandible: { length: 0.33, teeth: 5, width: 0.5 },
  eye: { size: 0.15, position: 0.4 },
  antenna: { scape: 0.78, funiculus: 0.98, segments: 11, thickness: 1.05, club: 0 },
  legs: { length: 0.88, thickness: 1.12 },
  hairs: 100,
  gait: { stride: 0.42, lift: 0.055, duty: 0.56 },
};

export const CAMPONOTUS_QUEEN: AntMorphology = {
  ...CAMPONOTUS_MEDIA,
  name: 'camponotus-pennsylvanicus|queen',
  bodyLength: 18.9,
  head: { length: 0.18, width: 0.19, height: 0.62, squareness: 2.7, tilt: 0.36, notch: 0.08 },
  mesosoma: { length: 0.35, width: 0.2, height: 0.21, profile: 'alate' },
  gaster: { length: 0.47, width: 0.3, height: 0.26, segments: 5, fullness: 0.25 },
  petiole: { nodes: 1, shape: 'scale', height: 0.08 },
  eye: { size: 0.22, position: 0.48 },
  ocelli: true,
  antenna: { scape: 0.85, funiculus: 1.15, segments: 11, thickness: 1.05, club: 0 },
  legs: { length: 0.74, thickness: 1.22 },
  wings: 'stubs',
  hairs: 120,
  roughness: 0.5, clearcoat: 0.25,
  gait: { stride: 0.36, lift: 0.045, duty: 0.6 },
};

export const CAMPONOTUS_GYNE: AntMorphology = { ...CAMPONOTUS_QUEEN, name: 'camponotus-pennsylvanicus|gyne', bodyLength: 18, wings: 'full', wingLength: 1.02 };

export const CAMPONOTUS_MALE: AntMorphology = {
  ...CAMPONOTUS_MEDIA,
  name: 'camponotus-pennsylvanicus|male',
  bodyLength: 9.9,
  head: { length: 0.14, width: 0.15, height: 0.66, squareness: 2.3, tilt: 0.5, notch: 0 },
  mesosoma: { length: 0.38, width: 0.17, height: 0.19, profile: 'male' },
  gaster: { length: 0.36, width: 0.19, height: 0.165, segments: 6, fullness: 0 },
  petiole: { nodes: 1, shape: 'scale', height: 0.07 },
  mandible: { length: 0.22, teeth: 2, width: 0.3 },
  eye: { size: 0.4, position: 0.58 },
  ocelli: true,
  antenna: { scape: 0.8, funiculus: 2.0, segments: 12, thickness: 0.8, club: 0 },
  legs: { length: 1.05, thickness: 0.8 },
  wings: 'full', wingLength: 1.0,
  hairs: 40, gasterHairs: 1.5,
};
