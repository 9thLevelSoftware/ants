// Entrances (GDD 03 §4): registration from breaches (the field's terrain-hole mask, kernel decision 5), the
// open / sealing / sealed / reopening state machine, plugs (`seal-entrance`) and unplugging (`unseal-entrance`),
// entrance lookup. Nav fields are refreshed whenever an entrance changes.

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, EntranceCloseCause, EntranceKind, EntranceStatus, Nest, Sim } from '@/sim/types';
import { raiseAlert } from '@/sim/progression';
import { heightAt } from '@/sim/world/terrainSample';
import { VoxelFlag } from '@/sim/types';
import {
  ENTRANCE_MERGE_DIST_BU, ENTRANCE_MIN_HOLE_COLUMNS, ENTRANCE_RADIUS_MAX_BU, ENTRANCE_RADIUS_MIN_BU,
  ENTRANCE_SCAN_BU, MOUND_MIN_H_BU, PLUG_AHEAD_BU, PLUG_ANT_CLEAR_BU, PLUG_RADIUS_BU, THROAT_BU, UNSEAL_RADIUS_BU,
} from '@/sim/balance/nest';
import { FOUND_POCKET_MAX_SAMPLES } from '@/sim/balance/founding';
import { OPEN_MIN, type VoxelBox } from './carve/keys';
import { carveSphere, fillSphere, forChangedSamples, readBox, sphereBox } from './carveOps';
import { clearPilesAround, linkMoundToEntrance } from './mounds';
import { moundOrigin } from './moundRelax';
import { refreshNestFields } from './navFields';
import { chunkStampSum, nestRuntime } from './runtime';
import { dynPrimsNear } from './tampRetry';

/** The entrance with this id and its nest, or null. */
export function entranceById(sim: Sim, id: number): { nest: Nest; e: Entrance } | null {
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const e of nest.entrances) if (e.id === id) return { nest, e };
  }
  return null;
}

/** Component labels (kernel nav) of a nest's known cavity points: chambers, entrance throats, origin, plan anchors. */
export function nestComponents(sim: Sim, nest: Nest): Set<number> {
  const out = new Set<number>();
  const bu = sim.world.bu;
  const add = (p: Vec3): void => {
    const c = sim.nestNav.componentAt(p);
    if (c >= 0) out.add(c);
  };
  for (const c of nest.chambers) add(c.center);
  for (const e of nest.entrances) add({ x: e.pos.x - e.dir.x * bu, y: e.pos.y - e.dir.y * bu, z: e.pos.z - e.dir.z * bu });
  add(nest.origin);
  if (nest.founding) add(nest.founding.cavitySeed);
  for (const p of nest.digPlans) if (p.status !== 'complete' && p.status !== 'cancelled') add(p.anchor.pos);
  return out;
}

/** The nest whose cavity contains p (by nav component), or null. Ties: lower nest id. */
export function nestOfCavityPoint(sim: Sim, p: Vec3): Nest | null {
  const c = sim.nestNav.componentAt(p);
  if (c < 0) return null;
  for (const nest of sim.stores.nests.list) if (nest.alive && nestComponents(sim, nest).has(c)) return nest;
  return null;
}

/** Called after every carve or fill by the nest module: entrances from new holes, entrance states near the box. */
export function onCarveChanged(sim: Sim, box: VoxelBox, breach: boolean): void {
  if (breach) registerHoles(sim, box);
  const v = sim.carve.voxel, pad = (THROAT_BU + ENTRANCE_RADIUS_MAX_BU) * sim.world.bu;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const e of nest.entrances) {
      if (e.pos.x < box.i0 * v - pad || e.pos.x > box.i1 * v + pad || e.pos.y < box.j0 * v - pad || e.pos.y > box.j1 * v + pad
        || e.pos.z < box.k0 * v - pad || e.pos.z > box.k1 * v + pad) continue;
      evaluateEntrance(sim, nest, e);
    }
  }
}

/** Breach records added to the carve grid by others (cheats, other modules): turned into entrances. */
export function processNewBreaches(sim: Sim): void {
  const rt = nestRuntime(sim);
  const list = sim.carve.breaches;
  if (list.length < rt.breachSeen) rt.breachSeen = list.length;
  if (list.length === rt.breachSeen) return;
  const v = sim.carve.voxel;
  for (let n = rt.breachSeen; n < list.length; n++) {
    const b = list[n];
    const r = b.r + v * 2;
    registerHoles(sim, {
      i0: Math.floor((b.pos.x - r) / v), j0: 0, k0: Math.floor((b.pos.z - r) / v),
      i1: Math.ceil((b.pos.x + r) / v), j1: 0, k1: Math.ceil((b.pos.z + r) / v),
    });
  }
  rt.breachSeen = list.length;
}

const colKey = (i: number, k: number): number => (i + 32768) * 65536 + (k + 32768);

/**
 * The hole patch (8-connected open terrain columns, as i, k pairs) through column (i, k), at most `limit`
 * columns from it; its columns are added to `seen`. Empty when (i, k) is not a hole column or already seen.
 */
