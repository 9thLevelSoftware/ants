/**
 * THE ONLY FILE in src/render/ants that reads simulation data. Field names of the sim contracts may still change;
 * a rename costs one edit here. Everything is read-only: the renderer never writes sim state.
 *
 * The `*View` types are structural subsets of the contracts, so a real `Sim` satisfies `AntSimSource` and the demo
 * page can drive the renderer with plain objects.
 */
import type { Ant, Brood, Colony, Item } from '@/sim/types';
import { AntFlag, POSES } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import type { AppearanceLike } from './morph/catalog';
import { CALLOW_DARKEN_TICKS } from './tuning';

export type AntView = Pick<Ant,
  'id' | 'alive' | 'colony' | 'caste' | 'pos' | 'prevPos' | 'up' | 'prevUp' | 'fwd' | 'prevFwd' | 'speed' | 'footOffset' |
  'medium' | 'lengthBu' | 'sizeClass' | 'flags' | 'pose' | 'carry' | 'cropC' | 'cropP' | 'cropCap' | 'bornTick' | 'alarmLevel'> & {
  /** Only the founding queen's wing state is read (GDD 06 §5.2: wings stay on until the dealation phase). */
  queen?: { founding: { wings: boolean } | null } | null;
};

/**
 * Opening phases in which the founding queen is shown winged (while the sim's `queen.founding.wings` is still set):
 * the intro card, under which the world shows her as she landed, and the dealation, where she sheds them on screen
 * (GDD 06 §5.1 / §5.4; the founding module clears the flag at its end). Hiding them under the card made them blink
 * on at the dealation (look-pass review). From `search` on, and in any game without an opening state (tests, loads
 * past the opening), she has already shed them: wing scars only.
 */
export const WINGED_OPENING_PHASES: readonly string[] = ['intro-card', 'dealation'];

type PlayerView = { possessedAntId: number; opening?: { phase: string } | null };
export type BroodView = Pick<Brood, 'id' | 'alive' | 'colony' | 'stage' | 'destined' | 'progress' | 'pos' | 'carriedBy' | 'destinedLengthBu'>;
export type ItemView = Pick<Item, 'id' | 'alive' | 'kind' | 'pos' | 'carrierIds' | 'lengthMm' | 'count' | 'species' | 'colony' | 'decay' | 'foodKind' | 'variant' | 'wasteKind'>;
export type ColonyView = Pick<Colony, 'id' | 'species'>;

/** A walker pose (mm, unit vectors): position on the level set f = footOffset, surface normal and heading. */
export interface WalkerPose { pos: Vec3; up: Vec3; fwd: Vec3 }

export interface SpeciesView { buMm: number; appearance?: AppearanceLike; cruiseBuS?: number }

export interface AntSimSource {
  state: {
    tick: number;
    ants: readonly AntView[];
    brood: readonly BroodView[];
    items: readonly ItemView[];
    colonies: readonly ColonyView[];
    player: PlayerView;
  };
  getSpecies?(id: string): SpeciesView | undefined;
}

/** BU (mm) of species without a full definition (GDD 07 §0.2; rival-only species use the reference worker). */
const FALLBACK_BU: Record<string, number> = { 'lasius-niger': 4, 'camponotus-pennsylvanicus': 9, 'messor-barbarus': 7, 'atta-texana': 7 };

/** One ant as the renderer needs it this frame (interpolated). Reused; never retained by callers. */
export interface AntSample {
  id: number;
  species: string;
  caste: string;
  sizeClass: string | null;
  /** Body length, mm. */
  lengthMm: number;
  /** Interpolated surface point (walker position minus the foot offset), up and forward (unit). */
  pos: Vec3; up: Vec3; fwd: Vec3;
  /** mm/s */
  speed: number;
  airborne: boolean;
  poseId: string;
  carryKind: 'none' | 'item' | 'brood';
  carryId: number;
  /** Crop fill 0..1. */
  crop: number;
  /** 0 fully coloured .. 1 just eclosed. */
  callow: number;
  /** 0..1 */
  alarm: number;
  possessed: boolean;
  winged: boolean;
}

