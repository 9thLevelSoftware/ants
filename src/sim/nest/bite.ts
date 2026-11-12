// The dig bite (GDD 03 §1.2) with the RAMP BRUSH of the nest spike (docs/research/spike-nest.md §5 item 5): a
// capsule whose floor starts at the digger's feet and runs along its horizontal heading at a world-relative
// slope, so the ant never engulfs itself and repeated bites extend the ramp it stands on. The capsule length is
// fitted (dry run over the same samples the brush writes) so a bite removes the nominal V_BITE_NOMINAL x
// headScale^3; nearby walkers are re-projected after the carve (carveOps).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, DigBiteResult, Sim } from '@/sim/types';
import { AntFlag, VoxelFlag } from '@/sim/types';
import {
  BITE_MIN_REMOVED, DIG_FACE_PROBE_BU, DIG_RAMP_FIT_STEPS, DIG_RAMP_MAX_LEN_BU, DIG_RAMP_RADIUS_BU, PLAN_CLIP_BU,
  V_BITE_NOMINAL,
} from '@/sim/balance/nest';
import { DIG_BITE_DEPTH_BU, DIG_MIN_SPEED } from '@/sim/balance/actions';
import { OPEN_FRACTION, OPEN_MIN } from './carve/keys';
import { carveCapsule, forChangedSamples, readBox } from './carveOps';
import { digNestFor, withDigOwner } from './ownership';
import { expelVolume, spawnPellet } from './pellets';
import { antSlot } from './plans/frontier';
import { planG } from './plans/geometry';
import { notePlanBite } from './plans/plans';
import { planCache } from './plans/targets';
import { nestRuntime } from './runtime';
import { digPowerOf, digSpeedAt, headScaleOf, speciesOf } from './substrate';

const FAIL = (reason: DigBiteResult['reason']): DigBiteResult => ({ ok: false, reason, voxels: 0, pelletId: -1, material: null });

/** The ramp capsule of one bite: start of the axis, unit axis direction, radius (mm). */
export interface Ramp { a: Vec3; d: Vec3; r: number }

/** Ramp from the feet along the horizontal heading at slopeDeg below the horizontal (positive = downward). */
export function rampOf(feet: Vec3, heading: Vec3, slopeDeg: number, r: number): Ramp {
  let hx = heading.x, hz = heading.z;
  const hl = Math.hypot(hx, hz);
  if (hl < 1e-9) { hx = 1; hz = 0; } else { hx /= hl; hz /= hl; }
  const s = (slopeDeg * Math.PI) / 180, cs = Math.cos(s), sn = Math.sin(s);
  const d = { x: hx * cs, y: -sn, z: hz * cs };
  // floor through the feet: the axis is r above the floor line, perpendicular to it in the vertical plane
  const n = { x: hx * sn, y: cs, z: hz * sn };
  return { a: { x: feet.x + n.x * r, y: feet.y + n.y * r, z: feet.z + n.z * r }, d, r };
}

/** Dig predicate of this digger: the kernel's (crusts, hard primitives), clipped to its plan unless possessed. */
function predicateFor(sim: Sim, ant: Ant): (x: number, y: number, z: number) => boolean {
  const base = (x: number, y: number, z: number) => sim.kernel.canDigAt(x, y, z);
  if ((ant.flags & AntFlag.POSSESSED) !== 0) return base;
  const ref = antSlot(sim, ant);
  const g = ref ? planCache(sim, ref.nest, ref.plan)?.geometry : undefined;
  if (!g) return base;
  const clip = PLAN_CLIP_BU * sim.world.bu;
  return (x, y, z) => planG(g, x, y, z) > -clip && base(x, y, z);
}

/**
 * Removed solid volume (mm^3) of the ramp capsule as a function of its length, from one gathering pass over the
 * samples the longest capsule may write (same ramp, canDig and solid-share rules as the kernel brush).
 */