function holePatch(sim: Sim, i: number, k: number, limit: number, seen: Set<number>): number[] {
  const v = sim.carve.voxel;
  if (seen.has(colKey(i, k)) || !sim.field.isHoleAt(i * v, k * v)) return [];
  const cols: number[] = [i, k];
  seen.add(colKey(i, k));
  for (let q = 0; q < cols.length; q += 2) {
    const ci = cols[q], ck = cols[q + 1];
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const ni = ci + di, nk = ck + dk;
      if (Math.abs(ni - i) > limit || Math.abs(nk - k) > limit || seen.has(colKey(ni, nk))) continue;
      if (!sim.field.isHoleAt(ni * v, nk * v)) continue;
      seen.add(colKey(ni, nk));
      cols.push(ni, nk);
    }
  }
  return cols;
}

/** Hole patches (8-connected open terrain columns) touching the box's x/z range become or widen entrances. */
export function registerHoles(sim: Sim, box: VoxelBox): void {
  const v = sim.carve.voxel, bu = sim.world.bu;
  const seen = new Set<number>();
  const limit = Math.ceil((ENTRANCE_SCAN_BU * bu) / v);
  for (let k = box.k0; k <= box.k1; k++) for (let i = box.i0; i <= box.i1; i++) {
    const cols = holePatch(sim, i, k, limit, seen);
    const n = cols.length / 2;
    if (n < ENTRANCE_MIN_HOLE_COLUMNS) continue; // a pinhole of the smooth union, not a passage
    let sx = 0, sz = 0;
    for (let q = 0; q < cols.length; q += 2) { sx += cols[q] * v; sz += cols[q + 1] * v; }
    const cx = sx / n, cz = sz / n;
    const radius = Math.min(ENTRANCE_RADIUS_MAX_BU * bu, Math.max(ENTRANCE_RADIUS_MIN_BU * bu, Math.sqrt((n * v * v) / Math.PI)));
    registerOpening(sim, { x: cx, y: sim.field.height(cx, cz), z: cz }, radius, cols);
  }
}

/**
 * Does the patch (i, k pairs) belong to entrance e? GDD 03 §4.1: breach voxels within ENTRANCE_MERGE_DIST of an
 * existing opening belong to it. The opening is the hole patch through e's centre (a ramp shaft's opening is
 * longer than the entrance disc), or the disc when that column is closed. 'same': the patch is that very hole.
 */
function patchJoins(sim: Sim, e: Entrance, cols: readonly number[]): 'same' | 'near' | null {
  const v = sim.carve.voxel, bu = sim.world.bu, merge = ENTRANCE_MERGE_DIST_BU * bu;
  const limit = Math.ceil((ENTRANCE_SCAN_BU * bu) / v);
  let near = false;
  for (let q = 0; q < cols.length && !near; q += 2) {
    near = Math.hypot(cols[q] * v - e.pos.x, cols[q + 1] * v - e.pos.z) <= e.radius + merge + limit * v;
  }
  if (!near) return null;
  const ci = Math.round(e.pos.x / v), ck = Math.round(e.pos.z / v);
  for (let q = 0; q < cols.length; q += 2) if (cols[q] === ci && cols[q + 1] === ck) return 'same';
  const own = holePatch(sim, ci, ck, limit, new Set());
  const opening = own.length > 0 ? own : [ci, ck];
  const reach = own.length > 0 ? merge : e.radius + merge;
  for (let q = 0; q < cols.length; q += 2) {
    for (let p = 0; p < opening.length; p += 2) {
      if (Math.hypot((cols[q] - opening[p]) * v, (cols[q + 1] - opening[p + 1]) * v) <= reach) return 'near';
    }
  }
  return null;
}

/**
 * One hole patch: widens the entrance it belongs to (when it is the entrance's own hole, the opening moves to its
 * centroid: GDD 03 §4.1 `pos` = centroid of the breach columns; a ramp shaft's hole grows along the ramp), or registers a new `dug`
 * entrance of the nest whose cavity it opens; a hole that nest-nav cannot link to any cavity yet (a fresh pit dug
 * from the surface) belongs to the nest of the bite that opened it (ownership.ts).
 */
function registerOpening(sim: Sim, pos: Vec3, radius: number, cols: readonly number[], kind: EntranceKind = 'dug', owner: Nest | null = null): Entrance | null {
  const bu = sim.world.bu;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const e of nest.entrances) {
      const join = patchJoins(sim, e, cols);
      if (!join) continue;
      if (radius > e.radius) {
        e.radius = radius;
        if (join === 'same') { e.pos = pos; e.dir = terrainNormal(sim, pos.x, pos.z); }
        clearPilesAround(sim, e); // the kept-clear disc grew or moved
        refreshNestFields(sim, nest);
      }
      return e;
    }
  }
  const nest = owner ?? nestOfCavityPoint(sim, { x: pos.x, y: pos.y - bu, z: pos.z }) ?? digOwnerNest(sim);
  if (!nest) return null;
  const e: Entrance = {
    id: sim.state.nextId++, kind, status: 'open', pos, dir: terrainNormal(sim, pos.x, pos.z), radius,
    moundId: -1, rimTarget: 0, plugVoxelCount: 0, createdTick: sim.state.tick, trafficIn: 0, trafficOut: 0, passSeen: false,
  };
  nest.entrances.push(e);
  linkMoundToEntrance(sim, nest, e);
  clearPilesAround(sim, e); // a new kept-clear disc
  refreshNestFields(sim, nest);
  sim.emit({ type: 'entrance-opened', entranceId: e.id, nestId: nest.id, kind: e.kind });
  sim.emit({ type: 'breach', nestId: nest.id, entranceId: e.id, pos: { ...pos }, radius });
  return e;
}

