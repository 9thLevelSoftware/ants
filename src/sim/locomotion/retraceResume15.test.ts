// Colony-life round 15 (direction 30 item 3, outdoor/removal.verify): a retrace resumed part-way home joins the crumb
// trail where the ant stands. A scout homing by her crumbs fled 64 BU from home; the retrace she resumed began at the
// newest crumb - one she had recorded on her way home - and walked her way home backwards, out to 107 BU. Now a
// retrace consumes the crumbs behind it (those after its target: the way out beyond her and what she recorded walking
// it back), and starts at the crumb nearest the ant.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim } from '@/sim/types';
import { crumbCount, navRetrace } from './index';
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

describe('retrace resumed part-way home (round 15)', () => {
  it('after a flee half-way home the resumed retrace walks on home, not back out', () => {
    const sim = locoSim({ sizeBu: 400 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const home = v3(c - 60 * bu, 0, c - 60 * bu);
    const pts = lShape(home, bu);
    const ant = sim.state.ants[0];
    teleport(sim, ant, pts[pts.length - 1]);
    setCrumbs(ant, pts);
    const from = (p: Vec3) => Math.hypot(p.x - home.x, p.z - home.z);
    // homing by the crumbs until she is about half-way (she records crumbs as she walks)
    expect(navRetrace(sim, ant, { speed: 6 * bu })).toBe(true);
    for (let t = 0; t < 3000 && from(ant.pos) > 45 * bu; t++) sim.tick();
    expect(from(ant.pos)).toBeLessThan(46 * bu);
    // the crumbs behind her are gone: none lies farther from home than she does (plus a crumb's spacing)
    const c3 = v3(0, 0, 0);
    let farCrumb = 0;
    for (let i = 0; i < crumbCount(ant); i++) {
      const m = ant.mem.crumbs;
      c3.x = m[3 * i]; c3.z = m[3 * i + 2];
      farCrumb = Math.max(farCrumb, from(c3));
    }
    expect(farCrumb).toBeLessThan(from(ant.pos) + 7 * bu);
    // a flee: 5 BU aside, then the retrace resumes
    const at = from(ant.pos);
    teleport(sim, ant, v3(ant.pos.x + 5 * bu, 0, ant.pos.z - 5 * bu));
    expect(navRetrace(sim, ant, { speed: 6 * bu })).toBe(true);
    let farthest = 0;
    runUntilDone(sim, [ant], 3000, () => { farthest = Math.max(farthest, from(ant.pos)); });
    expect(ant.nav.status).toBe('arrived');
    expect(from(ant.pos)).toBeLessThan(3 * bu);
    expect(farthest).toBeLessThan(at + 10 * bu);
  });

  it('a retrace begun beside the middle of the trail starts at the crumb nearest the ant', () => {
    const sim = locoSim({ sizeBu: 400 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const home = v3(c - 60 * bu, 0, c - 60 * bu);
    const ant = sim.state.ants[0];
    // 4 BU off the first leg (outside loop-erasure range, so no crumb of hers cuts the list first)
    teleport(sim, ant, v3(home.x + 31 * bu, 0, home.z + 4 * bu));
    setCrumbs(ant, lShape(home, bu));
    expect(navRetrace(sim, ant, { speed: 6 * bu })).toBe(true);
    let farthest = 0;
    runUntilDone(sim, [ant], 3000, () => { farthest = Math.max(farthest, Math.hypot(ant.pos.x - home.x, ant.pos.z - home.z)); });
    expect(ant.nav.status).toBe('arrived');
    // she started 31 BU out; the far end of the way out is 85 BU away
    expect(farthest / bu).toBeLessThan(36);
  });
});