function volumeFitter(sim: Sim, ramp: Ramp, maxLen: number, canDig: (x: number, y: number, z: number) => boolean): (len: number) => number {
  const carve = sim.carve, v = carve.voxel, ramp2 = carve.ramp, h = ramp2 / 2, r = ramp.r, a = ramp.a, d = ramp.d;
  const b = { x: a.x + d.x * maxLen, y: a.y + d.y * maxLen, z: a.z + d.z * maxLen };
  const i0 = Math.floor((Math.min(a.x, b.x) - r - h) / v), i1 = Math.ceil((Math.max(a.x, b.x) + r + h) / v);
  const j0 = Math.floor((Math.min(a.y, b.y) - r - h) / v), j1 = Math.ceil((Math.max(a.y, b.y) + r + h) / v);
  const k0 = Math.floor((Math.min(a.z, b.z) - r - h) / v), k1 = Math.ceil((Math.max(a.z, b.z) + r + h) / v);
  const ts: number[] = [], perp2: number[] = [], olds: number[] = [], solids: number[] = [];
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i * v, y = j * v, z = k * v;
    const old = carve.sampleAt(i, j, k);
    if (old === 255) continue;
    const px = x - a.x, py = y - a.y, pz = z - a.z;
    const t = px * d.x + py * d.y + pz * d.z, q2 = px * px + py * py + pz * pz;
    const tc = Math.min(Math.max(t, 0), maxLen);
    const near = Math.sqrt(Math.max(0, q2 - 2 * t * tc + tc * tc)) - r; // distance to the longest capsule
    if (near > h) continue;
    if (!canDig(x, y, z)) continue;
    let solid = 0.5 - sim.field.substrateXYZ(x, y, z) / v;
    solid = solid < 0 ? 0 : solid > 1 ? 1 : solid;
    if (solid <= 0) continue;
    ts.push(t); perp2.push(q2); olds.push(old); solids.push(solid);
  }
  const vol3 = v * v * v, invRamp = 1 / ramp2;
  return (len: number) => {
    let vol = 0;
    for (let n = 0; n < ts.length; n++) {
      const t = ts[n], tc = t < 0 ? 0 : t > len ? len : t;
      const dist = Math.sqrt(Math.max(0, perp2[n] - 2 * t * tc + tc * tc));
      let q = 0.5 - (dist - r) * invRamp;
      q = q < 0 ? 0 : q > 1 ? 1 : q;
      const nv = Math.round(q * 255);
      if (nv > olds[n]) vol += (OPEN_FRACTION[nv] - OPEN_FRACTION[olds[n]]) * solids[n];
    }
    return vol * vol3;
  };
}

/** Nearest solid face ahead (along the ramp axis, and level from the body), or null within the probe. */
function facePoint(sim: Sim, ant: Ant, ramp: Ramp, out: Vec3): Vec3 | null {
  const bu = sim.world.bu, max = ramp.r + DIG_FACE_PROBE_BU * bu;
  const t1 = sim.field.sphereTrace(ramp.a, ramp.d, max, 0);
  const level = { x: ramp.d.x, y: 0, z: ramp.d.z }, l = Math.hypot(level.x, level.z) || 1;
  level.x /= l; level.z /= l;
  const t2 = sim.field.sphereTrace(ant.pos, level, max, 0);
  if (t1 >= max && t2 >= max) return null;
  const useAxis = t1 <= t2;
  const o = useAxis ? ramp.a : ant.pos, dir = useAxis ? ramp.d : level, t = (useAxis ? t1 : t2) + DIG_BITE_DEPTH_BU * bu;
  out.x = o.x + dir.x * t; out.y = o.y + dir.y * t; out.z = o.z + dir.z * t;
  return out;
}

const face: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * One bite (GDD 03 §1.2): the ramp brush from `feet` along `heading` at `slopeDeg` (degrees below the horizontal).
 * Refused `caste` (cannot dig), `not-diggable` (the face material is too hard: digSpeed x digPower < DIG_MIN_SPEED),
 * `no-target` (less than BITE_MIN_REMOVED removed). On success a soil pellet (frass for wood) with the removed
 * volume lies at the mandibles, or, for a founding queen in `digging`, the volume is expelled onto the mound.
 */