/**
 * A founding cavity that broke into a world cavity (a pre-carved void under a slab, a crack) reaches the air through
 * that cavity's own opening, which no breach of the nest registered (viab-founding: "natural entrance registration
 * at a founding breakthrough"). Registers the opening at `air` (the first open-air sample of the cell's leak) as a
 * `natural` entrance of `nest`: the hole patch through that column when there is one (or the entrance that patch
 * already belongs to), else a minimal opening at the point itself (a lateral gap under a slab edge). Returns it.
 */
export function registerNaturalOpening(sim: Sim, nest: Nest, air: Vec3): Entrance {
  const v = sim.carve.voxel, bu = sim.world.bu;
  const cols = holePatch(sim, Math.round(air.x / v), Math.round(air.z / v), Math.ceil((ENTRANCE_SCAN_BU * bu) / v), new Set());
  const n = cols.length / 2;
  if (n > 0) {
    let sx = 0, sz = 0;
    for (let q = 0; q < cols.length; q += 2) { sx += cols[q] * v; sz += cols[q + 1] * v; }
    const cx = sx / n, cz = sz / n;
    const radius = Math.min(ENTRANCE_RADIUS_MAX_BU * bu, Math.max(ENTRANCE_RADIUS_MIN_BU * bu, Math.sqrt((n * v * v) / Math.PI)));
    const e = registerOpening(sim, { x: cx, y: sim.field.height(cx, cz), z: cz }, radius, cols, 'natural', nest);
    if (e) return e;
  }
  const e: Entrance = {
    id: sim.state.nextId++, kind: 'natural', status: 'open', pos: { x: air.x, y: air.y, z: air.z }, dir: terrainNormal(sim, air.x, air.z),
    radius: ENTRANCE_RADIUS_MIN_BU * bu, moundId: -1, rimTarget: 0, plugVoxelCount: 0, createdTick: sim.state.tick, trafficIn: 0,
    trafficOut: 0, passSeen: false,
  };
  nest.entrances.push(e);
  refreshNestFields(sim, nest);
  sim.emit({ type: 'entrance-opened', entranceId: e.id, nestId: nest.id, kind: e.kind });
  return e;
}

/** The nest whose dig bite is running now (ownership.ts withDigOwner), or null. */
function digOwnerNest(sim: Sim): Nest | null {
  const id = nestRuntime(sim).digOwner;
  const n = id >= 0 ? sim.stores.nests.get(id) : undefined;
  return n && n.alive ? n : null;
}

function terrainNormal(sim: Sim, x: number, z: number): Vec3 {
  const d = sim.carve.voxel;
  const gx = (sim.field.height(x + d, z) - sim.field.height(x - d, z)) / (2 * d);
  const gz = (sim.field.height(x, z + d) - sim.field.height(x, z - d)) / (2 * d);
  const l = Math.hypot(gx, 1, gz);
  return { x: -gx / l, y: 1 / l, z: -gz / l };
}

// ---- state machine ----

/** Throat sphere radius around the opening, mm. */
function throatR(sim: Sim, e: Entrance): number {
  return e.radius + THROAT_BU * sim.world.bu;
}

/**
 * Closed PLUG samples in the throat that are real soil: a sample at or above the ground surface (the plug fill
 * reached it, but the field there is open air) is a ghost no bite can find and no walker meets, so it is not counted
 * (nest-fix3 item 4a: a throat left with ghosts only stayed `sealing` for good).
 */
export function plugCount(sim: Sim, e: Entrance): number {
  const flags = nestRuntime(sim).flags;
  const b = sphereBox(sim, e.pos, throatR(sim, e), 0);
  if (flags.noneIn(b.i0, b.j0, b.k0, b.i1, b.j1, b.k1)) return 0;
  const v = sim.carve.voxel;
  let n = 0;
  forThroatSamples(sim, e, (i, j, k) => {
    if ((flags.get(i, j, k) & VoxelFlag.PLUG) === 0 || sim.carve.sampleAt(i, j, k) >= OPEN_MIN) return;
    if (sim.field.substrateXYZ(i * v, j * v, k * v) < 0) n++;
  });
  return n;
}

function forThroatSamples(sim: Sim, e: Entrance, fn: (i: number, j: number, k: number) => void): void {
  const v = sim.carve.voxel, R = throatR(sim, e), b = sphereBox(sim, e.pos, R, 0);
  for (let k = b.k0; k <= b.k1; k++) for (let j = b.j0; j <= b.j1; j++) for (let i = b.i0; i <= b.i1; i++) {
    const dx = i * v - e.pos.x, dy = j * v - e.pos.y, dz = k * v - e.pos.z;
    if (dx * dx + dy * dy + dz * dz <= R * R) fn(i, j, k);
  }
}

