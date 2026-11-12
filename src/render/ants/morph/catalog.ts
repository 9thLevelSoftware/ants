/**
 * Resolves (species, caste, size class) to a morphology. Render presets live here; the species data's
 * `appearance` block (GDD 07 §3.15, the sim-side source of truth) is overlaid where it is defined.
 * Rival-only species (GDD 05 §3.1) have no render presets yet: they borrow the closest playable body plan
 * (formicine or myrmicine) with a tint. PROVISIONAL until the creatures/rivals render task.
 */
import type { AntMorphology } from './types';
import { LASIUS_GYNE, LASIUS_MALE, LASIUS_QUEEN, LASIUS_WORKER } from './lasius';
import {
  CAMPONOTUS_GYNE, CAMPONOTUS_MAJOR, CAMPONOTUS_MALE, CAMPONOTUS_MEDIA, CAMPONOTUS_MINOR, CAMPONOTUS_QUEEN,
} from './camponotus';
import { MESSOR_GYNE, MESSOR_MAJOR, MESSOR_MALE, MESSOR_MEDIA, MESSOR_MINOR, MESSOR_QUEEN } from './messor';
import { ATTA_GYNE, ATTA_MAJOR, ATTA_MALE, ATTA_MEDIA, ATTA_MINIM, ATTA_QUEEN, ATTA_SMALL_MEDIA } from './atta';

/** Render-side caste keys (the sim castes plus Atta's small-media size class). */
export type MorphCaste = 'worker' | 'minor' | 'media' | 'major' | 'queen' | 'gyne' | 'male' | 'small-media';

interface SpeciesMorphs {
  formicine: boolean;
  /** true: the species' pupae spin silk cocoons. */
  cocoons: boolean;
  castes: Partial<Record<MorphCaste, AntMorphology>>;
  /** Caste used when the requested one is missing (the standard worker). */
  standard: MorphCaste;
}

export const SPECIES_MORPHS: Record<string, SpeciesMorphs> = {
  'lasius-niger': {
    formicine: true, cocoons: true, standard: 'worker',
    castes: { worker: LASIUS_WORKER, queen: LASIUS_QUEEN, gyne: LASIUS_GYNE, male: LASIUS_MALE },
  },
  'camponotus-pennsylvanicus': {
    formicine: true, cocoons: true, standard: 'media',
    castes: { minor: CAMPONOTUS_MINOR, media: CAMPONOTUS_MEDIA, major: CAMPONOTUS_MAJOR, queen: CAMPONOTUS_QUEEN, gyne: CAMPONOTUS_GYNE, male: CAMPONOTUS_MALE },
  },
  'messor-barbarus': {
    formicine: false, cocoons: false, standard: 'media',
    castes: { minor: MESSOR_MINOR, media: MESSOR_MEDIA, major: MESSOR_MAJOR, queen: MESSOR_QUEEN, gyne: MESSOR_GYNE, male: MESSOR_MALE },
  },
  'atta-texana': {
    formicine: false, cocoons: false, standard: 'media',
    castes: { minor: ATTA_MINIM, 'small-media': ATTA_SMALL_MEDIA, media: ATTA_MEDIA, major: ATTA_MAJOR, queen: ATTA_QUEEN, gyne: ATTA_GYNE, male: ATTA_MALE },
  },
};

/** Rival-only species: [borrowed body plan, scale relative to it, tint hex for head/mesosoma/gaster]. */
const RIVAL_FALLBACK: Record<string, [string, number, string | null]> = {
  'lasius-flavus': ['lasius-niger', 0.85, '#b88a3c'],
  'formica-rufa': ['lasius-niger', 1.8, '#7a3a1e'],
  'formica-subsericea': ['lasius-niger', 1.5, null],
  'tapinoma-sessile': ['lasius-niger', 0.7, null],
  'tapinoma-nigerrimum': ['lasius-niger', 0.85, null],
  'linepithema-humile': ['lasius-niger', 0.65, '#4a3426'],
};
const RIVAL_DEFAULT: [string, number, string | null] = ['messor-barbarus', 0.45, '#3a2418'];

/** The sim's species appearance block (structural subset of AppearanceDef). */
export interface AppearanceLike {
  bodyColour?: string; gasterColour?: string; hairiness?: number; waistNodes?: 1 | 2;
  rearWeapon?: 'acidopore' | 'sting'; spines?: number; headWidthRatio?: Partial<Record<string, number>>; alateWingTint?: string;
}

export function speciesMorphs(species: string): { morphs: SpeciesMorphs; scale: number; tint: string | null; base: string } {
  const own = SPECIES_MORPHS[species];
  if (own) return { morphs: own, scale: 1, tint: null, base: species };
  const [base, scale, tint] = RIVAL_FALLBACK[species] ?? RIVAL_DEFAULT;
  return { morphs: SPECIES_MORPHS[base]!, scale, tint, base };
}

/** Render caste for a sim caste and size class. */
export function morphCaste(species: string, caste: string, sizeClass: string | null): MorphCaste {
  const { morphs } = speciesMorphs(species);
  if (caste === 'media' && sizeClass === 'small-media' && morphs.castes['small-media']) return 'small-media';
  const c = caste as MorphCaste;
  if (morphs.castes[c]) return c;
  if (c === 'worker' || c === 'minor' || c === 'media' || c === 'major') return morphs.standard;
  return morphs.standard;
}

export function variantKey(species: string, caste: MorphCaste): string {
  return `${species}|${caste}`;
}

/** The morphology for a variant key, with the species appearance overlaid and rival fallbacks applied. */
export function resolveMorph(species: string, caste: MorphCaste, appearance: AppearanceLike | null): AntMorphology {
  const { morphs, scale, tint } = speciesMorphs(species);
  const src = morphs.castes[caste] ?? morphs.castes[morphs.standard]!;
  const m: AntMorphology = structuredCloneMorph(src);
  m.name = variantKey(species, caste);
  m.bodyLength *= scale;
  if (tint) m.colors = { ...m.colors, head: tint, mesosoma: tint, gaster: tint };
  if (appearance) applyAppearance(m, caste, appearance);
  return m;
}

function applyAppearance(m: AntMorphology, caste: MorphCaste, a: AppearanceLike): void {
  if (a.bodyColour) m.colors = { ...m.colors, head: a.bodyColour, mesosoma: a.bodyColour };
  if (a.gasterColour) m.colors = { ...m.colors, gaster: a.gasterColour };
  if (a.alateWingTint) m.colors = { ...m.colors, wingMembrane: a.alateWingTint };
  if (a.waistNodes) m.petiole = { ...m.petiole, nodes: a.waistNodes, shape: a.waistNodes === 1 && m.rearWeapon === 'acidopore' ? 'scale' : 'node' };
  if (a.rearWeapon) m.rearWeapon = a.rearWeapon;
  // Lasius (hairiness 0.2) is the reference for the generator's hair counts
  if (a.hairiness !== undefined) m.hairs = Math.round(m.hairs * (0.5 + 2.5 * a.hairiness));
  if (a.spines === 0) m.spines = { propodeal: 0, pronotal: 0, mesonotal: 0 };
  const hw = a.headWidthRatio?.[caste];
  if (hw !== undefined && hw > 0) m.head = { ...m.head, width: hw };
}

function structuredCloneMorph(m: AntMorphology): AntMorphology {
  return JSON.parse(JSON.stringify(m)) as AntMorphology;
}