export function digBiteImpl(sim: Sim, ant: Ant, feet: Vec3, heading: Vec3, slopeDeg: number): DigBiteResult {
  const power = digPowerOf(ant);
  if (power <= 0) return FAIL('caste');
  const bu = sim.world.bu, species = speciesOf(sim, ant), hs = headScaleOf(ant);
  const ramp = rampOf(feet, heading, slopeDeg, DIG_RAMP_RADIUS_BU * hs * bu);
  const hit = facePoint(sim, ant, ramp, face);
  if (!hit) return FAIL('no-target');
  const material = sim.field.materialAt(hit);
  if (digSpeedAt(sim, species, hit) * power < DIG_MIN_SPEED) return FAIL('not-diggable');
  const canDig = predicateFor(sim, ant);
  // fit the capsule length to the nominal bite volume
  const maxLen = DIG_RAMP_MAX_LEN_BU * bu, target = V_BITE_NOMINAL * hs ** 3 * bu ** 3;
  const volumeAt = volumeFitter(sim, ramp, maxLen, canDig);
  let len = maxLen;
  if (volumeAt(0) >= target) len = 0;
  else if (volumeAt(maxLen) > target) {
    let lo = 0, hi = maxLen;
    for (let s = 0; s < DIG_RAMP_FIT_STEPS; s++) {
      const mid = (lo + hi) / 2;
      if (volumeAt(mid) < target) lo = mid; else hi = mid;
    }
    len = hi;
  }
  // too little to remove: refuse before carving, so a `no-target` bite leaves the grid unchanged (GDD 03 §1.2,
  // and the §1.3 conservation identity: every carved mm^3 ends up in a pellet)
  if (volumeAt(len) < BITE_MIN_REMOVED * bu ** 3) return FAIL('no-target');
  const b = { x: ramp.a.x + ramp.d.x * len, y: ramp.a.y + ramp.d.y * len, z: ramp.a.z + ramp.d.z * len };
  const flags = nestRuntime(sim).flags;
  const v = sim.carve.voxel, r = ramp.r + v;
  const box = {
    i0: Math.floor((Math.min(ramp.a.x, b.x) - r) / v), j0: Math.floor((Math.min(ramp.a.y, b.y) - r) / v), k0: Math.floor((Math.min(ramp.a.z, b.z) - r) / v),
    i1: Math.ceil((Math.max(ramp.a.x, b.x) + r) / v), j1: Math.ceil((Math.max(ramp.a.y, b.y) + r) / v), k1: Math.ceil((Math.max(ramp.a.z, b.z) + r) / v),
  };
  const flagged = !flags.noneIn(box.i0, box.j0, box.k0, box.i1, box.j1, box.k1);
  const before = flagged ? readBox(sim, box) : null;
  // the nest this soil belongs to, decided before the brush so a hole it opens becomes that nest's entrance
  const nest = digNestFor(sim, ant, hit);
  const res = withDigOwner(sim, nest ? nest.id : -1, () => carveCapsule(sim, ramp.a, b, ramp.r, { canDig }));
  if (before) {
    forChangedSamples(sim, box, before, (i, j, k, _old, now) => {
      if (now >= OPEN_MIN) flags.clear(i, j, k, VoxelFlag.LOOSE | VoxelFlag.PLUG | VoxelFlag.NATURAL);
    });
  }
  // the dry run predicted >= BITE_MIN_REMOVED; whatever the brush really removed goes into the pellet
  const removed = res.volume / bu ** 3;
  if (removed <= 0) return { ok: false, reason: 'no-target', voxels: res.opened, pelletId: -1, material: null };
  const ref = antSlot(sim, ant);
  if (ref) notePlanBite(sim, ref.plan.id);
  sim.emit({ type: 'cue', cue: `dig-bite.${material}`, pos: { x: hit.x, y: hit.y, z: hit.z }, strength: removed });
  if (nest && nest.founding?.state === 'digging' && ant.caste === 'queen' && (ant.flags & AntFlag.FOUNDING) !== 0) {
    expelVolume(sim, nest, removed, material, ant.id, hit);
    return { ok: true, reason: null, voxels: res.opened, pelletId: -1, material };
  }
  const head = 0.5 * ant.lengthBu * bu;
  const at = { x: ant.pos.x + ant.fwd.x * head, y: ant.pos.y + ant.fwd.y * head, z: ant.pos.z + ant.fwd.z * head };
  const pellet = spawnPellet(sim, at, removed, material, nest ? nest.id : -1, ant.colony, ant.id);
  return { ok: true, reason: null, voxels: res.opened, pelletId: pellet.id, material };
}
