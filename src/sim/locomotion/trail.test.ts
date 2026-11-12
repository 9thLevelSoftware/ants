// Criterion 4: trail following (bend + 3-cell gap, synthetic field) and breadcrumb retrace with shortcuts
// (GDD 02 §9.2, App. E 17).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, PheromoneField, Primitive, Sim } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { crumbAt, crumbCount, navFollowTrail, navRetrace, navTo, navWander } from './index';
import { locoSim, runUntilDone, v3 } from './testkit';

/**
 * Fake pheromone field: 4 BU cells along a polyline carry `value`, except an arc-length gap; reads blend the four
 * nearest cell centres bilinearly (as the real field's trilinear read does on the ground).
 */
function fakeTrail(pts: Vec3[], cell: number, gap: [number, number], value: number): PheromoneField {
  const cells = new Map<string, number>();
  let s0 = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0; t <= L; t += cell / 4) {
      const s = s0 + t;
      if (s >= gap[0] && s <= gap[1]) continue;
      cells.set(`${Math.floor((a.x + ((b.x - a.x) * t) / L) / cell)},${Math.floor((a.z + ((b.z - a.z) * t) / L) / cell)}`, value);
    }
    s0 += L;
  }
  const at = (ix: number, iz: number) => cells.get(`${ix},${iz}`) ?? 0;
  const read = (p: Vec3) => {
    const fx = p.x / cell - 0.5, fz = p.z / cell - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    return at(ix, iz) * (1 - tx) * (1 - tz) + at(ix + 1, iz) * tx * (1 - tz) + at(ix, iz + 1) * (1 - tx) * tz + at(ix + 1, iz + 1) * tx * tz;
  };
  return {
    deposit() {}, sample: (_c, _ch, p) => read(p), decay() {}, scaleRegion() {}, clearColony() {},
    sense: (_c, _ch, p, _f, _u, out) => { out.x = 0; out.y = 0; out.z = 0; return read(p); },
  };
}

function distToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
}

function teleport(sim: Sim, ant: Ant, p: Vec3): void {
  sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: p });
  sim.tick();
}

describe('trail following', () => {
  for (const bend of [30, 45, 60, 90]) {
    it(`criterion 4a: follows a trail with a ${bend} deg bend and a 3-cell gap to its end`, () => {
      const sim = locoSim({ sizeBu: 256 });
      const bu = sim.world.bu, c = sim.world.size / 2;
      const A = v3(c - 60 * bu, 0, c + 2 * bu), B = v3(c, 0, c + 2 * bu);
      const ang = (bend * Math.PI) / 180;
      const C = v3(B.x + Math.cos(ang) * 60 * bu, 0, B.z + Math.sin(ang) * 60 * bu);
      // gap of 3 cells (12 BU) on the second branch, 20 BU after the bend
      (sim as { phero: PheromoneField }).phero = fakeTrail([A, B, C], 4 * bu, [80 * bu, 92 * bu], 10);
      const ant = sim.state.ants[0];
      teleport(sim, ant, v3(A.x + 2 * bu, 0, A.z));
      ant.fwd = { x: 1, y: 0, z: 0 };
      expect(navFollowTrail(sim, ant, ant.colony, 'trail', 'any', { speed: 6 * bu })).toBe(true);
      let maxDev = 0, minToEnd = Infinity, crossedGap = false;
      runUntilDone(sim, [ant], 600, () => {
        const d = Math.min(distToSegment(ant.pos, A, B), distToSegment(ant.pos, B, C));
        const toEnd = Math.hypot(ant.pos.x - C.x, ant.pos.z - C.z);
        if (minToEnd > 4 * bu) maxDev = Math.max(maxDev, d); // until the end is reached
        minToEnd = Math.min(minToEnd, toEnd);
        if (distToSegment(ant.pos, B, C) < 4 * bu && Math.hypot(ant.pos.x - B.x, ant.pos.z - B.z) > 34 * bu) crossedGap = true;
      });
      // eslint-disable-next-line no-console
      console.log(`LOCO_TRAIL bend ${bend}: max deviation ${(maxDev / bu).toFixed(2)} BU, closest to end ${(minToEnd / bu).toFixed(2)} BU`);
      expect(crossedGap).toBe(true);
      // the followable ridge runs through 4 BU cell centres, up to half a cell off the polyline
      expect(minToEnd).toBeLessThan(5 * bu);
      expect(maxDev).toBeLessThan(6 * bu);
      // past the end the trail is lost: the request fails after TRAIL_LOST_S, never loops forever
      expect(ant.nav.status).toBe('failed');
    });
  }
});

/** Writes crumbs (oldest first) into the ant's memory. */
function setCrumbs(ant: Ant, pts: Vec3[]): void {
  const m = ant.mem;
  pts.forEach((p, i) => { m.crumbs[3 * i] = p.x; m.crumbs[3 * i + 1] = p.y; m.crumbs[3 * i + 2] = p.z; });
  m.crumbLen = pts.length;
  m.crumbHead = pts.length;
}

