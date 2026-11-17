// Collapse of unstable substrate (GDD 03 §12, T2), task weather-effects. Simple and fair: only wide soil ceilings in
// unstable conditions fall, always after a visible warning, never killing brood.
//   check     every game hour for nests with sand or humus ceilings, every COLLAPSE_SLOW_CHECK_TICKS otherwise,
//             when one of the nest's plans completes, when the soil moisture at its chambers moved by more than
//             COLLAPSE_MOISTURE_DELTA since the last check, and at once on `disturbNest` (S_max x 0.5 in the region)
//   warning   `collapse-warning` + `collapse-rumble` cue + Nest.collapse record; due after 60 s (Harsh 30 s)
//   expiry    re-evaluate; if still unstable and the `collapse` rule is on (off on Gentle): refill the unstable
//             voxels and the open column above each up to the ceiling (LOOSE debris), at most 64 BU^3 per event,
//             most unsupported first; a roof <= 1.5 BU thick also opens a 1 BU hole to the surface
//   contents  brood, items and ants in refilled voxels move to the nearest open voxel; brood is unharmed, the
//             ants caught are stunned 3 s and lose 10 % max hp (ants whose spot stays open are not touched)
// Also publishes `diag-nest-stability:<nestId>` for the player's nests whenever its status or count changes (so
// 'bad' ends a game day after the last collapse).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Chamber, MaterialId, Nest, Sim, System } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import {
  COLLAPSE_BREACH_RADIUS_BU, COLLAPSE_CHECK_TICKS, COLLAPSE_FILL_R_VOXELS, COLLAPSE_HOURLY_MATERIALS, COLLAPSE_HP_LOSS,
  COLLAPSE_MAX_VOLUME_BU3, COLLAPSE_MOISTURE_DELTA, COLLAPSE_ROOF_BREACH_BU, COLLAPSE_SLOW_CHECK_TICKS, COLLAPSE_STUN_S, COLLAPSE_WARN_HARSH_S,
  COLLAPSE_WARN_S, FLOOD_STEP_TICKS, WX_STUN_KEY,
} from '@/sim/balance/weather';
import { difficultyValue, effectiveRule } from '@/sim/balance/difficulty';
import { placeOnSurface } from '@/sim/locomotion';
import { getDiagnostic, publishDiagnostic } from '@/sim/progression/diagnostics';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { OPEN_MIN } from '../carve/keys';
import { carveCapsule, fillSphere, forChangedSamples, readBox } from '../carveOps';
import { nestRuntime } from '../runtime';
import { moistureAt } from '../substrate';
import { ceilingSample, spanLimit, unstableSet, type UnstableSet } from './stability';

export { unstableSet, maxSpanOf, spanLimit } from './stability';

const CHECK_OFFSET = 160;
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
const HOURLY = new Set<string>(COLLAPSE_HOURLY_MATERIALS);

function warnTicks(sim: Sim): number {
  const s = sim.state.config.difficulty.preset === 'harsh' ? COLLAPSE_WARN_HARSH_S : COLLAPSE_WARN_S;
  return Math.round(s * TICKS_PER_SECOND);
}

function centroid(u: UnstableSet, v: number): { c: Vec3; r: number } {
  let x = 0, y = 0, z = 0;
  const n = u.samples.length / 3;
  for (let s = 0; s < u.samples.length; s += 3) { x += u.samples[s]; y += u.samples[s + 1]; z += u.samples[s + 2]; }
  const c = { x: (x / n) * v, y: (y / n) * v, z: (z / n) * v };
  let r = 0;
  for (let s = 0; s < u.samples.length; s += 3) r = Math.max(r, Math.hypot(u.samples[s] * v - c.x, u.samples[s + 1] * v - c.y, u.samples[s + 2] * v - c.z));
  return { c, r: r + v };
}

