// Abstract-colony profile of every species that can appear as a rival colony (GDD 05 §3.1, §3.2): the rival-only
// species (their RivalSpeciesDef rows in ../rivals.ts) and the four playable species as conspecific rivals. The
// lasius-niger row is the GDD table's; the other playable rows are T3 estimates marked [E].
// Static data, not part of SimState.

import type { ColonySpeciesId, RivalSpeciesDef, SpeciesId } from '@/sim/types';
import { RIVAL_SPECIES } from '../rivals';

export interface RivalModelProfile {
  species: ColonySpeciesId;
  /** Combat power per worker relative to a Lasius worker. */
  cp: number;
  /** Base aggression 0..1. */
  aggression: number;
  /** Start workers, carrying capacity, growth per gd (GDD 05 §3.2). */
  n0: number;
  kMax: number;
  growthPerGd: number;
  /** Share of N fielded and the caps in peace / war. */
  fieldShare: number;
  fieldCap: { normal: number; war: number };
  /** Surface activity window, °C; active at night instead of by day; also active on warm summer nights. */
  activityC: [number, number];
  nocturnal: boolean;
  warmNights: boolean;
  /** Real queens of an established colony. */
  queens: number;
  /** Claimed cells for the full carrying capacity (A_ref). */
  aRef: number;
  /** Playable species whose nest template lays out its nest (the nest module plans for playable species only). */
  templateSpecies: SpeciesId;
  /** Launches predatory raids on weak colonies at any relation (GDD 05 §3.7, Formica). */
  predatoryRaids: boolean;
  /** Lives and forages underground: fields almost nothing on the surface (flavus, thief ants). */
  subterranean: boolean;
}

/** Playable species as rivals. */
const PLAYABLE_ROWS: Readonly<Record<SpeciesId, Omit<RivalModelProfile, 'species'>>> = {
  'lasius-niger': {
    cp: 1.0, aggression: 0.6, n0: 300, kMax: 1200, growthPerGd: 0.25, fieldShare: 0.05, fieldCap: { normal: 40, war: 150 },
    activityC: [8, 35], nocturnal: false, warmNights: true, queens: 1, aRef: 400, templateSpecies: 'lasius-niger',
    predatoryRaids: false, subterranean: false,
  },
  // [E] T3: nocturnal carpenter ant; majors raise the per-worker power
  'camponotus-pennsylvanicus': {
    cp: 3.0, aggression: 0.6, n0: 300, kMax: 900, growthPerGd: 0.12, fieldShare: 0.05, fieldCap: { normal: 40, war: 120 },
    activityC: [10, 32], nocturnal: true, warmNights: false, queens: 1, aRef: 400, templateSpecies: 'camponotus-pennsylvanicus',
    predatoryRaids: false, subterranean: false,
  },
  // [E] T3: higher aggression toward conspecifics (GDD 05 §3.1 note)
  'messor-barbarus': {
    cp: 2.5, aggression: 0.75, n0: 400, kMax: 1500, growthPerGd: 0.2, fieldShare: 0.05, fieldCap: { normal: 50, war: 150 },
    activityC: [12, 38], nocturnal: false, warmNights: false, queens: 1, aRef: 400, templateSpecies: 'messor-barbarus',
    predatoryRaids: false, subterranean: false,
  },
  // [E] T3
  'atta-texana': {
    cp: 2.0, aggression: 0.5, n0: 600, kMax: 2500, growthPerGd: 0.2, fieldShare: 0.05, fieldCap: { normal: 60, war: 200 },
    activityC: [15, 35], nocturnal: false, warmNights: true, queens: 1, aRef: 400, templateSpecies: 'atta-texana',
    predatoryRaids: false, subterranean: false,
  },
};

/** Rival-only extras that RivalSpeciesDef does not carry (GDD 05 §3.2 A_ref, §3.7 notes). */
const RIVAL_EXTRAS: Readonly<Partial<Record<string, Partial<RivalModelProfile>>>> = {
  'formica-rufa': { aRef: 900, predatoryRaids: true },
  'tetramorium-immigrans': { templateSpecies: 'messor-barbarus' },
  'pheidole-pallidula': { templateSpecies: 'messor-barbarus' },
  'solenopsis-fugax': { subterranean: true },
  'solenopsis-molesta': { subterranean: true },
  'lasius-flavus': { subterranean: true },
};

function fromRivalDef(d: RivalSpeciesDef): RivalModelProfile {
  return {
    species: d.id, cp: d.cp, aggression: d.aggression, n0: d.n0, kMax: d.kMax, growthPerGd: d.growthPerGd,
    fieldShare: d.fieldShare, fieldCap: { ...d.fieldCap }, activityC: [d.activityC[0], d.activityC[1]],
    nocturnal: d.nocturnal, warmNights: false, queens: d.queens, aRef: 400, templateSpecies: 'lasius-niger',
    predatoryRaids: false, subterranean: false, ...RIVAL_EXTRAS[d.id],
  };
}

const PROFILES = new Map<string, RivalModelProfile>();
for (const [id, row] of Object.entries(PLAYABLE_ROWS)) PROFILES.set(id, { species: id as SpeciesId, ...row });
for (const d of RIVAL_SPECIES) PROFILES.set(d.id, fromRivalDef(d));

/** The abstract-colony profile of a species (unknown ids fall back to the Lasius row). */
export function rivalProfile(species: ColonySpeciesId): RivalModelProfile {
  return PROFILES.get(species) ?? PROFILES.get('lasius-niger')!;
}

/** Every species with a rival profile. */
export function rivalProfileIds(): string[] {
  return [...PROFILES.keys()];
}