export function newAntSample(): AntSample {
  return {
    id: -1, species: '', caste: 'worker', sizeClass: null, lengthMm: 4, pos: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: 1 },
    speed: 0, airborne: false, poseId: 'walk', carryKind: 'none', carryId: -1, crop: 0, callow: 0, alarm: 0, possessed: false, winged: false,
  };
}

/** What the brood/item catalog needs to pick a mesh and a size (field names are the renderer's own). */
export interface BroodLook { stage: string; destined: string; progress: number; destinedLengthBu: number }
export interface ItemLook { kind: string; lengthMm: number; wasteKind: string | null; foodKind: string | null }

/** One brood entity as the renderer needs it. Reused; never retained by callers. */
export interface BroodSample extends BroodLook {
  id: number;
  species: string;
  pos: Vec3;
  /** Held in a carrier's mandibles (drawn at the carrier's head, not where it lies). */
  carried: boolean;
}

/** One item as the renderer needs it. Reused; never retained by callers. */
export interface ItemSample extends ItemLook {
  id: number;
  /** Species of a corpse or of the owning colony; null when unknown (the carrier's species is used). */
  species: string | null;
  pos: Vec3;
  /** Carried by exactly one ant (cooperative transport is drawn loose, where the sim puts the item). */
  carried: boolean;
  /** Stackable on a pile (soil pellets, seeds): coincident ones are spread so the pile reads as a pile. */
  piles: boolean;
}

export function newBroodSample(): BroodSample {
  return { id: -1, species: '', pos: { x: 0, y: 0, z: 0 }, carried: false, stage: 'egg', destined: 'worker', progress: 0, destinedLengthBu: 1 };
}
export function newItemSample(): ItemSample {
  return { id: -1, species: null, pos: { x: 0, y: 0, z: 0 }, carried: false, piles: false, kind: 'waste', lengthMm: 0, wasteKind: null, foodKind: null };
}

/** Per-source lookup caches (colony -> species, species -> BU / appearance). */
export class SimReader {
  private colonySpecies = new Map<number, string>();
  private species = new Map<string, SpeciesView>();
  private lastColony = Number.NaN; private lastSpecies = 'lasius-niger'; private lastBuMm = 4;

  constructor(readonly sim: AntSimSource) {}

  get tick(): number { return this.sim.state.tick; }
  get ants(): readonly AntView[] { return this.sim.state.ants; }
  get brood(): readonly BroodView[] { return this.sim.state.brood; }
  get items(): readonly ItemView[] { return this.sim.state.items; }
  get possessedId(): number { return this.sim.state.player.possessedAntId; }
  /** The opening shows the founding queen winged (dealation on screen). */
  foundingWingsShown = false;

  /** Refreshes the colony -> species map (a handful of colonies; called once per frame). */
  beginFrame(): void {
    this.lastColony = Number.NaN;
    this.colonySpecies.clear();
    for (const c of this.sim.state.colonies) this.colonySpecies.set(c.id, c.species);
    const phase = this.sim.state.player.opening?.phase;
    this.foundingWingsShown = phase !== undefined && WINGED_OPENING_PHASES.includes(phase);
  }

  speciesOfColony(colony: number): string {
    return this.speciesOfColonyOrNull(colony) ?? 'lasius-niger';
  }

  speciesOfColonyOrNull(colony: number): string | null {
    if (this.colonySpecies.size === 0) this.beginFrame();
    return this.colonySpecies.get(colony) ?? null;
  }

  speciesInfo(species: string): SpeciesView {
    let s = this.species.get(species);
    if (!s) {
      const def = this.sim.getSpecies?.(species);
      s = { buMm: def?.buMm ?? FALLBACK_BU[species] ?? 4, appearance: def?.appearance, cruiseBuS: def?.cruiseBuS };
      this.species.set(species, s);
    }
    return s;
  }

