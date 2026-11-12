// The `step` cue (GDD 08 §13.5): the sim emits no per-footfall event, so the audio derives steps from what it may
// read — the possessed ant's gait phase (one step per tripod, two per stride) and a sample of moving ants within
// 6 BU of the listener. Many steps at once become the crowd texture (CuePlayer). Material picks the step pitch.
import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';

export const STEP_NEAR_BU = 6;
/** Nearby ants sampled per refresh, and the refresh period (real s). */
const SAMPLE_MAX = 6;
const SAMPLE_EVERY_S = 0.25;

export type StepSink = (pos: Vec3, material: string) => void;

export class FootstepDriver {
  private lastPhase = new Map<number, number>();
  private sampleAge = 0;
  private near: number[] = [];
  private readonly probe: Vec3 = { x: 0, y: 0, z: 0 };

  /** Call once per frame while the game runs (not while paused). */
  update(sim: Sim, possessedId: number, hear: Vec3, dtS: number, sink: StepSink): void {
    const bu = sim.world.bu;
    if (possessedId >= 0) this.stepIfNewPhase(sim, possessedId, sink);
    this.sampleAge += dtS;
    if (this.sampleAge < SAMPLE_EVERY_S) return;
    this.sampleAge = 0;
    sim.index.queryAnts(hear, STEP_NEAR_BU * bu, this.near);
    let n = 0;
    const seen = new Set<number>();
    for (const id of this.near) {
      if (id === possessedId || n >= SAMPLE_MAX) continue;
      seen.add(id);
      if (this.stepIfNewPhase(sim, id, sink)) n++;
    }
    for (const id of [...this.lastPhase.keys()]) if (id !== possessedId && !seen.has(id)) this.lastPhase.delete(id);
  }

  private stepIfNewPhase(sim: Sim, id: number, sink: StepSink): boolean {
    const a = sim.stores.ants.get(id);
    if (!a || a.medium !== 'surface' && a.medium !== 'cavity') return false;
    const phase = Math.floor(a.gait * 2);
    const prev = this.lastPhase.get(id);
    this.lastPhase.set(id, phase);
    if (prev === undefined || prev === phase || a.speed <= 0) return false;
    const bu = sim.world.bu;
    this.probe.x = a.pos.x - a.up.x * 0.4 * bu;
    this.probe.y = a.pos.y - a.up.y * 0.4 * bu;
    this.probe.z = a.pos.z - a.up.z * 0.4 * bu;
    sink(a.pos, sim.field.materialAt(this.probe));
    return true;
  }

  reset(): void { this.lastPhase.clear(); }
}