/**
 * The founding pocket rule (viab-founding: "sealed" must be stable): while a nest is still founding (its record not
 * `established`) and has a chamber, a passage through the throat counts only if it leads on to a chamber through
 * carved space. A dead-end pit dug beside the opening (the queen's first bites in the search) reaches the throat's
 * inner shell but leads nowhere, and kept the cell's entrance from ever reading `sealed` with the cell cut off.
 * Returns a test "does the carved space at this inner-shell sample lead to a chamber?", or null (the plain rule).
 * Bounded breadth-first search over open carved samples below the ground; samples of pockets already found are
 * remembered for the rest of the returned test's life. `blocked`: samples treated as solid as well (the founding seal
 * guide's predicted plugs, colony/founding/leak.ts, which uses this same rule).
 */
export function foundingPocketTest(
  sim: Sim, nest: Nest | null, blocked: ((i: number, j: number, k: number) => boolean) | null = null,
): ((i: number, j: number, k: number) => boolean) | null {
  if (!nest || !nest.founding || nest.founding.state === 'established' || nest.chambers.length === 0) return null;
  const carve = sim.carve, v = carve.voxel;
  const inChamber = (x: number, y: number, z: number): boolean => nest.chambers.some((c) =>
    ((x - c.center.x) / Math.max(v, c.radii.x)) ** 2 + ((y - c.center.y) / Math.max(v, c.radii.y)) ** 2 + ((z - c.center.z) / Math.max(v, c.radii.z)) ** 2 <= 1);
  const pocket = new Set<number>();
  const id = (i: number, j: number, k: number) => ((i & 2047) * 2048 + (j & 2047)) * 2048 + (k & 2047);
  const dirs = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  return (i0, j0, k0) => {
    if (pocket.has(id(i0, j0, k0))) return false;
    const seen = new Set<number>([id(i0, j0, k0)]);
    const queue = [i0, j0, k0];
    for (let q = 0; q < queue.length && seen.size < FOUND_POCKET_MAX_SAMPLES; q += 3) {
      const i = queue[q], j = queue[q + 1], k = queue[q + 2];
      if (inChamber(i * v, j * v, k * v)) return true;
      for (let n = 0; n < 18; n += 3) {
        const ni = i + dirs[n], nj = j + dirs[n + 1], nk = k + dirs[n + 2], key = id(ni, nj, nk);
        if (seen.has(key) || carve.sampleAt(ni, nj, nk) < OPEN_MIN || sim.field.substrateXYZ(ni * v, nj * v, nk * v) >= 0) continue;
        if (blocked && blocked(ni, nj, nk)) continue;
        seen.add(key);
        queue.push(ni, nj, nk);
      }
    }
    if (seen.size >= FOUND_POCKET_MAX_SAMPLES) return true; // too large to be a pit: the plain rule
    for (const key of seen) pocket.add(key);
    return false;
  };
}

/**
 * Is there a 6-connected path of free samples (carved open, or open air above the ground) from the mouth to the
 * inner end of the throat? 6-connectivity is exactly the kernel nav's connectivity (its edge and corner steps
 * need the face neighbours), so "no passage" means nest-nav cannot cross the throat. When the whole cavity lies
 * inside the throat sphere, reaching every carved sample of it counts as a passage. `eroded` additionally
 * requires every face neighbour of a path sample to be free (a passage that walkers fit through, `NAV_CLEAR`).
 */
export function throatPassage(sim: Sim, e: Entrance, eroded: boolean, nest: Nest | null = null): boolean {
  const carve = sim.carve, v = carve.voxel, R = throatR(sim, e), inner = R - 2 * v;
  const pockets = foundingPocketTest(sim, nest);
  const free = (i: number, j: number, k: number): boolean =>
    carve.sampleAt(i, j, k) >= OPEN_MIN || sim.field.substrateXYZ(i * v, j * v, k * v) > 0;
  const ok = (i: number, j: number, k: number): boolean => {
    if (!free(i, j, k)) return false;
    if (!eroded) return true;
    return free(i + 1, j, k) && free(i - 1, j, k) && free(i, j + 1, k) && free(i, j - 1, k) && free(i, j, k + 1) && free(i, j, k - 1);
  };
  const inSphere = (i: number, j: number, k: number) => (i * v - e.pos.x) ** 2 + (j * v - e.pos.y) ** 2 + (k * v - e.pos.z) ** 2 <= R * R;
  const seen = new Set<number>();
  const id = (i: number, j: number, k: number) => ((i & 1023) * 1024 + (j & 1023)) * 1024 + (k & 1023);
  const queue: number[] = [];
  forThroatSamples(sim, e, (i, j, k) => {
    // the mouth: free samples at or above the terrain surface level inside the opening
    if (sim.field.substrateXYZ(i * v, j * v, k * v) < -0.5 * v) return;
    if (Math.hypot(i * v - e.pos.x, k * v - e.pos.z) > e.radius + v) return;
    if (!ok(i, j, k)) return;
    seen.add(id(i, j, k));
    queue.push(i, j, k);
  });
  if (queue.length === 0) return false;
  const dirs = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  for (let q = 0; q < queue.length; q += 3) {
    const i = queue[q], j = queue[q + 1], k = queue[q + 2];
    const d2 = (i * v - e.pos.x) ** 2 + (j * v - e.pos.y) ** 2 + (k * v - e.pos.z) ** 2;
    if (d2 >= inner * inner && sim.field.substrateXYZ(i * v, j * v, k * v) < 0 && (!pockets || pockets(i, j, k))) return true;
    for (let n = 0; n < 18; n += 3) {
      const ni = i + dirs[n], nj = j + dirs[n + 1], nk = k + dirs[n + 2];
      const key = id(ni, nj, nk);
      if (seen.has(key) || !inSphere(ni, nj, nk) || !ok(ni, nj, nk)) continue;
      seen.add(key);
      queue.push(ni, nj, nk);
    }
  }
  // a founding nest with its cell (the pocket rule applies): the cavity does not end inside the throat, so no
  // passage to a chamber means closed (a plug that filled the throat's whole lower part once read `open` here)
  if (pockets) return false;
  // the cavity ends inside the throat: open iff the mouth reaches carved space below the ground and no carved
  // sample of it is cut off from the mouth (a throat filled solid, with no carved sample left, is closed)
  let cutOff = false, reached = false;
  forThroatSamples(sim, e, (i, j, k) => {
    if (cutOff || carve.sampleAt(i, j, k) < OPEN_MIN || sim.field.substrateXYZ(i * v, j * v, k * v) >= 0) return;
    if (seen.has(id(i, j, k))) reached = true; else cutOff = true;
  });
  return reached && !cutOff;
}