function warnedChamber(sim: Sim, nest: Nest, c: Chamber): boolean {
  return nest.collapse.some((w) => Math.hypot(w.center.x - c.center.x, w.center.z - c.center.z) <= Math.max(c.radii.x, c.radii.z) && Math.abs(w.center.y - c.center.y) <= c.radii.y + sim.carve.voxel * 2);
}

/** Checks a nest's chambers and raises warnings for unstable ones; returns the warnings added. */
export function checkNest(sim: Sim, nest: Nest, smaxMult = 1, region?: { center: Vec3; radius: number }): number {
  let added = 0;
  for (const c of nest.chambers) {
    if (region && Math.hypot(c.center.x - region.center.x, c.center.y - region.center.y, c.center.z - region.center.z) > region.radius + Math.max(c.radii.x, c.radii.z)) continue;
    if (warnedChamber(sim, nest, c)) continue;
    const u = unstableSet(sim, c, smaxMult);
    if (!u) continue;
    const { c: center, r } = centroid(u, sim.carve.voxel);
    const vol = (u.samples.length / 3) * (sim.carve.voxel / sim.world.bu) ** 3;
    const id = sim.state.nextId++;
    nest.collapse.push({ id, center, radius: r, voxelCount: u.samples.length / 3, startTick: sim.state.tick, dueTick: sim.state.tick + warnTicks(sim) });
    sim.emit({ type: 'collapse-warning', nestId: nest.id, center: { ...center }, radius: r, volume: vol });
    sim.emit({ type: 'cue', cue: 'collapse-rumble', pos: { ...center }, strength: 0.6 });
    added++;
  }
  return added;
}

function chamberAt(nest: Nest, p: Vec3, pad: number): Chamber | null {
  let best: Chamber | null = null, bq = Infinity;
  for (const c of nest.chambers) {
    const q = ((p.x - c.center.x) / (c.radii.x + pad)) ** 2 + ((p.y - c.center.y) / (c.radii.y + pad)) ** 2 + ((p.z - c.center.z) / (c.radii.z + pad)) ** 2;
    if (q < bq) { bq = q; best = c; }
  }
  return bq <= 1 ? best : null;
}

/** Refills an unstable set (with the columns above it, volume-capped); returns the volume filled (BU^3) and its box. */
function refill(sim: Sim, u: UnstableSet): { volume: number; center: Vec3; radius: number; topI: number; topK: number } {
  const v = sim.carve.voxel, bu = sim.world.bu, vox = (v / bu) ** 3;
  const cols: number[] = [];
  let budget = COLLAPSE_MAX_VOLUME_BU3, filled = 0;
  const seen = new Set<string>();
  for (let s = 0; s < u.samples.length && budget > 0; s += 3) {
    const i = u.samples[s], k = u.samples[s + 2];
    for (let j = u.samples[s + 1]; budget > 0 && sim.carve.sampleAt(i, j, k) >= OPEN_MIN; j++) {
      const key = `${i},${j},${k}`;
      if (seen.has(key)) break;
      seen.add(key);
      cols.push(i, j, k);
      budget -= vox;
    }
  }
  if (cols.length === 0) return { volume: 0, center: { x: 0, y: 0, z: 0 }, radius: 0, topI: 0, topK: 0 };
  let i0 = Infinity, j0 = Infinity, k0 = Infinity, i1 = -Infinity, j1 = -Infinity, k1 = -Infinity;
  for (let s = 0; s < cols.length; s += 3) {
    i0 = Math.min(i0, cols[s]); i1 = Math.max(i1, cols[s]);
    j0 = Math.min(j0, cols[s + 1]); j1 = Math.max(j1, cols[s + 1]);
    k0 = Math.min(k0, cols[s + 2]); k1 = Math.max(k1, cols[s + 2]);
  }
  const box = { i0: i0 - 2, j0: j0 - 2, k0: k0 - 2, i1: i1 + 2, j1: j1 + 2, k1: k1 + 2 };
  const before = readBox(sim, box);
  const r = COLLAPSE_FILL_R_VOXELS * v;
  for (let s = 0; s < cols.length; s += 3) fillSphere(sim, { x: cols[s] * v, y: cols[s + 1] * v, z: cols[s + 2] * v }, r);
  const flags = nestRuntime(sim).flags;
  forChangedSamples(sim, box, before, (i, j, k, old, now) => {
    if (now < old) flags.add(i, j, k, VoxelFlag.LOOSE);
    if (old >= OPEN_MIN && now < OPEN_MIN) filled += vox;
  });
  const center = { x: ((i0 + i1) / 2) * v, y: ((j0 + j1) / 2) * v, z: ((k0 + k1) / 2) * v };
  const radius = Math.hypot(i1 - i0, j1 - j0, k1 - k0) * v / 2 + v;
  return { volume: filled, center, radius, topI: u.samples[0], topK: u.samples[2] };
}

