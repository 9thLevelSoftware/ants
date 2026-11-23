// Colony-life round 15 (direction 30 item 3, outdoor/removal.verify): a retrace resumed part-way home joins the crumb
// trail where the ant stands. A scout homing by her crumbs fled 64 BU from home; the retrace she resumed began at the
// newest crumb, and the crumbs recorded on her way home led back outward (64 -> 107 BU). Now (1) an ant on its way
// home (AntFlag.HOMING) records no crumbs, so the trail stays the way out, and (2) a retrace starts at the crumb
// nearest the ant, not at the newest (the far end of the way out).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
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

describe('retrace resumed part-way home (round 15)', () => {
  it('an ant 30 BU along an L-shaped way out walks home, not out to the far end', () => {
    const sim = locoSim({ sizeBu: 400 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const home = v3(c - 60 * bu, 0, c - 60 * bu);
    // the way out: 60 BU along +x, then 60 BU along +z (crumbs 6 BU apart)
    const pts: Vec3[] = [];
    for (let i = 0; i <= 10; i++) pts.push(v3(home.x + 6 * i * bu, 0, home.z));
    for (let i = 1; i <= 10; i++) pts.push(v3(home.x + 60 * bu, 0, home.z + 6 * i * bu));
    const ant = sim.state.ants[0];
    teleport(sim, ant, v3(home.x + 31 * bu, 0, home.z + 2 * bu));
    setCrumbs(ant, pts);
    ant.flags |= AntFlag.HOMING; // on her way home: the crumbs stay the way out
    expect(navRetrace(sim, ant, { speed: 6 * bu })).toBe(true);
    let farthest = 0;
    runUntilDone(sim, [ant], 3000, () => { farthest = Math.max(farthest, Math.hypot(ant.pos.x - home.x, ant.pos.z - home.z)); });
    expect(ant.nav.status).toBe('arrived');
    expect(Math.hypot(ant.pos.x - home.x, ant.pos.z - home.z)).toBeLessThan(3 * bu);
    // she started 31 BU out; the far end of the way out is 85 BU away
    expect(farthest / bu).toBeLessThan(36);
  });

  it('an ant on its way home records no crumbs; one heading out does', () => {
    const sim = locoSim({ sizeBu: 400 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ant = sim.state.ants[0];
    teleport(sim, ant, v3(c, 0, c));
    setCrumbs(ant, [v3(c - 40 * bu, 0, c), v3(c - 20 * bu, 0, c), v3(c, 0, c)]);
    ant.flags |= AntFlag.HOMING;
    expect(navTo(sim, ant, v3(c + 40 * bu, 0, c), undefined, { speed: 6 * bu })).toBe(true);
    runUntilDone(sim, [ant], 2000);
    expect(crumbCount(ant)).toBe(3);
    ant.flags &= ~AntFlag.HOMING;
    expect(navTo(sim, ant, v3(c + 80 * bu, 0, c), undefined, { speed: 6 * bu })).toBe(true);
    runUntilDone(sim, [ant], 2000);
    expect(crumbCount(ant)).toBeGreaterThan(5);
  });
});