const memos = new WeakMap<Sim, Map<number, string>>();
function entranceMemo(sim: Sim): Map<number, string> {
  let m = memos.get(sim);
  if (!m) { m = new Map(); memos.set(sim, m); }
  return m;
}

/**
 * Everything evaluateEntrance reads, kept local (nest-fix3 item 6, gate defect L11): the carve chunks of the throat
 * box (runtime chunk stamps, bumped by every carve or fill reaching them; flag edits always come with one), the piles
 * and moved primitives over it, terrain edits, the record itself; for a founding nest under the pocket rule (whose
 * search runs on into the cavity) also the nest's own carve counter. Keyed on the world-wide carve and flag versions
 * and the field's geometry version before, every bite or pile batch anywhere re-ran every throat search of every
 * nest (checkEntrances 50-95 ms on generated worlds).
 */
function evalSignature(sim: Sim, nest: Nest, e: Entrance): string {
  const rt = nestRuntime(sim);
  const box = sphereBox(sim, e.pos, throatR(sim, e), 1);
  const pocket = nest.founding && nest.founding.state !== 'established' && nest.chambers.length > 0;
  // the founding pocket rule also reads the nest's founding state and its chambers
  const fd = nest.founding ? `${nest.founding.state}:${nest.chambers.length}:${pocket ? rt.carveStamp.get(nest.id) ?? 0 : ''}` : '';
  return `${chunkStampSum(sim, box)}|${pileNear(sim, e)}|${dynPrimsNear(sim, box)}|${sim.state.worldDelta.heightDeltas.length}|${e.status}|${e.pos.x},${e.pos.y},${e.pos.z}|${e.radius}|${fd}`;
}

/**
 * Fingerprint of the mound heights over the throat (mound relaxation edits the pile grids in place, which the
 * field reads directly, so no version counter sees it): a weighted sum of the grid cells within the throat radius.
 */
function pileNear(sim: Sim, e: Entrance): number {
  const R = throatR(sim, e);
  let f = 0;
  for (const m of sim.state.worldDelta.mounds) {
    const { x0, z0 } = moundOrigin(m);
    const i0 = Math.max(0, Math.floor((e.pos.x - R - x0) / m.cell)), i1 = Math.min(m.n - 1, Math.ceil((e.pos.x + R - x0) / m.cell));
    const k0 = Math.max(0, Math.floor((e.pos.z - R - z0) / m.cell)), k1 = Math.min(m.n - 1, Math.ceil((e.pos.z + R - z0) / m.cell));
    for (let iz = k0; iz <= k1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const idx = iz * m.n + ix;
      f += m.h[idx] * (1 + ((idx * 2654435761) % 1013));
    }
  }
  return f;
}

/** Re-evaluates an entrance's status (GDD 03 §4.2); emits and refreshes the nav fields on a change. */
export function evaluateEntrance(sim: Sim, nest: Nest, e: Entrance): void {
  // the status is a function of the carve grid, the voxel flags, the field's geometry and the entrance record:
  // when none of them changed since this entrance's last evaluation, neither can the result (int-1B-sim: the
  // throat BFS every ENTRANCE_CHECK_TICKS was ~40 % of a small colony's tick). Runtime-only memo, so a restored
  // game evaluates once more and gets the same answer.
  const sig = evalSignature(sim, nest, e);
  const memo = entranceMemo(sim);
  if (memo.get(e.id) === sig) return;
  memo.set(e.id, sig);
  const plug = plugCount(sim, e);
  const pass = throatPassage(sim, e, false, nest);
  const prev = e.status;
  let next: EntranceStatus = prev;
  // GDD 03 §4.2: an open entrance goes `sealing` when a plug is ADDED ("first plug added"), not because plug
  // remnants are left in its throat after a reopen (int-1B-sim: an entrance the first workers dug open flipped to
  // `sealing` on its next check, which raised midden-blocked with the throat passable)
  if (prev === 'open') next = !pass ? 'sealed' : plug > e.plugVoxelCount ? 'sealing' : 'open';
  else if (prev === 'sealing') next = !pass ? 'sealed' : plug === 0 ? 'open' : 'sealing';
  else if (prev === 'sealed' || prev === 'reopening') {
    if (pass) next = throatPassage(sim, e, true, nest) ? 'open' : 'reopening';
    // a reopening throat that had a passage and lost it again (fill, tamping, a new plug) is closed again
    // (founding-close request 3); one still being dug through (no passage yet) stays `reopening`
    else if (prev === 'reopening' && e.passSeen) next = 'sealed';
    if (next === 'reopening' && pass) e.passSeen = true;
    else if (next !== 'reopening' && e.passSeen) e.passSeen = false;
  }
  e.plugVoxelCount = plug;
  if (next !== prev) setEntranceStatus(sim, nest, e, next);
}