/** Nearest open carve sample to p within maxR (mm) into out (sample centre, lowest layer first on ties). */
export function nearestOpenSample(sim: Sim, p: Vec3, maxR: number, out: Vec3): boolean {
  const v = sim.carve.voxel, ci = Math.round(p.x / v), cj = Math.round(p.y / v), ck = Math.round(p.z / v);
  const R = Math.ceil(maxR / v);
  let best = Infinity;
  for (let dj = -R; dj <= R; dj++) for (let dk = -R; dk <= R; dk++) for (let di = -R; di <= R; di++) {
    const d2 = di * di + dj * dj + dk * dk;
    if (d2 >= best || d2 > R * R) continue;
    if (sim.carve.sampleAt(ci + di, cj + dj, ck + dk) < OPEN_MIN) continue;
    best = d2;
    out.x = (ci + di) * v; out.y = (cj + dj) * v; out.z = (ck + dk) * v;
  }
  return best < Infinity;
}

/** An ant near a slumping chamber and the openness at its position before the refill. */
interface Bystander { ant: Ant; open: number }

/** Ants that may be caught by a chamber's slump (taken before the refill). */
function bystanders(sim: Sim, c: Chamber): Bystander[] {
  const reach = Math.max(c.radii.x, c.radii.y, c.radii.z) + sim.world.bu;
  const out: Bystander[] = [];
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.medium === 'air') continue;
    if (Math.hypot(a.pos.x - c.center.x, a.pos.y - c.center.y, a.pos.z - c.center.z) > reach) continue;
    out.push({ ant: a, open: sim.carve.openness(a.pos.x, a.pos.y, a.pos.z) });
  }
  return out;
}

/** The refill turned this spot from open space into debris. */
function buriedNow(sim: Sim, p: Vec3, before: number): boolean {
  const now = sim.carve.openness(p.x, p.y, p.z);
  return now < 0.5 && now < before;
}

/**
 * GDD 03 §12 "Contents": ants, brood and items inside refilled voxels move to the nearest open voxel; ants caught
 * there are stunned 3 s and lose 10 % max hp (x difficulty damage), brood is unharmed. Ants whose own spot stayed
 * open are not touched.
 */
