/**
 * A scripted stand-in for the simulation: plain objects shaped like the sim contracts (only the fields the ant
 * renderer reads), advanced in fixed 0.1 s ticks with prevPos/pos so the renderer interpolates exactly as in game.
 * Ants walk on planes (ground, wall, ceiling) with a constant up vector; wanderers stay inside a disc.
 */
import type { Vec3 } from '@/core/math/vec3';
import type { AntSimSource, AntView, BroodView, ColonyView, ItemView } from '@/render/ants';
import { AntFlag, type BroodCaste, type BroodStage, type Caste, type ItemKind } from '@/sim/types';

export const TICK_S = 0.1;

export interface DemoAnt extends AntView {
  /** Script: still, walk (straight / constant turn) or wander (random turns inside `bound`). */
  script: 'still' | 'walk' | 'wander';
  turnRate: number;
  targetSpeed: number;
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const cp = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });

export interface AntOpts {
  lengthBu?: number; sizeClass?: AntView['sizeClass']; pos?: Vec3; up?: Vec3; fwd?: Vec3; heading?: number; speed?: number;
  pose?: number; carry?: AntView['carry']; flags?: number; crop?: number; script?: DemoAnt['script']; turnRate?: number; alarm?: number; bornTick?: number;
}

export class DemoSim implements AntSimSource {
  state = {
    tick: 0,
    ants: [] as DemoAnt[],
    brood: [] as BroodView[],
    items: [] as ItemView[],
    colonies: [] as ColonyView[],
    player: { possessedAntId: -1 },
  };
  private nextId = 1;
  private acc = 0;
  bound = 60;
  rnd: () => number;
  buMm: Record<string, number> = { 'lasius-niger': 4, 'camponotus-pennsylvanicus': 9, 'messor-barbarus': 7, 'atta-texana': 7 };

  constructor(seed = 7) { this.rnd = mulberry32(seed); }

  getSpecies(id: string) { return { buMm: this.buMm[id] ?? 4 }; }

  /** Interpolation factor of the current frame. */
  get alpha(): number { return this.acc / TICK_S; }

  colony(species: ColonyView['species']): number {
    const id = this.state.colonies.length;
    this.state.colonies.push({ id, species });
    return id;
  }

  ant(colony: number, caste: Caste, o: AntOpts = {}): DemoAnt {
    const pos = o.pos ?? v(); const up = o.up ?? v(0, 1, 0);
    const h = o.heading ?? 0;
    const fwd = o.fwd ?? v(Math.sin(h), 0, Math.cos(h));
    // like the sim's spawnAnt: alates carry the WINGED flag (the renderer draws wings from the flag, not the caste)
    const flags = (o.flags ?? 0) | (caste === 'gyne' || caste === 'male' ? AntFlag.WINGED : 0);
    const a: DemoAnt = {
      id: this.nextId++, alive: true, colony, caste, pos: cp(pos), prevPos: cp(pos), up: cp(up), prevUp: cp(up), fwd: cp(fwd), prevFwd: cp(fwd),
      speed: o.speed ?? 0, footOffset: 0, medium: 'surface', lengthBu: o.lengthBu ?? 1, sizeClass: o.sizeClass ?? null, flags,
      pose: o.pose ?? 0, carry: o.carry ?? { kind: 'none', id: -1 }, cropC: o.crop ?? 0, cropP: 0, cropCap: 1, bornTick: o.bornTick ?? 0,
      alarmLevel: o.alarm ?? 0, script: o.script ?? (o.speed ? 'walk' : 'still'), turnRate: o.turnRate ?? 0, targetSpeed: o.speed ?? 0,
    };
    this.state.ants.push(a);
    return a;
  }

  brood(colony: number, stage: BroodStage, destined: BroodCaste, pos: Vec3, o: { progress?: number; lengthBu?: number; carriedBy?: number } = {}): BroodView {
    const b: BroodView = { id: this.nextId++, alive: true, colony, stage, destined, progress: o.progress ?? 0.5, pos: cp(pos), carriedBy: o.carriedBy ?? -1, destinedLengthBu: o.lengthBu ?? 1 };
    this.state.brood.push(b);
    return b;
  }