export function setEntranceStatus(sim: Sim, nest: Nest, e: Entrance, next: EntranceStatus): void {
  const prev = e.status;
  if (prev === next) return;
  e.status = next;
  refreshNestFields(sim, nest);
  sim.emit({ type: 'entrance-state-changed', entranceId: e.id, status: next, prev });
  if (next === 'sealed' && (prev === 'open' || prev === 'sealing') && plugCount(sim, e) === 0) entranceClosed(sim, nest, e);
  const f = nest.founding;
  if (f && f.state === 'ready' && next === 'sealed' && nest.entrances.every((x) => x.status === 'sealed')) {
    f.state = 'sealed';
    f.sealedTick = sim.state.tick;
    sim.emit({ type: 'founding-sealed', nestId: nest.id, entranceId: e.id });
  } else if (f && f.state === 'reopening' && next === 'open') {
    f.state = 'established';
    sim.emit({ type: 'founding-reopened', nestId: nest.id });
  }
}

/**
 * Why an unplugged throat closed (sim-fix-colony): a pile over the opening (the field's ground there stands above
 * the terrain by more than MOUND_MIN_H), loose soil in the closed throat samples (tamped spoil, collapse debris,
 * flagged LOOSE without PLUG), or any other fill.
 */
export function closeCause(sim: Sim, e: Entrance): EntranceCloseCause {
  const pile = sim.field.height(e.pos.x, e.pos.z) - heightAt(sim.world.terrain, e.pos.x, e.pos.z);
  if (pile > MOUND_MIN_H_BU * sim.world.bu) return 'mound-buried';
  const flags = nestRuntime(sim).flags;
  let loose = false;
  forThroatSamples(sim, e, (i, j, k) => {
    if (loose || sim.carve.sampleAt(i, j, k) >= OPEN_MIN) return;
    const f = flags.get(i, j, k);
    if ((f & VoxelFlag.LOOSE) !== 0 && (f & VoxelFlag.PLUG) === 0) loose = true;
  });
  return loose ? 'soil-slumped' : 'filled';
}

const CLOSE_TEXT: Record<EntranceCloseCause, string> = {
  'mound-buried': 'soil piled over the opening',
  'soil-slumped': 'loose soil filled the passage',
  filled: 'the passage filled in',
};

/**
 * An entrance closed without a plug: noted, and reported by the nest system at the end of its tick
 * (flushClosedEntrances), once the operation that closed it has also written its voxel flags (fills flag their
 * samples LOOSE after the brush).
 */
function entranceClosed(sim: Sim, nest: Nest, e: Entrance): void {
  const pending = nestRuntime(sim).closedPending;
  if (!pending.some((x) => x.entranceId === e.id)) pending.push({ nestId: nest.id, entranceId: e.id });
}

/** Reports the entrances that closed without a plug since the last call (see entranceClosed). */
export function flushClosedEntrances(sim: Sim): void {
  const rt = nestRuntime(sim);
  if (rt.closedPending.length === 0) return;
  const list = rt.closedPending;
  rt.closedPending = [];
  for (const { nestId, entranceId } of list) {
    const nest = sim.stores.nests.get(nestId);
    const e = nest?.entrances.find((x) => x.id === entranceId);
    if (nest && e && e.status === 'sealed' && plugCount(sim, e) === 0) reportClosed(sim, nest, e);
  }
}

/** Event `entrance-closed` with its cause, and an alert for the player's colony. */
function reportClosed(sim: Sim, nest: Nest, e: Entrance): void {
  const cause = closeCause(sim, e);
  sim.emit({ type: 'entrance-closed', entranceId: e.id, nestId: nest.id, cause, pos: { ...e.pos } });
  if (sim.stores.colonies.get(nest.colony)?.isPlayer) {
    raiseAlert(sim, {
      kind: 'entrance-closed', level: 'warning', subjectId: e.id, title: 'An entrance has closed', cause: CLOSE_TEXT[cause],
      focus: { kind: 'entrance', id: e.id, pos: { ...e.pos } }, diagnosticId: null,
    });
  }
}

// ---- plugs ----

/** The head is half a body length ahead of the body centre (geometry, not a tunable). */
const ANT_LENGTH_HEAD = 0.5;

