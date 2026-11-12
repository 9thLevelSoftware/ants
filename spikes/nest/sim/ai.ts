/**
 * Autonomous nest walkers: each ant is a SurfaceWalker that steers down a BFS distance field (NavField.lookahead),
 * the desired direction being tangent-projected onto whatever surface it walks on (floor, wall or ceiling).
 * Ants shuttle between the deepest chamber and the surface. Fixed simulation tick (0.1 s, design seed) with
 * previous/current state kept for render interpolation.
 *
 * Pure TypeScript (no three).
 */
import { Field } from './field';
import { NavField } from './nav';
import { SurfaceWalker, DEFAULT_WALKER } from './walker';
import { mulberry32 } from './rng';
import { type Vec3, v3, copy, sub, dot } from './vec3';

export interface AIAnt {
  w: SurfaceWalker;
  goal: 0 | 1; // 0 = to surface, 1 = to chamber
  speed: number;
  prevPos: Vec3; prevUp: Vec3; prevFwd: Vec3;
  stuck: number;
  trips: number;
}

const _t = v3(), _d = v3();

export class AIColony {
  readonly field: Field;
  readonly navs: [NavField, NavField];
  readonly ants: AIAnt[] = [];
  readonly rng: () => number;
  readonly tick = 0.1;
  arriveDist = 9; // cost units (3 per voxel) => ~3 voxels
  stats = { steps: 0, us: 0 };

  constructor(field: Field, toSurface: NavField, toChamber: NavField, seed: number) {
    this.field = field; this.navs = [toSurface, toChamber]; this.rng = mulberry32(seed);
  }

  /** spawn n ants on open samples that are reachable in both fields, spread along the network */
  spawn(n: number): number {
    const nav = this.navs[0], v = nav.grid.voxel;
    const cand: [number, number, number][] = [];
    for (const [key, d] of nav.dist) {
      const d2 = this.navs[1].dist.get(key);
      if (!d2) continue;
      const cx = (key % 1024) - 512, cy = (Math.floor(key / 1024) % 1024) - 512, cz = Math.floor(key / 1048576) - 512;
      for (let idx = 0; idx < 4096; idx += 7) {
        if (d[idx] === 65535 || d2[idx] === 65535 || d[idx] < 30) continue;
        cand.push([(cx * 16 + (idx & 15)) * v, (cy * 16 + ((idx >> 4) & 15)) * v, (cz * 16 + (idx >> 8)) * v]);
      }
    }
    let made = 0;
    for (let a = 0; a < n * 4 && made < n && cand.length; a++) {
      const c = cand[Math.floor(this.rng() * cand.length)];
      const w = new SurfaceWalker(this.field, { ...DEFAULT_WALKER });
      if (!w.place(c[0], c[1], c[2], this.rng() * 6.283)) continue;
      // must actually be inside the nest (near the field)
      if (this.navs[0].nearest(w.pos) === null) continue;
      const ant: AIAnt = {
        w, goal: this.rng() < 0.5 ? 0 : 1, speed: 40 + this.rng() * 16,
        prevPos: v3(), prevUp: v3(), prevFwd: v3(), stuck: 0, trips: 0,
      };
      copy(ant.prevPos, w.pos); copy(ant.prevUp, w.upVis); copy(ant.prevFwd, w.fwdVis);
      this.ants.push(ant); made++;
    }
    return made;
  }

  /** one 0.1 s simulation tick for every ant */
  step(now: () => number = () => 0): void {
    const t0 = now();
    const dt = this.tick;
    for (const a of this.ants) {
      copy(a.prevPos, a.w.pos); copy(a.prevUp, a.w.upVis); copy(a.prevFwd, a.w.fwdVis);
      const w = a.w;
      if (w.falling) { w.update(dt, { forward: 0, turn: 0 }); continue; }
      const nav = this.navs[a.goal];
      const d0 = nav.lookahead(w.pos, 4, _t);
      if (d0 >= 0 && d0 <= this.arriveDist) {
        a.goal = a.goal === 0 ? 1 : 0; a.trips++;
        w.turn(Math.PI * (0.8 + 0.4 * this.rng()));
      } else if (d0 >= 0) {
        sub(_d, _t, w.pos);
        // steer, with a little seeded wander
        w.steerTowards(_d, 4.0 * dt);
        w.turn((this.rng() - 0.5) * 0.3);
      } else {
        // lost (e.g. wandered onto the surface outside the carve grid): head back for the nearest open sample
        a.goal = 1;
        w.turn((this.rng() - 0.5) * 1.0);
      }
      const moved = w.move(a.speed * dt);
      if (w.blocked || Math.abs(moved) < a.speed * dt * 0.3) {
        a.stuck++;
        if (a.stuck > 2) { w.turn((this.rng() - 0.5) * 2.5); a.stuck = 0; }
      } else a.stuck = 0;
      w.smoothVisual(dt);
      this.stats.steps++;
      // keep the forward of the previous state continuous for interpolation
      if (dot(a.prevFwd, w.fwdVis) < -0.5) copy(a.prevFwd, w.fwdVis);
    }
    this.stats.us += (now() - t0) * 1000;
  }
}
