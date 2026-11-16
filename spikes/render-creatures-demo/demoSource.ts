/**
 * A scripted stand-in for the simulation: plain objects shaped like the sim contracts (only what the creature and
 * ant renderers read), advanced in fixed 0.1 s ticks with prevPos / pos so both renderers interpolate as in game.
 * Plants are real primitive records (capsule stems, ellipsoid leaves) with aphid-site points, like worldgen's.
 */
import type { Vec3 } from '@/core/math/vec3';
import type { AntSimSource, AntView, BroodView, ColonyView, ItemView } from '@/render/ants';
import type { BirdView, CreatureSimSource, CreatureView, HazardView, HerdView } from '@/render/creatures';
import type { CreatureKind, Primitive } from '@/sim/types';

export const TICK_S = 0.1;

export interface DemoCreature extends CreatureView {
  /** still | walk (straight, wraps after `range` mm) | circle (radius) | hop (jumps `hopMm` every `hopEvery` ticks). */
  script: 'still' | 'walk' | 'circle' | 'hop';
  walkSpeed: number; range: number; radius: number; hopMm: number; hopEvery: number; origin: Vec3; angle: number;
}

const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export class DemoSource implements CreatureSimSource, AntSimSource {
  state = {
    tick: 0,
    creatures: [] as DemoCreature[],
    plants: [] as { id: number; alive: boolean; objectId: number }[],
    ecology: { herds: [] as HerdView[], hazards: [] as HazardView[], birdEvent: null as BirdView | null },
    ants: [] as AntView[],
    brood: [] as BroodView[], items: [] as ItemView[],
    colonies: [{ id: 0, species: 'lasius-niger' }] as ColonyView[],
    player: { possessedAntId: -1 },
  };
  world = { prims: [] as Primitive[], objects: [] as { id: number; pos: Vec3; primStart: number; primCount: number; poiIds: number[] }[], pois: [] as { id: number; kind: 'aphid-site'; pos: Vec3; objectId: number }[] };
  field = { height: (_x: number, _z: number) => 0 };
  private nextId = 1;
  private acc = 0;

  get alpha(): number { return this.acc / TICK_S; }
  getSpecies() { return { buMm: 4 }; }

  clear(): void {
    const s = this.state;
    s.creatures.length = 0; s.plants.length = 0; s.ants.length = 0;
    s.ecology.herds.length = 0; s.ecology.hazards.length = 0; s.ecology.birdEvent = null;
    this.world.prims.length = 0; this.world.objects.length = 0; this.world.pois.length = 0;
    s.tick = 100; this.acc = 0;
  }

  creature(kind: CreatureKind, pos: Vec3, o: Partial<DemoCreature> & { heading?: number } = {}): DemoCreature {
    const h = o.heading ?? 0;
    const fwd = o.fwd ?? v(Math.sin(h), 0, Math.cos(h));
    const c: DemoCreature = {
      id: this.nextId++, alive: true, kind, variant: o.variant ?? null, pos: { ...pos }, prevPos: { ...pos }, up: o.up ?? v(0, 1, 0), prevUp: o.up ?? v(0, 1, 0),
      fwd: { ...fwd }, prevFwd: { ...fwd }, speed: 0, footOffset: 0, medium: 'surface', state: o.state ?? 'wander', stateTick: o.stateTick ?? 0,
      flags: o.flags ?? 0, hp: o.hp ?? 10, bb: o.bb ?? {},
      script: o.script ?? 'still', walkSpeed: o.walkSpeed ?? 0, range: o.range ?? 60, radius: o.radius ?? 20, hopMm: o.hopMm ?? 0,
      hopEvery: o.hopEvery ?? 10, origin: { ...pos }, angle: 0,
    };
    this.state.creatures.push(c);
    return c;
  }

  ant(pos: Vec3, heading = 0, speed = 0): AntView {
    const fwd = v(Math.sin(heading), 0, Math.cos(heading));
    const a: AntView = {
      id: this.nextId++, alive: true, colony: 0, caste: 'worker', pos: { ...pos }, prevPos: { ...pos }, up: v(0, 1, 0), prevUp: v(0, 1, 0),
      fwd, prevFwd: { ...fwd }, speed, footOffset: 0, medium: 'surface', lengthBu: 1, sizeClass: null, flags: 0, pose: 0,
      carry: { kind: 'none', id: -1 }, cropC: 0, cropP: 0, cropCap: 1, bornTick: -1e6, alarmLevel: 0,
    };
    this.state.ants.push(a);
    return a;
  }

  /** A plant from primitives (stems / leaves) with aphid sites; returns its plant id. */
  plant(prims: Omit<Primitive, 'id' | 'objectId' | 'flags' | 'round' | 'material'>[], sites: Vec3[]): number {
    const objectId = this.nextId++;
    const start = this.world.prims.length;
    for (const p of prims) this.world.prims.push({ ...p, id: this.nextId++, objectId, flags: 0, round: 0, material: 'plant' } as Primitive);
    const poiIds: number[] = [];
    for (const s of sites) { const id = this.nextId++; poiIds.push(id); this.world.pois.push({ id, kind: 'aphid-site', pos: s, objectId }); }
    this.world.objects.push({ id: objectId, pos: prims[0]!.pos, primStart: start, primCount: prims.length, poiIds });
    const plantId = this.nextId++;
    this.state.plants.push({ id: plantId, alive: true, objectId });
    return plantId;
  }

  herd(plantId: number, segment: number, a: number): HerdView {
    const h: HerdView = { id: this.nextId++, alive: true, kind: 'aphid', hostId: plantId, segment, a };
    this.state.ecology.herds.push(h);
    return h;
  }

  pit(pos: Vec3, radius: number, depth: number, state = 'wait'): HazardView {
    const h: HazardView = { id: this.nextId++, kind: 'antlion-pit', pos: { ...pos }, radius, depth, state };
    this.state.ecology.hazards.push(h);
    return h;
  }

  /** Advances whole ticks of the scripts; the remainder is the interpolation alpha. */
  advance(dt: number): void {
    this.acc += dt;
    while (this.acc >= TICK_S) { this.acc -= TICK_S; this.tickOnce(); }
  }

  private tickOnce(): void {
    this.state.tick++;
    for (const a of this.state.ants) {
      a.prevPos = { ...a.pos }; a.prevFwd = { ...a.fwd };
      a.pos.x += a.fwd.x * a.speed * TICK_S; a.pos.z += a.fwd.z * a.speed * TICK_S;
    }
    for (const c of this.state.creatures) {
      c.prevPos = { ...c.pos }; c.prevFwd = { ...c.fwd }; c.prevUp = { ...c.up };
      const o = c.origin;
      if (c.script === 'walk') {
        c.pos.x += c.fwd.x * c.walkSpeed * TICK_S; c.pos.z += c.fwd.z * c.walkSpeed * TICK_S;
        if (Math.hypot(c.pos.x - o.x, c.pos.z - o.z) > c.range) { c.pos = { ...o }; c.prevPos = { ...o }; }
        c.speed = c.walkSpeed;
      } else if (c.script === 'circle') {
        c.angle += (c.walkSpeed * TICK_S) / c.radius;
        c.pos = { x: o.x + Math.cos(c.angle) * c.radius, y: o.y, z: o.z + Math.sin(c.angle) * c.radius };
        c.fwd = { x: -Math.sin(c.angle), y: 0, z: Math.cos(c.angle) };
        c.speed = c.walkSpeed;
      } else if (c.script === 'hop') {
        c.speed = 0;
        if (this.state.tick % c.hopEvery === 0) { c.pos.x += c.fwd.x * c.hopMm; c.pos.z += c.fwd.z * c.hopMm; }
        if (Math.hypot(c.pos.x - o.x, c.pos.z - o.z) > c.range) { c.pos = { ...o }; c.prevPos = { ...o }; }
      } else c.speed = 0;
    }
  }

  /** Sets one tick-and-alpha moment exactly (deterministic screenshots of a hop or a peck). */
  setAlpha(a: number): void { this.acc = Math.min(0.999, Math.max(0, a)) * TICK_S; }
}