/** Head point of an ant (body centre + half a body length forward), mm. */
function headOf(sim: Sim, antId: number): Vec3 | null {
  const a = sim.stores.ants.get(antId);
  if (!a) return null;
  const d = ANT_LENGTH_HEAD * a.lengthBu * sim.world.bu;
  return { x: a.pos.x + a.fwd.x * d, y: a.pos.y + a.fwd.y * d, z: a.pos.z + a.fwd.z * d };
}

/**
 * An aimed plug (viab-founding: the founding seal guide aims at the leak): the running `seal-entrance` was given a
 * target point other than the opening, within the plug's reach (PLUG_AHEAD + PLUG_RADIUS beyond the head, whichever
 * way the ant faces: measured from the body centre plus half a body length). Null: the default rule (ahead of the
 * head toward the opening).
 */
function plugAim(sim: Sim, e: Entrance, antId: number): Vec3 | null {
  const ant = sim.stores.ants.get(antId);
  const a = ant?.action;
  if (!ant || !a || a.id !== 'seal-entrance' || a.target.kind !== 'entrance' || a.target.id !== e.id) return null;
  const p = a.target.pos;
  if (Math.hypot(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z) < sim.carve.voxel) return null; // the opening itself
  const bu = sim.world.bu, reach = (PLUG_AHEAD_BU + PLUG_RADIUS_BU) * bu + ANT_LENGTH_HEAD * ant.lengthBu * bu;
  return Math.hypot(p.x - ant.pos.x, p.y - ant.pos.y, p.z - ant.pos.z) <= reach ? { x: p.x, y: p.y, z: p.z } : null;
}

/**
 * One plug (`seal-entrance` effect, GDD 03 §4.2): fills the open throat voxels within PLUG_RADIUS of a point
 * PLUG_AHEAD ahead of the head toward the opening (re-centred on the open part still left there), keeping
 * PLUG_ANT_CLEAR from every ant; the filled voxels get LOOSE | PLUG. An aimed plug (plugAim) centres on its aim
 * instead of the point ahead of the head. True when the entrance is sealed now.
 */
export function sealEntranceImpl(sim: Sim, entranceId: number, antId: number): boolean {
  const found = entranceById(sim, entranceId);
  if (!found) return false;
  const { nest, e } = found;
  const bu = sim.world.bu, v = sim.carve.voxel;
  const head = headOf(sim, antId) ?? { x: e.pos.x - e.dir.x * 2 * bu, y: e.pos.y - e.dir.y * 2 * bu, z: e.pos.z - e.dir.z * 2 * bu };
  const tx = e.pos.x - head.x, ty = e.pos.y - head.y, tz = e.pos.z - head.z, tl = Math.hypot(tx, ty, tz) || 1;
  const ahead = Math.min(PLUG_AHEAD_BU * bu, tl);
  const nominal = plugAim(sim, e, antId)
    ?? { x: head.x + (tx / tl) * ahead, y: head.y + (ty / tl) * ahead, z: head.z + (tz / tl) * ahead };
  const clear = PLUG_ANT_CLEAR_BU * bu;
  // re-centre on the open part of the throat around the nominal point (so successive plugs close the gaps)
  const R = PLUG_RADIUS_BU * bu, search = 1.5 * R;
  const near: Vec3[] = [];
  for (const a of sim.stores.ants.list) {
    if (a.alive && Math.hypot(a.pos.x - nominal.x, a.pos.y - nominal.y, a.pos.z - nominal.z) < search + 2 * R + clear) near.push(a.pos);
  }
  const nearAnt = (x: number, y: number, z: number): number => {
    let best = Infinity;
    for (const q of near) best = Math.min(best, Math.hypot(q.x - x, q.y - y, q.z - z));
    return best;
  };
  let sx = 0, sy = 0, sz = 0, n = 0;
  const sb = sphereBox(sim, nominal, search, 0);
  for (let k = sb.k0; k <= sb.k1; k++) for (let j = sb.j0; j <= sb.j1; j++) for (let i = sb.i0; i <= sb.i1; i++) {
    const x = i * v, y = j * v, z = k * v;
    if ((x - nominal.x) ** 2 + (y - nominal.y) ** 2 + (z - nominal.z) ** 2 > search * search) continue;
    if (sim.carve.sampleAt(i, j, k) < OPEN_MIN || nearAnt(x, y, z) < clear + R * 0.5) continue;
    sx += x; sy += y; sz += z; n++;
  }
  if (n === 0) { evaluateEntrance(sim, nest, e); return e.status === 'sealed'; }
  const c = { x: sx / n, y: sy / n, z: sz / n };
  const r = Math.min(R, nearAnt(c.x, c.y, c.z) - clear);
  if (r < v) return false;
  const box = sphereBox(sim, c, r, 2);
  const before = readBox(sim, box);
  fillSphere(sim, c, r);
  const flags = nestRuntime(sim).flags;
  forChangedSamples(sim, box, before, (i, j, k, old, now) => { if (now < old) flags.add(i, j, k, VoxelFlag.LOOSE | VoxelFlag.PLUG); });
  const prev = e.status;
  evaluateEntrance(sim, nest, e);
  if (e.status === prev && prev !== 'open') refreshNestFields(sim, nest); // new plug voxels seed D_seal
  return e.status === 'sealed';
}

/**
 * One unplugging bite (`unseal-entrance` effect): opens PLUG voxels within UNSEAL_RADIUS of the plug sample nearest
 * the digger's head (only plug voxels: the throat wall is never dug by it). True when the entrance is open again.
 */
