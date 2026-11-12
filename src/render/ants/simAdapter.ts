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
  'medium' | 'lengthBu' | 'sizeClass' | 'flags' | 'pose' | 'carry' | 'cropC' | 'cropP' | 'cropCap' | 'bornTick' | 'alarmLevel'>;
export type BroodView = Pick<Brood, 'id' | 'alive' | 'colony' | 'stage' | 'destined' | 'progress' | 'pos' | 'carriedBy' | 'destinedLengthBu'>;
export type ItemView = Pick<Item, 'id' | 'alive' | 'kind' | 'pos' | 'carrierIds' | 'lengthMm' | 'count' | 'species' | 'colony' | 'decay' | 'foodKind' | 'variant' | 'wasteKind'>;
export type ColonyView = Pick<Colony, 'id' | 'species'>;

export interface SpeciesView { buMm: number; appearance?: AppearanceLike; cruiseBuS?: number }

export interface AntSimSource {
  state: {
    tick: number;
    ants: readonly AntView[];
    brood: readonly BroodView[];
    items: readonly ItemView[];
    colonies: readonly ColonyView[];
    player: { possessedAntId: number };
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

/** Per-source lookup caches (colony -> species, species -> BU / appearance). */
export class SimReader {
  private colonySpecies = new Map<number, string>();
  private species = new Map<string, SpeciesView>();

  constructor(readonly sim: AntSimSource) {}

  get tick(): number { return this.sim.state.tick; }
  get ants(): readonly AntView[] { return this.sim.state.ants; }
  get brood(): readonly BroodView[] { return this.sim.state.brood; }
  get items(): readonly ItemView[] { return this.sim.state.items; }
  get possessedId(): number { return this.sim.state.player.possessedAntId; }

  /** Refreshes the colony -> species map (a handful of colonies; called once per frame). */
  beginFrame(): void {
    this.colonySpecies.clear();
    for (const c of this.sim.state.colonies) this.colonySpecies.set(c.id, c.species);
  }

  speciesOfColony(colony: number): string {
    if (this.colonySpecies.size === 0) this.beginFrame();
    return this.colonySpecies.get(colony) ?? 'lasius-niger';
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

  /** Fills `out` for one live ant at interpolation factor alpha (0 = previous tick, 1 = current). */
  readAnt(a: AntView, alpha: number, out: AntSample): AntSample {
    const species = this.speciesOfColony(a.colony);
    out.id = a.id;
    out.species = species;
    out.caste = a.caste;
    out.sizeClass = a.sizeClass;
    out.lengthMm = a.lengthBu * this.speciesInfo(species).buMm;
    lerpUnit(a.prevUp, a.up, alpha, out.up);
    lerpUnit(a.prevFwd, a.fwd, alpha, out.fwd);
    const fo = a.footOffset || 0;
    out.pos.x = a.prevPos.x + (a.pos.x - a.prevPos.x) * alpha - out.up.x * fo;
    out.pos.y = a.prevPos.y + (a.pos.y - a.prevPos.y) * alpha - out.up.y * fo;
    out.pos.z = a.prevPos.z + (a.pos.z - a.prevPos.z) * alpha - out.up.z * fo;
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
    out.winged = a.caste === 'gyne' || a.caste === 'male' || (a.flags & AntFlag.WINGED) !== 0;
    return out;
  }

  /** The single carrier of an item, or -1 when it lies loose or is moved cooperatively. */
  itemCarrier(it: ItemView): number {
    return it.carrierIds.length === 1 ? it.carrierIds[0]! : -1;
  }
}

function lerpUnit(a: Vec3, b: Vec3, t: number, out: Vec3): void {
  const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
  const l = Math.hypot(x, y, z);
  if (l < 1e-6) { out.x = b.x; out.y = b.y; out.z = b.z; return; }
  out.x = x / l; out.y = y / l; out.z = z / l;
}
