// Entrances (GDD 03 §4): registration from breaches (the field's terrain-hole mask, kernel decision 5), the
// open / sealing / sealed / reopening state machine, plugs (`seal-entrance`) and unplugging (`unseal-entrance`),
// entrance lookup. Nav fields are refreshed whenever an entrance changes.

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, EntranceStatus, Nest, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import {
  ENTRANCE_MERGE_DIST_BU, ENTRANCE_MIN_HOLE_COLUMNS, ENTRANCE_RADIUS_MAX_BU, ENTRANCE_RADIUS_MIN_BU,
  ENTRANCE_SCAN_BU, PLUG_AHEAD_BU, PLUG_ANT_CLEAR_BU, PLUG_RADIUS_BU, THROAT_BU, UNSEAL_RADIUS_BU,
} from '@/sim/balance/nest';
import { OPEN_MIN, type VoxelBox } from './carve/keys';
import { carveSphere, fillSphere, forChangedSamples, readBox, sphereBox } from './carveOps';
import { linkMoundToEntrance } from './mounds';
import { refreshNestFields } from './navFields';
import { nestRuntime } from './runtime';

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

/** Hole patches (8-connected open terrain columns) touching the box's x/z range become or widen entrances. */
export function registerHoles(sim: Sim, box: VoxelBox): void {
  const v = sim.carve.voxel, bu = sim.world.bu;
  const seen = new Set<number>();
  const key = (i: number, k: number) => (i + 32768) * 65536 + (k + 32768);
  const limit = Math.ceil((ENTRANCE_SCAN_BU * bu) / v);
  for (let k = box.k0; k <= box.k1; k++) for (let i = box.i0; i <= box.i1; i++) {
    if (seen.has(key(i, k)) || !sim.field.isHoleAt(i * v, k * v)) continue;
    // flood fill the patch, at most `limit` columns from its first column
    const cols: number[] = [i, k];
    seen.add(key(i, k));
    for (let q = 0; q < cols.length; q += 2) {
      const ci = cols[q], ck = cols[q + 1];
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        const ni = ci + di, nk = ck + dk;
        if (Math.abs(ni - i) > limit || Math.abs(nk - k) > limit || seen.has(key(ni, nk))) continue;
        if (!sim.field.isHoleAt(ni * v, nk * v)) continue;
        seen.add(key(ni, nk));
        cols.push(ni, nk);
      }
    }
    const n = cols.length / 2;
    if (n < ENTRANCE_MIN_HOLE_COLUMNS) continue; // a pinhole of the smooth union, not a passage
    let sx = 0, sz = 0;
    for (let q = 0; q < cols.length; q += 2) { sx += cols[q] * v; sz += cols[q + 1] * v; }
    const cx = sx / n, cz = sz / n;
    const radius = Math.min(ENTRANCE_RADIUS_MAX_BU * bu, Math.max(ENTRANCE_RADIUS_MIN_BU * bu, Math.sqrt((n * v * v) / Math.PI)));
    registerOpening(sim, { x: cx, y: sim.field.height(cx, cz), z: cz }, radius);
  }
}

/** One hole patch: widens a nearby entrance, or registers a new `dug` entrance of the nest it opens. */
function registerOpening(sim: Sim, pos: Vec3, radius: number): void {
  const bu = sim.world.bu, merge = ENTRANCE_MERGE_DIST_BU * bu;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const e of nest.entrances) {
      if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) > e.radius + merge) continue;
      if (radius > e.radius) { e.radius = radius; refreshNestFields(sim, nest); }
      return;
    }
  }
  const nest = nestOfCavityPoint(sim, { x: pos.x, y: pos.y - bu, z: pos.z });
  if (!nest) return;
  const e: Entrance = {
    id: sim.state.nextId++, kind: 'dug', status: 'open', pos, dir: terrainNormal(sim, pos.x, pos.z), radius,
    moundId: -1, rimTarget: 0, plugVoxelCount: 0, createdTick: sim.state.tick, trafficIn: 0, trafficOut: 0,
  };
  nest.entrances.push(e);
  linkMoundToEntrance(sim, nest, e);
  refreshNestFields(sim, nest);
  sim.emit({ type: 'entrance-opened', entranceId: e.id, nestId: nest.id, kind: e.kind });
  sim.emit({ type: 'breach', nestId: nest.id, entranceId: e.id, pos: { ...pos }, radius });
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

