// gate-sim-2 review: crumb retrace "variant f" (crumbs behind the target are kept, nearest-crumb start). The rule's
// own test (retraceResume15) moves the ant by teleport, so the flee records no crumbs. A real flee is a walk on the
// surface and records crumbs (locomotion/system.ts recordCrumb); the retrace resumed after it starts at the newest of
// them. These cases walk the flee and check the resumed retrace still goes home without walking back out.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim } from '@/sim/types';
import { crumbCount, navRetrace, navTo } from './index';
import { locoSim, runUntilDone, v3 } from './testkit';

function setCrumbs(ant: Ant, pts: Vec3[]): void {
  const m = ant.mem;
  pts.forEach((p, i) => { m.crumbs[3 * i] = p.x; m.crumbs[3 * i + 1] = p.y; m.crumbs[3 * i + 2] = p.z; });
  m.crumbLen = pts.length;
  m.crumbHead = pts.length;
}

function teleport(sim: Sim, ant: Ant, p: Vec3): void {
  sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: p });
  sim.tick();
}

/** The way out: 60 BU along +x, then 60 BU along +z (crumbs 6 BU apart), from `home`. */
function lShape(home: Vec3, bu: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= 10; i++) pts.push(v3(home.x + 6 * i * bu, 0, home.z));
  for (let i = 1; i <= 10; i++) pts.push(v3(home.x + 60 * bu, 0, home.z + 6 * i * bu));
  return pts;
}

/**
 * Homing by the crumbs from the far end of the L until `stopBu` from home, then a flee walked on the surface
 * `fleeBu` away from home along (dx, dz), then the retrace resumed. Returns her distance from home when the flee
 * ended, the farthest she got from home on the resumed retrace, and how it ended.
 */
function fleeAndResume(stopBu: number, fleeBu: number, dx: number, dz: number) {
  const sim = locoSim({ sizeBu: 400 });
  const bu = sim.world.bu, c = sim.world.size / 2;
  const home = v3(c - 60 * bu, 0, c - 60 * bu);
  const pts = lShape(home, bu);
  const ant = sim.state.ants[0];
  teleport(sim, ant, pts[pts.length - 1]);
  setCrumbs(ant, pts);
  const from = (p: Vec3) => Math.hypot(p.x - home.x, p.z - home.z);
  expect(navRetrace(sim, ant, { speed: 6 * bu })).toBe(true);
  for (let t = 0; t < 3000 && from(ant.pos) > stopBu * bu; t++) sim.tick();
  const crumbsBeforeFlee = crumbCount(ant);
  // the flee: a walk (crumbs recorded on the way), not a teleport
  const l = Math.hypot(dx, dz);
  const dest = v3(ant.pos.x + (fleeBu * bu * dx) / l, 0, ant.pos.z + (fleeBu * bu * dz) / l);
  expect(navTo(sim, ant, dest, 1.5 * bu, { speed: 12 * bu })).toBe(true);
  runUntilDone(sim, [ant], 2000);
  const crumbsAfterFlee = crumbCount(ant);
  const at = from(ant.pos);
  expect(navRetrace(sim, ant, { speed: 6 * bu })).toBe(true);
  let farthest = 0;
  runUntilDone(sim, [ant], 4000, () => { farthest = Math.max(farthest, from(ant.pos)); });
  return { at: at / bu, farthest: farthest / bu, status: ant.nav.status, end: from(ant.pos) / bu, crumbsBeforeFlee, crumbsAfterFlee };
}

describe('reviewer: variant f retrace resumed after a walked flee (gate-sim-2 item 2)', () => {
  it('flee walked 15 BU straight away from home, half-way home: the resumed retrace goes home, not back out', () => {
    const r = fleeAndResume(45, 15, 1, 1);
    // eslint-disable-next-line no-console
    console.log('flee away', JSON.stringify(r));
    expect(r.status).toBe('arrived');
    expect(r.end).toBeLessThan(3);
    expect(r.farthest).toBeLessThan(r.at + 10);
  });

  it('flee walked 15 BU sideways, half-way home: the resumed retrace goes home, not back out', () => {
    const r = fleeAndResume(45, 15, 1, -1);
    // eslint-disable-next-line no-console
    console.log('flee side', JSON.stringify(r));
    expect(r.status).toBe('arrived');
    expect(r.end).toBeLessThan(3);
    expect(r.farthest).toBeLessThan(r.at + 10);
  });
});
