// colony-life round 10 (direction 23a, item 5): the herds and the ground the colony sees. A measuring tool: it reads
// state and events and changes nothing.
//   herds     every aphid herd whose source lies within FUNNEL_RADIUS_BU of the entrance: found or not, the game hour
//             found, the task of the worker that found it, nearest approach of any outside worker while not found,
//             aphids and height of the herd's source above the ground (at the hand-over);
//   coverage  for the first COVER_DAYS game days: the share of the ground within the radius that came within 6 BU and
//             within 30 BU of any outside worker of the colony that day (cells of COVER_CELL_BU, sampled every
//             COVER_EVERY ticks), and the mean scouts' head-count that day.

import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { isWorkerCaste } from '@/sim/colony/census';
import { herdSourceOf } from '@/sim/ecology/plants/links';
import { colonySlotBit } from '@/sim/entities';
import { patchKnownBy } from '@/sim/ants/behaviours/outdoor/hunt';
import { round } from './lifeMetrics';
import { FUNNEL_RADIUS_BU } from './lifeFunnel';

const COVER_DAYS = 5, COVER_CELL_BU = 3, COVER_EVERY = 10;
const NEAR_BU = 6, WIDE_BU = 30;

export interface HerdRecord {
  herdId: number; distBu: number; aphids: number; heightBu: number;
  foundHour: number; foundByTask: string; nearestBu: number;
}
export interface CoverageDay { day: number; within6: number; within30: number; scouts: number }
/** A prey patch whose disc reaches the radius: edge distance, prey capacity, known (hour), nearest approach to its disc. */
export interface PatchRecord { patchId: number; edgeBu: number; radiusBu: number; k: number; knownHour: number; nearestBu: number }
export interface HerdReport { herds: HerdRecord[]; coverage: CoverageDay[]; patches?: PatchRecord[] }