function displaceContents(sim: Sim, center: Vec3, radius: number, ants: Bystander[]): void {
  const out = { x: 0, y: 0, z: 0 };
  const reach = radius + 4 * sim.world.bu;
  const inside = (p: Vec3): boolean => Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z) <= radius;
  const buried = (p: Vec3): boolean => sim.carve.openness(p.x, p.y, p.z) < 0.5;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.carriedBy >= 0 || !inside(b.pos) || !buried(b.pos)) continue;
    if (nearestOpenSample(sim, b.pos, reach, out)) b.pos = { ...out };
  }
  for (const it of sim.stores.items.list) {
    if (!it.alive || it.carrierIds.length > 0 || !inside(it.pos) || !buried(it.pos)) continue;
    if (nearestOpenSample(sim, it.pos, reach, out)) it.pos = { ...out };
  }
  const stunUntil = sim.state.tick + Math.round(COLLAPSE_STUN_S * TICKS_PER_SECOND);
  const hurt = COLLAPSE_HP_LOSS * difficultyValue(sim, 'damageTakenMult');
  for (const { ant, open } of ants) {
    if (!ant.alive || !buriedNow(sim, ant.pos, open)) continue;
    moveOut(sim, ant, reach, out);
    ant.bb[WX_STUN_KEY] = Math.max(ant.bb[WX_STUN_KEY] ?? 0, stunUntil);
    ant.hp = Math.max(1e-6, ant.hp - hurt * ant.maxHp);
  }
}

/** Puts a buried ant on the open surface nearest to it (falls from the open voxel if no surface is found there). */
function moveOut(sim: Sim, ant: Ant, reach: number, out: Vec3): void {
  if (!nearestOpenSample(sim, ant.pos, reach, out)) return;
  if (placeOnSurface(sim, ant, out, DOWN) && sim.carve.openness(ant.pos.x, ant.pos.y, ant.pos.z) >= 0.5) return;
  ant.pos = { ...out };
  ant.medium = 'air';
  ant.vel = { x: 0, y: 0, z: 0 };
}

/** Applies a due warning: collapse if still unstable (and allowed). Returns the refilled volume, BU^3. */
export function applyCollapse(sim: Sim, nest: Nest, center: Vec3): number {
  if (!effectiveRule(sim.state.config, 'collapse')) return 0;
  const c = chamberAt(nest, center, sim.carve.voxel * 2);
  if (!c) return 0;
  const u = unstableSet(sim, c);
  if (!u) return 0;
  const v = sim.carve.voxel, bu = sim.world.bu;
  const jc = ceilingSample(sim, c);
  const ants = bystanders(sim, c);
  const res = refill(sim, u);
  if (res.volume <= 0) return 0;
  displaceContents(sim, res.center, res.radius, ants);
  // thin roof: open a hole to the surface above the most unsupported column
  let breach = false;
  if (!Number.isNaN(jc)) {
    const x = res.topI * v, z = res.topK * v;
    const roofBu = (sim.field.height(x, z) - jc * v) / bu;
    if (roofBu <= COLLAPSE_ROOF_BREACH_BU) {
      carveCapsule(sim, { x, y: jc * v - v, z }, { x, y: sim.field.height(x, z) + 0.5 * bu, z }, COLLAPSE_BREACH_RADIUS_BU * bu, { force: true });
      breach = true;
    }
  }
  nest.lastCollapseTick = sim.state.tick;
  sim.emit({ type: 'collapse', nestId: nest.id, center: { ...res.center }, radius: res.radius, volume: res.volume, breach });
  sim.emit({ type: 'cue', cue: 'collapse', pos: { ...res.center }, strength: 1 });
  return res.volume;
}

/** Human or weather disturbance (GDD 03 §12 `nest.disturb`): immediate check with S_max x 0.5 inside the region. */
export function disturbNest(sim: Sim, center: Vec3, radius: number, _cause: string): number {
  let n = 0;
  for (const nest of sim.stores.nests.list) if (nest.alive) n += checkNest(sim, nest, 0.5, { center, radius });
  return n;
}

function checkPeriod(sim: Sim, nest: Nest): number {
  for (const c of nest.chambers) {
    const { ceiling } = spanLimit(sim, c);
    if (HOURLY.has(ceiling as MaterialId)) return COLLAPSE_CHECK_TICKS;
  }
  return COLLAPSE_SLOW_CHECK_TICKS;
}

function stabilityStatus(sim: Sim, nest: Nest): 'ok' | 'warn' | 'bad' {
  const recent = nest.lastCollapseTick !== undefined && sim.state.tick - nest.lastCollapseTick < TICKS_PER_DAY;
  return recent ? 'bad' : nest.collapse.length > 0 ? 'warn' : 'ok';
}