/** Closed PLUG samples in the throat. */
export function plugCount(sim: Sim, e: Entrance): number {
  const flags = nestRuntime(sim).flags;
  const b = sphereBox(sim, e.pos, throatR(sim, e), 0);
  if (flags.noneIn(b.i0, b.j0, b.k0, b.i1, b.j1, b.k1)) return 0;
  let n = 0;
  forThroatSamples(sim, e, (i, j, k) => {
    if ((flags.get(i, j, k) & VoxelFlag.PLUG) !== 0 && sim.carve.sampleAt(i, j, k) < OPEN_MIN) n++;
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
 * Is there a 6-connected path of open samples from the mouth (samples at the surface) to the inner end of the
 * throat? 6-connectivity is exactly the kernel nav's connectivity (its edge and corner steps need the face
 * neighbours), so "no passage" means nest-nav cannot cross the throat. `eroded` additionally requires every
 * face neighbour of a path sample to be open (a passage that walkers fit through, GDD 03 `NAV_CLEAR`).
 */
export function throatPassage(sim: Sim, e: Entrance, eroded: boolean): boolean {
  const carve = sim.carve, v = carve.voxel, R = throatR(sim, e), inner = R - 2 * v;
  const ok = (i: number, j: number, k: number): boolean => {
    if (carve.sampleAt(i, j, k) < OPEN_MIN) return false;
    if (!eroded) return true;
    return carve.sampleAt(i + 1, j, k) >= OPEN_MIN && carve.sampleAt(i - 1, j, k) >= OPEN_MIN
      && carve.sampleAt(i, j + 1, k) >= OPEN_MIN && carve.sampleAt(i, j - 1, k) >= OPEN_MIN
      && carve.sampleAt(i, j, k + 1) >= OPEN_MIN && carve.sampleAt(i, j, k - 1) >= OPEN_MIN;
  };
  const inSphere = (i: number, j: number, k: number) => (i * v - e.pos.x) ** 2 + (j * v - e.pos.y) ** 2 + (k * v - e.pos.z) ** 2 <= R * R;
  const seen = new Set<number>();
  const id = (i: number, j: number, k: number) => ((i & 1023) * 1024 + (j & 1023)) * 1024 + (k & 1023);
  const queue: number[] = [];
  forThroatSamples(sim, e, (i, j, k) => {
    // the mouth: samples at or above the terrain surface level inside the opening
    if (sim.field.substrateXYZ(i * v, j * v, k * v) < -0.5 * v) return;
    if (Math.hypot(i * v - e.pos.x, k * v - e.pos.z) > e.radius + v) return;
    if (!ok(i, j, k)) return;
    seen.add(id(i, j, k));
    queue.push(i, j, k);
  });
  const dirs = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  for (let q = 0; q < queue.length; q += 3) {
    const i = queue[q], j = queue[q + 1], k = queue[q + 2];
    const d2 = (i * v - e.pos.x) ** 2 + (j * v - e.pos.y) ** 2 + (k * v - e.pos.z) ** 2;
    if (d2 >= inner * inner && sim.field.substrateXYZ(i * v, j * v, k * v) < 0) return true;
    for (let n = 0; n < 18; n += 3) {
      const ni = i + dirs[n], nj = j + dirs[n + 1], nk = k + dirs[n + 2];
      const key = id(ni, nj, nk);
      if (seen.has(key) || !inSphere(ni, nj, nk) || !ok(ni, nj, nk)) continue;
      seen.add(key);
      queue.push(ni, nj, nk);
    }
  }
  return false;
}

/** Re-evaluates an entrance's status (GDD 03 §4.2); emits and refreshes the nav fields on a change. */
export function evaluateEntrance(sim: Sim, nest: Nest, e: Entrance): void {
  const plug = plugCount(sim, e);
  const pass = throatPassage(sim, e, false);
  const prev = e.status;
  let next: EntranceStatus = prev;
  if (prev === 'open') next = !pass ? 'sealed' : plug > 0 ? 'sealing' : 'open';
  else if (prev === 'sealing') next = !pass ? 'sealed' : plug === 0 ? 'open' : 'sealing';
  else if (prev === 'sealed' || prev === 'reopening') {
    if (pass) next = throatPassage(sim, e, true) ? 'open' : 'reopening';
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

// ---- plugs ----

const ANT_LENGTH_HEAD = 0.5;

/** Head point of an ant (body centre + half a body length forward), mm. */
function headOf(sim: Sim, antId: number): Vec3 | null {
  const a = sim.stores.ants.get(antId);
  if (!a) return null;
  const d = ANT_LENGTH_HEAD * a.lengthBu * sim.world.bu;
  return { x: a.pos.x + a.fwd.x * d, y: a.pos.y + a.fwd.y * d, z: a.pos.z + a.fwd.z * d };
}

/**
 * One plug (`seal-entrance` effect, GDD 03 §4.2): fills the open throat voxels within PLUG_RADIUS of a point
 * PLUG_AHEAD ahead of the head toward the opening (re-centred on the open part still left there), keeping
 * PLUG_ANT_CLEAR from every ant; the filled voxels get LOOSE | PLUG. True when the entrance is sealed now.
 */
export function sealEntranceImpl(sim: Sim, entranceId: number, antId: number): boolean {
  const found = entranceById(sim, entranceId);
  if (!found) return false;
  const { nest, e } = found;
  const bu = sim.world.bu, v = sim.carve.voxel;
  const head = headOf(sim, antId) ?? { x: e.pos.x - e.dir.x * 2 * bu, y: e.pos.y - e.dir.y * 2 * bu, z: e.pos.z - e.dir.z * 2 * bu };
  const tx = e.pos.x - head.x, ty = e.pos.y - head.y, tz = e.pos.z - head.z, tl = Math.hypot(tx, ty, tz) || 1;
  const ahead = Math.min(PLUG_AHEAD_BU * bu, tl);
  const nominal = { x: head.x + (tx / tl) * ahead, y: head.y + (ty / tl) * ahead, z: head.z + (tz / tl) * ahead };
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
  evaluateEntrance(sim, nest, e);
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
  const c: Vec3 = best;
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

/** Periodic re-check of every entrance (fills, tamping and collapses elsewhere can close a throat). */
export function checkEntrances(sim: Sim): void {
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const e of nest.entrances) evaluateEntrance(sim, nest, e);
  }
}