export function unsealEntranceImpl(sim: Sim, entranceId: number, antId: number): boolean {
  const found = entranceById(sim, entranceId);
  if (!found) return false;
  const { nest, e } = found;
  const v = sim.carve.voxel, flags = nestRuntime(sim).flags;
  const from = headOf(sim, antId) ?? { x: e.pos.x - e.dir.x * throatR(sim, e), y: e.pos.y - e.dir.y * throatR(sim, e), z: e.pos.z - e.dir.z * throatR(sim, e) };
  let best: Vec3 | null = null, bestD = Infinity;
  forThroatSamples(sim, e, (i, j, k) => {
    if ((flags.get(i, j, k) & VoxelFlag.PLUG) === 0 || sim.carve.sampleAt(i, j, k) >= OPEN_MIN) return;
    const d = Math.hypot(i * v - from.x, j * v - from.y, k * v - from.z);
    if (d < bestD) { bestD = d; best = { x: i * v, y: j * v, z: k * v }; }
  });
  if (!best) { evaluateEntrance(sim, nest, e); return e.status === 'open'; }
  return unplugBite(sim, nest, e, best);
}

/** One unseal bite at `c`: opens the plug voxels within UNSEAL_RADIUS_BU of it, then re-evaluates e. */
function unplugBite(sim: Sim, nest: Nest, e: Entrance, c: Vec3): boolean {
  const v = sim.carve.voxel, flags = nestRuntime(sim).flags;
  const isPlug = (x: number, y: number, z: number) => (flags.get(Math.round(x / v), Math.round(y / v), Math.round(z / v)) & VoxelFlag.PLUG) !== 0;
  const r = UNSEAL_RADIUS_BU * sim.world.bu;
  const box = sphereBox(sim, c, r, 1);
  const before = readBox(sim, box);
  carveSphere(sim, c, r, { canDig: isPlug, recordBreach: false });
  forChangedSamples(sim, box, before, (i, j, k, _old, now) => { if (now >= OPEN_MIN) flags.clear(i, j, k, VoxelFlag.PLUG | VoxelFlag.LOOSE); });
  if (e.status === 'sealed') setEntranceStatus(sim, nest, e, 'reopening');
  evaluateEntrance(sim, nest, e);
  return e.status === 'open';
}

/**
 * The entrance of a nest whose plug the workers should dig out now (GDD 03 §4.2 `reopening`: "plug being dug"; §13
 * "nanitics dig it"): `reopening` with plug voxels left in its throat, while nobody closes the nest on purpose (no
 * live `seal` plan, no ant of the colony running `seal-entrance`). Lowest id first; null when there is none. The
 * founding module's reopen plans dig the passage; plug voxels the plans leave keep the throat narrower than
 * NAV_CLEAR (int-1B-sim: car-park-verge #3 stayed `reopening` with 211 plug voxels for the rest of the run).
 * A `sealing` throat is never offered: an open entrance only goes `sealing` when a plug is added, i.e. somebody is
 * closing it on purpose (a possessed ant pressing seal-entrance press by press, int-1B review), and §4.2 sends
 * workers to a plug only on reopening.
 */
export function entranceToUnplug(sim: Sim, nestId: number): Entrance | null {
  const nest = sim.stores.nests.get(nestId);
  if (!nest || !nest.alive) return null;
  let best: Entrance | null = null;
  for (const e of nest.entrances) {
    if (e.status !== 'reopening' || e.plugVoxelCount <= 0 || (best && e.id >= best.id)) continue;
    best = e;
  }
  if (!best) return null;
  if (nest.digPlans.some((p) => p.kind === 'seal' && p.status !== 'complete' && p.status !== 'cancelled')) return null;
  // a player re-plugging a reopening throat by hand wins over the diggers (rare: only scanned while one exists)
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === nest.colony && a.action?.id === 'seal-entrance') return null;
  return best;
}

/** Nearest open entrance of a nest to p (straight-line distance; ties: lower id), or null. */
export function nearestOpenEntrance(sim: Sim, nestId: number, p: Vec3): Entrance | null {
  const nest = sim.stores.nests.get(nestId);
  if (!nest) return null;
  let best: Entrance | null = null, bestD = Infinity;
  for (const e of nest.entrances) {
    if (e.status !== 'open') continue;
    const d = Math.hypot(e.pos.x - p.x, e.pos.y - p.y, e.pos.z - p.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * Entrances whose throat closed without a plug (fill, tamping, collapse or anything else covering it): the state
 * machine reports them `sealed` with plugVoxelCount 0, and this query lists them for the UI and the soak.
 */
export function coveredEntrances(sim: Sim): { nestId: number; entrance: Entrance }[] {
  const out: { nestId: number; entrance: Entrance }[] = [];
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const e of nest.entrances) if (e.status === 'sealed' && e.plugVoxelCount === 0) out.push({ nestId: nest.id, entrance: e });
  }
  return out;
}

/** Periodic re-check of every entrance (fills, tamping and collapses elsewhere can close a throat). */
export function checkEntrances(sim: Sim): void {
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const e of nest.entrances) evaluateEntrance(sim, nest, e);
  }
}

