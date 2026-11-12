// sim-fix-ants item 6 (GDD 02 §12.2): autonomous ants never plan through an avoid marker, and a trail inside one
// is followed at weight x 0.1. Before the fix the 16 BU planner cells counted as "in the disc" only when their
// centre was, so paths grazed the rim; and trail sensors inside a disc read at full strength.
import { describe, expect, it } from 'vitest';
import type { Marker, Sim } from '@/sim/types';
import { navFollowTrail, navTo } from './index';
import { locoSim, runUntilDone, v3 } from './testkit';

function avoidMarker(sim: Sim, id: number, x: number, z: number, r: number, colony: number): Marker {
  const m: Marker = {
    id, alive: true, kind: 'avoid', pos: v3(x, 0, z), radius: r, colony, targetChamberId: -1, sourceChamberId: -1,
    expiresTick: -1, params: { mode: null, priority: null, chamberType: null, planId: -1 }, placedTick: 0,
  };
  sim.state.markers.push(m);
  sim.stores.markers.rebuild();
  return m;
}

describe('avoid markers in planning and trail following (GDD 02 §12.2)', () => {
  it('a planned trip past a disc never enters it, wherever the disc sits on the 16 BU cells', () => {
    const sim = locoSim({ sizeBu: 500 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ant = sim.state.ants[0];
    const worst: number[] = [];
    // disc centres shifted across a cell, routes passing at several offsets
    for (let k = 0; k < 8; k++) {
      sim.state.markers.length = 0;
      // small discs (GDD 02 §12.2: radius from 10 BU) at a cell corner fall between the cell centres
      const corner = k >= 4;
      const mx = corner ? 256 * bu + (k - 4) * 16 * bu : c + (k * 3.3 - 8) * bu, mz = corner ? 256 * bu : c + (k * 2.7 - 6) * bu;
      const r = (corner ? 10 + (k - 4) : 20 + 3 * k) * bu;
      avoidMarker(sim, 9100 + k, mx, mz, r, ant.colony);
      const side = k % 2 === 0 ? 1 : -1;
      sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: v3(mx - 90 * bu, 0, mz + side * 0.3 * r) });
      sim.tick();
      expect(navTo(sim, ant, v3(mx + 90 * bu, 0, mz - side * 0.3 * r), 2 * bu, { speed: 6 * bu })).toBe(true);
      let minD = Infinity;
      runUntilDone(sim, [ant], 4000, () => { minD = Math.min(minD, Math.hypot(ant.pos.x - mx, ant.pos.z - mz) - r); });
      expect(ant.nav.status).toBe('arrived');
      worst.push(minD / bu);
    }
    expect(Math.min(...worst), JSON.stringify(worst.map((x) => +x.toFixed(2)))).toBeGreaterThanOrEqual(0);
  });

  it('a trail running into a disc is followed there at x 0.1 (GDD 02 §12.2): the follower leaves it at the rim', () => {
    const sim = locoSim({ sizeBu: 400 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ant = sim.state.ants[0];
    // a straight strong trail along +x through the disc; just strong enough (below) to follow at full weight
    for (let x = c - 60 * bu; x <= c + 60 * bu; x += 2 * bu) sim.phero.deposit(ant.colony, 'trail', v3(x, sim.field.height(x, c), c), 2);
    const r = 20 * bu;
    avoidMarker(sim, 9200, c + 30 * bu, c, r, ant.colony);
    sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: v3(c - 50 * bu, 0, c) });
    sim.tick();
    ant.fwd = { x: 1, y: 0, z: 0 };
    expect(navFollowTrail(sim, ant, ant.colony, 'trail', 'any', { speed: 6 * bu })).toBe(true);
    let deepest = -Infinity, maxX = -Infinity;
    for (let t = 0; t < 400 && ant.nav.status === 'moving'; t++) {
      sim.tick();
      deepest = Math.max(deepest, r - Math.hypot(ant.pos.x - (c + 30 * bu), ant.pos.z - c));
      maxX = Math.max(maxX, ant.pos.x);
    }
    // 2 ph x 0.1 is below TRAIL_DETECT inside the disc: the follower turns out at the rim (its sensors reach 3 BU
    // ahead, its turning circle at cruise is 1.4 BU) and may pick the trail up again beyond the disc
    expect(deepest / bu).toBeLessThan(6);
    expect(maxX).toBeGreaterThan(c);
  });
});
