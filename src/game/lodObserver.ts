// Locomotion's level-of-detail observer (walkers far from it take coarser steps) follows the camera focus. It is
// sampled at tick boundaries (SimDriver.beforeTick), never from the render path, so how often frames are drawn does
// not change the simulation; it is re-sent only when the focus moved more than 1 BU. The first tick of every
// session (new game or load) sends it, so a loaded game never runs with a stale or missing observer.
//
// Known limit (reported to loco / architecture): the focus is camera state, not a command or SimState, so a replay
// from seed + commands reproduces a run only if the camera focus was the same at each tick.
import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import { setLocoObserver } from '@/sim/locomotion';

export type ObserverSetter = (sim: Sim, pos: Vec3 | null) => void;

export class LodObserverFeed {
  private readonly last = { x: 0, y: 0, z: 0 };
  private sent = false;
  private readonly buf = { x: 0, y: 0, z: 0 };

  constructor(private readonly set: ObserverSetter = setLocoObserver) {}

  /** Forget the last observer (a new session); the next sample always sends. */
  reset(): void {
    this.sent = false;
  }

  /** Called before a tick with the current camera focus; sends it when it moved more than 1 BU (or never sent). */
  sample(sim: Sim, focus: (out: Vec3) => Vec3): void {
    const f = focus(this.buf), o = this.last;
    if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.z)) return;
    if (this.sent && Math.hypot(f.x - o.x, f.y - o.y, f.z - o.z) <= sim.world.bu) return;
    o.x = f.x; o.y = f.y; o.z = f.z;
    this.sent = true;
    this.set(sim, o);
  }
}
