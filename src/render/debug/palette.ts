// Flat debug colours (sRGB hex) per material, caste and entity kind. Debug renderers only: the real renderers
// own the look. Values are plain readable approximations of the real materials.
import type { MaterialId } from '@/sim/types';

export const MATERIAL_COLORS: Record<MaterialId, number> = {
  loam: 0x6b4f33, humus: 0x4a3524, sand: 0xc8b07a, clay: 0x9a6a45, gravel: 0x8c8378, concrete: 0xa9a59c,
  asphalt: 0x3b3b3d, stone: 0x8a8580, brick: 0x9c4a32, tile: 0xc9b8a0, 'wood-sound': 0x8a6239, 'wood-decayed': 0x6e5233,
  bark: 0x5a4330, plant: 0x4f7a32, leaf: 0x5e8a3a, metal: 0x9aa0a6, plastic: 0xd0d6dc, rubber: 0x2a2a2a, glass: 0xbfd8e0,
  fabric: 0x8a7fa0, ceramic: 0xe8e2d6, paper: 0xe9e4d4, food: 0xd09a4a, water: 0x4a7a9a, plaster: 0xe4ddd0,
  insulation: 0xe0c070, mortar: 0xb5ada0,
};

export const DEBUG_COLORS = {
  sky: 0xbfd3e6,
  fog: 0xd9d4c4,
  sunLight: 0xfff1dc,
  skyLight: 0xcfe0f0,
  groundLight: 0x5a4a38,
  /** Carved cavity walls. */
  cavity: 0x7a5a3c,
  cavityEmissive: 0x24180e,
  queen: 0x4a2a1a,
  worker: 0x2a1c14,
  male: 0x3a3430,
  gyne: 0x50301e,
  rival: 0x7a3a18,
  egg: 0xf2eedd,
  larva: 0xf0e8d0,
  pupa: 0xe0cfa8,
  item: 0xc8a050,
  pellet: 0x5c4430,
  creature: 0x6a7a4a,
  marker: 0x40a0ff,
  possessedRing: 0xffd060,
} as const;
