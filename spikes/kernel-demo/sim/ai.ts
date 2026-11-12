/**
 * Autonomous demo walkers on the production kernel: each ant shuttles between the deepest chamber and the
 * entrance by steering towards the BFS lookahead of NestNav (tangent-projected by the walker), on floors, walls
 * and ceilings alike. Fixed 0.1 s tick (design seed), prev* kept by walkerSnapshot for render interpolation.
 * A seeded RNG (core) adds a little wander; no Math.random.
 */
import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngSeed, type RngState } from '@/core/rng';
import type { Kernel } from '@/sim/kernel';
import { createWalkerKin, walkerPlace, walkerSnapshot, walkerStep, type WalkerKin } from '@/sim/locomotion/walker';
import { cross, dot, normalize, projectOnPlane, rotateAxis, v3 } from './vec';

export interface AIAnt { w: WalkerKin; goal: 0 | 1; speed: number; stuck: number; trips: number }

const FIELDS = ['exit', 'deep'] as const;
const _t = v3(), _d = v3(), _m = v3();

/** Turns w.fwd towards the tangent projection of d by at most maxAngle (radians). */
export function steerTowards(w: WalkerKin, d: Vec3, maxAngle: number): void {
  projectOnPlane(_d, d, w.up);
  if (dot(_d, _d) < 1e-8) return;
  normalize(_d, _d);
  cross(_m, w.fwd, _d);
  let a = Math.atan2(dot(_m, w.up), dot(w.fwd, _d));
  a = Math.max(-maxAngle, Math.min(maxAngle, a));
  rotateAxis(w.fwd, w.fwd, w.up, a);
}

export class AIColony {
  readonly ants: AIAnt[] = [];
  readonly tick = 0.1;
  readonly rng: RngState;
  arrive = 3; // BU
  stats = { steps: 0, ms: 0 };

  constructor(private k: Kernel, seed: number) { this.rng = rngSeed(seed); }

  /** Spawns n ants on open nest samples reachable in both fields (spread along the network). */
  spawn(n: number): number {
    const k = this.k, v = k.carve.voxel, cand: Vec3[] = [];
    for (const key of k.carve.data.keys) {
      k.carve.forEachOpenSample(key, (i, j, l, o) => {
        if (o < 250 || ((i * 7 + j * 13 + l * 5) % 11) !== 0) return;
        const p = v3(i * v, j * v, l * v);
        if (k.field.substrate(p) > -2) return; // underground only
        const a = k.nav.distanceAt('exit', p), b = k.nav.distanceAt('deep', p);
        if (a < Infinity && b < Infinity && a > 8) cand.push(p);
      });
    }
    let made = 0;
    for (let tries = 0; made < n && tries < n * 6 && cand.length; tries++) {
      const c = cand[Math.floor(rngFloat(this.rng) * cand.length)];
      const w = createWalkerKin(k.walker.footOffset);
      const a = rngFloat(this.rng) * 6.283;
      if (!walkerPlace(k.field, w, c, { heading: v3(Math.cos(a), 0, Math.sin(a)) })) continue;
      if (k.nav.distanceAt('exit', w.pos) === Infinity) continue;
      this.ants.push({ w, goal: rngFloat(this.rng) < 0.5 ? 0 : 1, speed: (5 + rngFloat(this.rng) * 2) * k.bu, stuck: 0, trips: 0 });
      made++;
    }
    return made;
  }

  step(now: () => number = () => 0): void {
    const t0 = now(), k = this.k, dt = this.tick;
    for (const a of this.ants) {
      const w = a.w;
      walkerSnapshot(w);
      if (w.medium === 'air') { walkerStep(k.field, w, null, 0, dt); continue; }
      const d0 = k.nav.lookahead(FIELDS[a.goal], w.pos, 4, _t);
      if (d0 <= this.arrive * k.bu) {
        a.goal = a.goal === 0 ? 1 : 0; a.trips++;
        rotateAxis(w.fwd, w.fwd, w.up, Math.PI * (0.8 + 0.4 * rngFloat(this.rng)));
      } else if (d0 < Infinity) {
        _t.x -= w.pos.x; _t.y -= w.pos.y; _t.z -= w.pos.z;
        steerTowards(w, _t, 4 * dt);
        rotateAxis(w.fwd, w.fwd, w.up, (rngFloat(this.rng) - 0.5) * 0.3);
      } else {
        a.goal = 1;
        rotateAxis(w.fwd, w.fwd, w.up, (rngFloat(this.rng) - 0.5));
      }
      const st = walkerStep(k.field, w, null, a.speed, dt);
      if (st === 'blocked' || w.speed < a.speed * 0.3) {
        if (++a.stuck > 2) { rotateAxis(w.fwd, w.fwd, w.up, (rngFloat(this.rng) - 0.5) * 2.5); a.stuck = 0; }
      } else a.stuck = 0;
      this.stats.steps++;
    }
    this.stats.ms += now() - t0;
  }
}