  item(kind: ItemKind, pos: Vec3, o: Partial<ItemView> = {}): ItemView {
    const it: ItemView = {
      id: this.nextId++, alive: true, kind, pos: cp(pos), carrierIds: [], lengthMm: 0, count: 1, species: null, colony: 0, decay: 0,
      foodKind: null, variant: null, wasteKind: null, ...o,
    };
    this.state.items.push(it);
    return it;
  }

  /** Makes `carrier` hold the brood or item (sets both sides of the reference, like the sim does). */
  give(carrier: DemoAnt, thing: BroodView | ItemView): void {
    if ('stage' in thing) { thing.carriedBy = carrier.id; carrier.carry = { kind: 'brood', id: thing.id }; }
    else { thing.carrierIds = [carrier.id]; carrier.carry = { kind: 'item', id: thing.id }; }
  }

  clear(): void {
    this.state.ants.length = 0; this.state.brood.length = 0; this.state.items.length = 0; this.state.colonies.length = 0;
    this.state.player.possessedAntId = -1; this.acc = 0;
  }

  /** Advances real time; whole ticks are simulated, the remainder becomes the interpolation alpha. */
  advance(seconds: number): void {
    this.acc += seconds;
    while (this.acc >= TICK_S - 1e-9) { this.acc -= TICK_S; this.tick(); }
    if (this.acc < 0) this.acc = 0;
  }

  private tick(): void {
    this.state.tick++;
    for (const a of this.state.ants) {
      a.prevPos = cp(a.pos); a.prevUp = cp(a.up); a.prevFwd = cp(a.fwd);
      if (a.script === 'still') continue;
      if (a.script === 'wander') this.steerWander(a);
      a.speed += (a.targetSpeed - a.speed) * Math.min(1, TICK_S * 6);
      if (a.turnRate) rotateAbout(a.fwd, a.up, a.turnRate * TICK_S);
      const ds = a.speed * TICK_S;
      a.pos.x += a.fwd.x * ds; a.pos.y += a.fwd.y * ds; a.pos.z += a.fwd.z * ds;
    }
  }

  private steerWander(a: DemoAnt): void {
    const r = this.rnd;
    a.turnRate += (r() - 0.5) * 6 * TICK_S - a.turnRate * 1.5 * TICK_S;
    const d = Math.hypot(a.pos.x, a.pos.z);
    if (d > this.bound) {
      const want = Math.atan2(-a.pos.x, -a.pos.z); const have = Math.atan2(a.fwd.x, a.fwd.z);
      const dh = Math.atan2(Math.sin(want - have), Math.cos(want - have));
      a.turnRate += Math.sign(dh) * 3 * TICK_S;
    }
    if (r() < 0.08 * TICK_S) a.targetSpeed = a.targetSpeed > 0 ? 0 : 6 * a.lengthBu * (this.buMm[this.speciesOf(a)] ?? 4) * (0.6 + 0.6 * r());
  }

  speciesOf(a: AntView): string { return this.state.colonies[a.colony]?.species ?? 'lasius-niger'; }
}

/** Rotates v about unit axis k by angle (Rodrigues), in place. */
export function rotateAbout(vv: Vec3, k: Vec3, ang: number): void {
  const c = Math.cos(ang), s = Math.sin(ang);
  const kx = k.y * vv.z - k.z * vv.y, ky = k.z * vv.x - k.x * vv.z, kz = k.x * vv.y - k.y * vv.x;
  const kd = k.x * vv.x + k.y * vv.y + k.z * vv.z;
  const x = vv.x * c + kx * s + k.x * kd * (1 - c), y = vv.y * c + ky * s + k.y * kd * (1 - c), z = vv.z * c + kz * s + k.z * kd * (1 - c);
  vv.x = x; vv.y = y; vv.z = z;
}
