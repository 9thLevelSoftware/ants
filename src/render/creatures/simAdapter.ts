/**
 * THE ONLY FILE in src/render/creatures that reads simulation data. Everything is read-only.
 *
 * The `*View` types are structural subsets of the contracts (src/sim/types), so a real `Sim` satisfies
 * `CreatureSimSource` and the demo page can drive the renderer with plain objects.
 */
import type { BirdEvent, Creature, Hazard, Herd, PlantState, Poi, Primitive, WorldObject } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';

export type CreatureView = Pick<Creature,
  'id' | 'alive' | 'kind' | 'variant' | 'pos' | 'prevPos' | 'up' | 'prevUp' | 'fwd' | 'prevFwd' | 'speed' | 'footOffset' |
  'medium' | 'state' | 'stateTick' | 'flags' | 'hp' | 'bb'>;
export type HerdView = Pick<Herd, 'id' | 'alive' | 'kind' | 'hostId' | 'segment' | 'a'>;
export type HazardView = Pick<Hazard, 'id' | 'kind' | 'pos' | 'radius' | 'depth' | 'state' | 'untilTick'>;
export type BirdView = Pick<BirdEvent, 'variant' | 'pos' | 'phase' | 'startTick' | 'landTick' | 'endTick' | 'nextPeckTick' | 'peckAim'>;
export type PlantView = Pick<PlantState, 'id' | 'alive' | 'objectId'>;
export type WorldObjectView = Pick<WorldObject, 'id' | 'pos' | 'primStart' | 'primCount' | 'poiIds'>;
export type PoiView = Pick<Poi, 'id' | 'kind' | 'pos' | 'objectId'>;

export interface CreatureSimSource {
  state: {
    tick: number;
    creatures: readonly CreatureView[];
    plants?: readonly PlantView[];
    ecology?: { herds: readonly HerdView[]; hazards: readonly HazardView[]; birdEvent: BirdView | null };
  };
  world?: { prims: readonly Primitive[]; objects: readonly WorldObjectView[]; pois: readonly PoiView[] };
  field?: { height(x: number, z: number): number; hardXYZ?(x: number, y: number, z: number): number };
}

/** One creature as the renderer needs it this frame (interpolated). Reused; never retained by callers. */
export interface CreatureSample {
  id: number;
  kind: Creature['kind'];
  variant: string | null;
  state: string;
  flags: number;
  /** Interpolated surface point (walker position minus the foot offset), up and forward (unit). */
  pos: Vec3; up: Vec3; fwd: Vec3;
  /** mm/s */
  speed: number;
  /** Distance moved over the last tick, mm (hops and leaps are re-placements in the sim). */
  stepMm: number;
  hp: number;
  airborne: boolean;
  /** Antlion: its pit hazard id (bb.pit), -1 none. */
  pitId: number;
  /** Progress through a strike wind-up 0..1 (state `windup` up to bb.strikeAt), 0 otherwise. */
  windup: number;
}

export function newCreatureSample(): CreatureSample {
  return {
    id: -1, kind: 'aphid', variant: null, state: '', flags: 0, pos: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 },
    fwd: { x: 0, y: 0, z: 1 }, speed: 0, stepMm: 0, hp: 1, airborne: false, pitId: -1, windup: 0,
  };
}

// Math.sqrt rather than Math.hypot in the per-creature path (hypot guards against overflow and is several times slower)
function nlerp(out: Vec3, a: Vec3, b: Vec3, t: number): void {
  const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
  const l = Math.sqrt(x * x + y * y + z * z);
  if (l > 1e-9) { out.x = x / l; out.y = y / l; out.z = z / l; } else { out.x = b.x; out.y = b.y; out.z = b.z; }
}