export class HerdCoverageRecorder {
  private readonly col: number;
  private readonly t0: number;
  private readonly herds = new Map<number, HerdRecord & { srcId: number }>();
  private readonly coverage: CoverageDay[] = [];
  private readonly patches = new Map<number, PatchRecord>();
  private center: { x: number; z: number } | null = null;
  private n = 0;
  private near = new Uint8Array(0);
  private wide = new Uint8Array(0);
  private inDisk = 0;
  private scoutSamples = 0;
  private scoutSum = 0;

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    this.t0 = sim.state.tick;
    const e = this.entrancePos();
    if (!e) return;
    this.center = e;
    const bu = sim.world.bu;
    for (const h of sim.stores.herds.list) {
      const s = herdSourceOf(sim, h);
      if (!h.alive || !s) continue;
      const d = Math.sqrt((s.pos.x - e.x) ** 2 + (s.pos.z - e.z) ** 2) / bu;
      if (d > FUNNEL_RADIUS_BU) continue;
      const known = (s.discoveredBy & this.bit()) !== 0;
      this.herds.set(h.id, {
        herdId: h.id, srcId: s.id, distBu: round(d), aphids: Math.round(h.a),
        heightBu: round((s.pos.y - sim.field.height(s.pos.x, s.pos.z)) / bu),
        foundHour: known ? 0 : -1, foundByTask: known ? 'before' : '', nearestBu: Infinity,
      });
    }
    for (const p of sim.state.ecology.preyPatches) {
      const edge = (Math.sqrt((p.center.x - e.x) ** 2 + (p.center.z - e.z) ** 2) - p.radius) / bu;
      if (edge > FUNNEL_RADIUS_BU) continue;
      this.patches.set(p.id, { patchId: p.id, edgeBu: round(Math.max(0, edge)), radiusBu: round(p.radius / bu), k: Math.round(p.k), knownHour: patchKnownBy(sim, p, this.col) ? 0 : -1, nearestBu: Infinity });
    }
    sim.events.on('food-source-discovered', (ev) => {
      if (ev.colonyId !== this.col) return;
      for (const r of this.herds.values()) {
        if (r.srcId !== ev.sourceId || r.foundHour >= 0) continue;
        r.foundHour = round(((sim.state.tick - this.t0) / TICKS_PER_DAY) * 24);
        r.foundByTask = sim.stores.ants.get(ev.byAntId)?.task ?? '?';
      }
    });
    this.n = Math.ceil((2 * FUNNEL_RADIUS_BU) / COVER_CELL_BU);
    this.near = new Uint8Array(this.n * this.n);
    this.wide = new Uint8Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) if (this.inside(i, j)) this.inDisk++;
  }

  private bit(): number {
    return colonySlotBit(this.sim, this.col);
  }

  private inside(i: number, j: number): boolean {
    const x = (i + 0.5) * COVER_CELL_BU - FUNNEL_RADIUS_BU, z = (j + 0.5) * COVER_CELL_BU - FUNNEL_RADIUS_BU;
    return x * x + z * z <= FUNNEL_RADIUS_BU * FUNNEL_RADIUS_BU;
  }

  private entrancePos(): { x: number; z: number } | null {
    for (const nest of this.sim.stores.nests.list) {
      if (!nest.alive || nest.colony !== this.col) continue;
      const en = nest.entrances.find((x) => x.status !== 'sealed') ?? nest.entrances[0];
      if (en) return { x: en.pos.x, z: en.pos.z };
    }
    return null;
  }

  private mark(grid: Uint8Array, xBu: number, zBu: number, rBu: number): void {
    const n = this.n, r = Math.ceil(rBu / COVER_CELL_BU);
    const ci = Math.floor((xBu + FUNNEL_RADIUS_BU) / COVER_CELL_BU), cj = Math.floor((zBu + FUNNEL_RADIUS_BU) / COVER_CELL_BU);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const x = (i + 0.5) * COVER_CELL_BU - FUNNEL_RADIUS_BU - xBu, z = (j + 0.5) * COVER_CELL_BU - FUNNEL_RADIUS_BU - zBu;
      if (x * x + z * z <= rBu * rBu) grid[j * n + i] = 1;
    }
  }

  /** Call once after every sim.tick(). */
  tick(): void {
    const sim = this.sim, c = this.center;
    if (!c) return;
    const t = sim.state.tick - this.t0;
    if (t % COVER_EVERY !== 0) return;
    const day = Math.floor(t / TICKS_PER_DAY);
    const bu = sim.world.bu;
    const covering = day < COVER_DAYS;
    let scouts = 0;
    const open = [...this.herds.values()].filter((r) => r.foundHour < 0);
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== this.col || a.nestId >= 0 || !isWorkerCaste(a.caste)) continue;
      if (a.task === 'scout') scouts++;
      const x = (a.pos.x - c.x) / bu, z = (a.pos.z - c.z) / bu;
      if (covering) { this.mark(this.near, x, z, NEAR_BU); this.mark(this.wide, x, z, WIDE_BU); }
      if (t % 300 === 0) for (const r of this.patches.values()) {
        const p = sim.state.ecology.preyPatches.find((x) => x.id === r.patchId);
        if (!p) continue;
        const d = Math.max(0, Math.sqrt((a.pos.x - p.center.x) ** 2 + (a.pos.z - p.center.z) ** 2) - p.radius) / bu;
        if (d < r.nearestBu) r.nearestBu = d;
        if (r.knownHour < 0 && patchKnownBy(sim, p, this.col)) r.knownHour = round((t / TICKS_PER_DAY) * 24);
      }
      if (t % 300 === 0) for (const r of open) {
        const s = sim.stores.sources.get(r.srcId);
        if (!s) continue;
        const d = Math.sqrt((a.pos.x - s.pos.x) ** 2 + (a.pos.z - s.pos.z) ** 2) / bu;
        if (d < r.nearestBu) r.nearestBu = d;
      }
    }
    if (!covering) return;
    this.scoutSum += scouts; this.scoutSamples++;
    if ((t + COVER_EVERY) % TICKS_PER_DAY === 0) this.closeDay(day);
  }

  private closeDay(day: number): void {
    let a = 0, b = 0;
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      if (!this.inside(i, j)) continue;
      a += this.near[j * this.n + i]; b += this.wide[j * this.n + i];
    }
    this.coverage.push({ day: day + 1, within6: round(a / this.inDisk), within30: round(b / this.inDisk), scouts: round(this.scoutSum / Math.max(1, this.scoutSamples)) });
    this.near.fill(0); this.wide.fill(0); this.scoutSum = 0; this.scoutSamples = 0;
  }

  result(): HerdReport {
    const herds = [...this.herds.values()].map(({ srcId: _s, ...r }) => ({ ...r, nearestBu: r.foundHour >= 0 || !Number.isFinite(r.nearestBu) ? -1 : round(r.nearestBu) }));
    const patches = [...this.patches.values()].map((r) => ({ ...r, nearestBu: Number.isFinite(r.nearestBu) ? round(r.nearestBu) : -1 }));
    return { herds: herds.sort((x, y) => x.distBu - y.distBu), coverage: this.coverage, patches: patches.sort((x, y) => x.edgeBu - y.edgeBu) };
  }
}