  /**
   * Fills `out` for one live ant at interpolation factor alpha (0 = previous tick, 1 = current). `pose` replaces the
   * interpolated walker pose (the possessed ant's per-frame prediction, GDD 01 3.4), so ant and camera agree.
   */
  readAnt(a: AntView, alpha: number, out: AntSample, pose: WalkerPose | null = null): AntSample {
    // consecutive ants are mostly of one colony: skip the two map lookups then
    if (a.colony !== this.lastColony) {
      this.lastColony = a.colony; this.lastSpecies = this.speciesOfColony(a.colony); this.lastBuMm = this.speciesInfo(this.lastSpecies).buMm;
    }
    const species = this.lastSpecies;
    out.id = a.id;
    out.species = species;
    out.caste = a.caste;
    out.sizeClass = a.sizeClass;
    out.lengthMm = a.lengthBu * this.lastBuMm;
    const fo = a.footOffset || 0;
    if (pose) {
      lerpUnit(pose.up, pose.up, 1, out.up); // t = 1: just the unit vector
      lerpUnit(pose.fwd, pose.fwd, 1, out.fwd);
      out.pos.x = pose.pos.x - out.up.x * fo; out.pos.y = pose.pos.y - out.up.y * fo; out.pos.z = pose.pos.z - out.up.z * fo;
    } else {
      lerpUnit(a.prevUp, a.up, alpha, out.up);
      lerpUnit(a.prevFwd, a.fwd, alpha, out.fwd);
      out.pos.x = a.prevPos.x + (a.pos.x - a.prevPos.x) * alpha - out.up.x * fo;
      out.pos.y = a.prevPos.y + (a.pos.y - a.prevPos.y) * alpha - out.up.y * fo;
      out.pos.z = a.prevPos.z + (a.pos.z - a.prevPos.z) * alpha - out.up.z * fo;
    }
    out.speed = a.speed;
    out.airborne = a.medium === 'air';
    out.poseId = POSES[a.pose] ?? 'walk';
    out.carryKind = a.carry.kind;
    out.carryId = a.carry.id;
    out.crop = a.cropCap > 0 ? Math.min(1, (a.cropC + a.cropP) / a.cropCap) : 0;
    const age = this.sim.state.tick - a.bornTick;
    // only flagged callows darken (ants spawned at game start have bornTick 0 and must not look freshly eclosed)
    out.callow = (a.flags & AntFlag.CALLOW) !== 0 ? Math.max(0, 1 - Math.max(0, age) / CALLOW_DARKEN_TICKS) : 0;
    out.alarm = (a.flags & AntFlag.ALARMED) !== 0 ? Math.max(0.7, Math.min(1, a.alarmLevel)) : Math.min(1, Math.max(0, a.alarmLevel - 0.3));
    out.possessed = a.id === this.sim.state.player.possessedAntId || (a.flags & AntFlag.POSSESSED) !== 0;
    // the sim sets WINGED on alates and clears it when they shed their wings; the founding queen has flown already
    // and shows her wings only while the opening's dealation is on screen (WINGED_OPENING_PHASES)
    out.winged = (a.flags & AntFlag.WINGED) !== 0 || (a.queen?.founding?.wings === true && this.foundingWingsShown);
    return out;
  }

  /** Live entities only are drawn. */
  isLive(e: AntView | BroodView | ItemView): boolean { return e.alive; }

  readBrood(b: BroodView, out: BroodSample): BroodSample {
    out.id = b.id;
    out.species = this.speciesOfColony(b.colony);
    out.pos.x = b.pos.x; out.pos.y = b.pos.y; out.pos.z = b.pos.z;
    out.carried = b.carriedBy >= 0;
    out.stage = b.stage; out.destined = b.destined; out.progress = b.progress; out.destinedLengthBu = b.destinedLengthBu;
    return out;
  }

  readItem(it: ItemView, out: ItemSample): ItemSample {
    out.id = it.id;
    out.species = it.species ?? this.speciesOfColonyOrNull(it.colony);
    out.pos.x = it.pos.x; out.pos.y = it.pos.y; out.pos.z = it.pos.z;
    out.carried = it.carrierIds.length === 1;
    out.piles = it.kind === 'soil-pellet' || it.kind === 'seed';
    out.kind = it.kind; out.lengthMm = it.lengthMm; out.wasteKind = it.wasteKind; out.foodKind = it.foodKind;
    return out;
  }
}

function lerpUnit(a: Vec3, b: Vec3, t: number, out: Vec3): void {
  const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
  const l = Math.sqrt(x * x + y * y + z * z);
  if (l < 1e-6) { out.x = b.x; out.y = b.y; out.z = b.z; return; }
  out.x = x / l; out.y = y / l; out.z = z / l;
}