describe('breadcrumb retrace', () => {
  it('criterion 4b: retraces 40 crumbs home and shortcuts where the direct segment is free', () => {
    const sim = locoSim({ sizeBu: 400 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ant = sim.state.ants[0];
    // a zig-zag outbound route: 40 crumbs 6 BU apart, alternating 45 deg each side of +x
    const pts: Vec3[] = [v3(c - 100 * bu, 0, c)];
    for (let i = 1; i < 40; i++) {
      const prev = pts[i - 1], s = (i >> 2) % 2 === 0 ? 1 : -1;
      pts.push(v3(prev.x + 6 * bu * Math.SQRT1_2, 0, prev.z + s * 6 * bu * Math.SQRT1_2));
    }
    setCrumbs(ant, pts);
    expect(crumbCount(ant)).toBe(40);
    teleport(sim, ant, pts[39]);
    setCrumbs(ant, pts);
    let crumbLen = 0;
    for (let i = 1; i < 40; i++) crumbLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    expect(navRetrace(sim, ant, { speed: 6 * bu })).toBe(true);
    let walked = 0, prev = { ...ant.pos };
    const targets = new Set<number>();
    runUntilDone(sim, [ant], 3000, () => {
      walked += Math.hypot(ant.pos.x - prev.x, ant.pos.z - prev.z);
      prev = { ...ant.pos };
      targets.add(ant.nav.loco?.crumbIdx ?? -1);
    });
    expect(ant.nav.status).toBe('arrived');
    expect(Math.hypot(ant.pos.x - pts[0].x, ant.pos.z - pts[0].z)).toBeLessThan(3 * bu);
    const straight = Math.hypot(pts[39].x - pts[0].x, pts[39].z - pts[0].z);
    // shortcuts: far fewer crumbs visited than recorded, and the walk is close to the straight line (GDD 02 E17)
    expect(targets.size).toBeLessThan(15);
    expect(walked).toBeLessThan(crumbLen * 0.85);
    expect(walked).toBeLessThan(1.4 * straight);
  });

  it('does not shortcut through an obstacle', () => {
    const bu = 4;
    const wall: Primitive = {
      id: 1, shape: 'box', pos: { x: 200 * bu, y: 3 * bu, z: 210 * bu }, rot: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: 1.5 * bu, y: 4 * bu, z: 10 * bu }, round: 0.25 * bu, material: 'stone', flags: PrimFlag.CLIMBABLE, objectId: -1,
    };
    const sim = locoSim({ sizeBu: 400, prims: [wall] });
    const ant = sim.state.ants[0];
    // a detour around the end of the wall: the shortcut from the last crumb to the first would cross it
    const pts = [v3(190, 0, 210), v3(190, 0, 222), v3(196, 0, 224), v3(204, 0, 224), v3(210, 0, 222), v3(210, 0, 210)]
      .map((p) => v3(p.x * bu, 0, p.z * bu));
    teleport(sim, ant, pts[5]);
    setCrumbs(ant, pts);
    expect(navRetrace(sim, ant, { speed: 6 * bu })).toBe(true);
    let maxZ = -Infinity, maxY = -Infinity;
    runUntilDone(sim, [ant], 2000, () => { maxZ = Math.max(maxZ, ant.pos.z); maxY = Math.max(maxY, ant.pos.y); });
    expect(ant.nav.status).toBe('arrived');
    expect(maxZ).toBeGreaterThan(219 * bu); // went round the wall end, not through it
    expect(maxY).toBeLessThan(2 * bu); // and not over it
  });

  it('records crumbs while walking on the surface, erasing loops (GDD 02 §9.2)', () => {
    const sim = locoSim({ nest: 'small', workers: 1, sizeBu: 300 });
    const bu = sim.world.bu;
    const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
    const e = sim.stores.nests.get(ant.nestId)!.entrances[0];
    const centre = v3(e.pos.x - 40 * bu, 0, e.pos.z);
    navTo(sim, ant, centre, 3 * bu, { speed: 6 * bu });
    runUntilDone(sim, [ant], 1500);
    expect(ant.nav.status).toBe('arrived');
    navWander(sim, ant, centre, 30 * bu, { speed: 6 * bu });
    for (let t = 0; t < 1500; t++) sim.tick();
    expect(ant.nestId).toBe(-1);
    const n = crumbCount(ant);
    expect(n).toBeGreaterThan(3);
    const first = crumbAt(ant, 0, v3(0, 0, 0));
    expect(Math.hypot(first.x - e.pos.x, first.z - e.pos.z)).toBeLessThan(1); // crumb 0 = the entrance
    const a = v3(0, 0, 0), b = v3(0, 0, 0);
    for (let i = 1; i < n; i++) {
      crumbAt(ant, i - 1, a); crumbAt(ant, i, b);
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(7 * bu); // spacing + one step
    }
    // no crumb is within LOOP_CLOSE of an older non-adjacent one (loops erased)
    for (let i = 2; i < n; i++) for (let k = 0; k < i - 1; k++) {
      crumbAt(ant, i, a); crumbAt(ant, k, b);
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(2.9 * bu);
    }
    // the home vector points roughly at the entrance (2 % path-integration error per distance)
    const h = ant.mem.homeVec;
    const err = Math.hypot(ant.pos.x + h.x - e.pos.x, ant.pos.z + h.z - e.pos.z);
    expect(err).toBeLessThanOrEqual(ant.mem.homeVecErr + 1e-6);
  });
});