function publishStability(sim: Sim, nest: Nest): void {
  const status = stabilityStatus(sim, nest);
  const warned = nest.collapse.length > 0;
  publishDiagnostic(sim, {
    id: `diag-nest-stability:${nest.id}`, system: 'nest', status,
    label: status === 'ok' ? 'Ceilings hold' : status === 'warn' ? 'Ceiling may collapse' : 'A ceiling collapsed',
    value: nest.collapse.length,
    factors: [
      { cause: 'wide-room', weight: warned ? 0.6 : 0.1, detail: `${nest.collapse.length} unstable ceiling(s)`, diagId: null },
      { cause: 'dry-sand', weight: 0.4, detail: 'dry or saturated sand spans less', diagId: null },
    ],
    remedies: status === 'ok' ? [] : ['remedy.marker.move-brood', 'remedy.dig.smaller-rooms', 'remedy.dig.under-stone'],
    sinceTick: -1, focus: { kind: 'nest', id: nest.id, pos: { ...nest.origin } },
  });
}

/** Republishes the player's nest stability when it differs from what is published (e.g. 'bad' expired). */
function refreshStability(sim: Sim, nest: Nest, changed: boolean): void {
  if (nest.colony !== sim.state.colonies[0]?.id) return;
  const d = getDiagnostic(sim, `diag-nest-stability:${nest.id}`);
  if (!changed && d && d.status === stabilityStatus(sim, nest) && d.value === nest.collapse.length) return;
  if (!changed && !d && nest.collapse.length === 0 && nest.lastCollapseTick === undefined) return;
  publishStability(sim, nest);
}

/** Mean soil moisture at the nest's chamber centres. */
function chamberMoisture(sim: Sim, nest: Nest): number {
  let m = 0;
  for (const c of nest.chambers) m += moistureAt(sim, c.center);
  return m / nest.chambers.length;
}

/** GDD 03 §12 "When checked": a plan finished since the last run, or the moisture moved by > 0.1 since the last check. */
function triggered(sim: Sim, nest: Nest, moisture: number): boolean {
  const t = sim.state.tick;
  for (const p of nest.digPlans) if (p.status === 'complete' && p.statusTick >= t - FLOOD_STEP_TICKS && p.statusTick < t) return true;
  return nest.stabilityMoisture === undefined || Math.abs(moisture - nest.stabilityMoisture) > COLLAPSE_MOISTURE_DELTA;
}

export function runCollapse(sim: Sim): void {
  const t = sim.state.tick;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    if (nest.chambers.length === 0) {
      refreshStability(sim, nest, false);
      continue;
    }
    let changed = false;
    for (let i = nest.collapse.length - 1; i >= 0; i--) {
      const w = nest.collapse[i];
      if (w.dueTick > t) continue;
      nest.collapse.splice(i, 1);
      applyCollapse(sim, nest, w.center);
      changed = true;
    }
    const hourly = (t + CHECK_OFFSET) % COLLAPSE_CHECK_TICKS === 0;
    const slow = (t + CHECK_OFFSET) % COLLAPSE_SLOW_CHECK_TICKS === 0;
    const moisture = chamberMoisture(sim, nest);
    const due = slow || (hourly && checkPeriod(sim, nest) === COLLAPSE_CHECK_TICKS) || triggered(sim, nest, moisture);
    if (due) {
      nest.stabilityMoisture = moisture;
      if (checkNest(sim, nest) > 0) changed = true;
    }
    refreshStability(sim, nest, changed);
  }
}

/** Collapse warnings and collapses (weather-effects). Registered by one line in src/sim/nest/index.ts. */
export const collapseSystem: System = { name: 'nest-collapse', phase: 'nest', every: FLOOD_STEP_TICKS, run: runCollapse };