/** Reads creature `c` interpolated at alpha (0 = previous tick, 1 = current tick) into `out`; tick = current tick. */
export function readCreature(c: CreatureView, alpha: number, out: CreatureSample, tick = 0): CreatureSample {
  const t = Math.min(1, Math.max(0, alpha));
  out.id = c.id; out.kind = c.kind; out.variant = c.variant; out.state = c.state; out.flags = c.flags; out.hp = c.hp;
  nlerp(out.up, c.prevUp, c.up, t);
  nlerp(out.fwd, c.prevFwd, c.fwd, t);
  // keep fwd tangent to up
  const d = out.fwd.x * out.up.x + out.fwd.y * out.up.y + out.fwd.z * out.up.z;
  out.fwd.x -= out.up.x * d; out.fwd.y -= out.up.y * d; out.fwd.z -= out.up.z * d;
  const lf = Math.sqrt(out.fwd.x * out.fwd.x + out.fwd.y * out.fwd.y + out.fwd.z * out.fwd.z);
  if (lf > 1e-9) { out.fwd.x /= lf; out.fwd.y /= lf; out.fwd.z /= lf; } else pickTangent(out.up, out.fwd);
  const fo = c.footOffset;
  out.pos.x = c.prevPos.x + (c.pos.x - c.prevPos.x) * t - out.up.x * fo;
  out.pos.y = c.prevPos.y + (c.pos.y - c.prevPos.y) * t - out.up.y * fo;
  out.pos.z = c.prevPos.z + (c.pos.z - c.prevPos.z) * t - out.up.z * fo;
  const sx = c.pos.x - c.prevPos.x, sy = c.pos.y - c.prevPos.y, sz = c.pos.z - c.prevPos.z;
  out.stepMm = Math.sqrt(sx * sx + sy * sy + sz * sz);
  out.speed = Number.isFinite(c.speed) ? c.speed : 0;
  out.airborne = c.medium === 'air';
  // bb is a per-creature dictionary (a different shape for every family): read it only where it means something
  out.pitId = -1;
  if (c.kind === 'antlion') { const pit = c.bb?.pit; if (typeof pit === 'number') out.pitId = pit; }
  out.windup = 0;
  if (c.state === 'windup') {
    const strikeAt = c.bb?.strikeAt;
    if (typeof strikeAt === 'number' && strikeAt > c.stateTick) {
      out.windup = Math.min(1, Math.max(0, (tick - 1 + t - c.stateTick) / (strikeAt - c.stateTick)));
    }
  }
  return out;
}

function pickTangent(up: Vec3, out: Vec3): void {
  const ax = Math.abs(up.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const d = ax.x * up.x + ax.y * up.y + ax.z * up.z;
  out.x = ax.x - up.x * d; out.y = ax.y - up.y * d; out.z = ax.z - up.z * d;
  const l = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= l; out.y /= l; out.z /= l;
}

/** Where a herd sits and on which primitives: the same rule as the plants module's herd point (aphid-site by segment). */
export interface HerdSite { site: Vec3; prims: readonly Primitive[] }

export class WorldLookup {
  private objects = new Map<number, WorldObjectView>();
  private sites = new Map<number, PoiView[]>();
  private plants = new Map<number, PlantView>();
  private objCount = -1;
  private plantList: readonly PlantView[] | null = null;
  private plantLen = -1;

  constructor(private readonly src: CreatureSimSource) {}

  private index(force = false): void {
    const w = this.src.world;
    if (w && (force || w.objects.length !== this.objCount)) {
      this.objects.clear(); this.sites.clear();
      for (const o of w.objects) this.objects.set(o.id, o);
      for (const p of w.pois) {
        if (p.kind !== 'aphid-site') continue;
        let l = this.sites.get(p.objectId);
        if (!l) { l = []; this.sites.set(p.objectId, l); }
        l.push(p);
      }
      this.objCount = w.objects.length;
    }
    const pl = this.src.state.plants ?? null;
    if (force || pl !== this.plantList || (pl && pl.length !== this.plantLen)) {
      this.plants.clear();
      if (pl) for (const p of pl) this.plants.set(p.id, p);
      this.plantList = pl; this.plantLen = pl?.length ?? -1;
    }
  }

  /** The herd's point on its plant and the plant's primitives; null when the plant or its object is gone. */
  herdSite(h: HerdView): HerdSite | null {
    this.index();
    let plant = this.plants.get(h.hostId), obj = plant ? this.objects.get(plant.objectId) : undefined;
    if (!plant || !obj) {
      // a cache miss: the lists may have been replaced with the same lengths; re-index once
      this.index(true);
      plant = this.plants.get(h.hostId); obj = plant ? this.objects.get(plant.objectId) : undefined;
    }
    const w = this.src.world;
    if (!w || !plant || !plant.alive || !obj) return null;
    const sites = this.sites.get(obj.id) ?? [];
    const site = sites.length > 0 ? sites[Math.abs(h.segment) % sites.length]!.pos : obj.pos;
    return { site, prims: w.prims.slice(obj.primStart, obj.primStart + obj.primCount) };
  }

  /** Free distance to the hard primitives at a point (positive in free space), or null when the source has no field for it. */
  hardDistance(): ((x: number, y: number, z: number) => number) | null {
    const f = this.src.field;
    return f && f.hardXYZ ? (x, y, z) => f.hardXYZ!(x, y, z) : null;
  }

  /** Ground height under (x, z), or `fallback` when the source has no field. */
  height(x: number, z: number, fallback: number): number {
    const f = this.src.field;
    if (!f) return fallback;
    const h = f.height(x, z);
    return Number.isFinite(h) ? h : fallback;
  }
}
