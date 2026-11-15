// Acceptance 5 (GDD 02 §12.2; App. E 20): an avoid marker over a working trail cuts the traffic through it by at
// least 80 % and empties its disc within 30 s; a forage marker at an undiscovered source brings its discovery
// forward.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { announce, countEvents, distBu, forageScenario, isOutdoorAnt, run } from './testkit';

const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;
/** Discovery seeds: one in default mode, three with FOUNDRESS_LONG=1. */
const DISCOVERY_SEEDS = LONG ? [1, 2, 3] : [1];

/** Counts entries of outdoor ants into a disc (x, z, radius BU) over n ticks; also the ants inside at the end. */
function traffic(sim: Sim, c: { x: number; z: number }, rBu: number, n: number): { entries: number; insideAfter30s: number } {
  const inside = new Set<number>();
  let entries = 0, insideAfter30s = 0;
  const seenInside = new Set<string>();
  const t0 = sim.state.tick;
  run(sim, n, 10, () => {
    let now = 0;
    for (const a of sim.state.ants) {
      if (!isOutdoorAnt(a) || a.nestId >= 0) continue;
      const d = distBu(sim, a.pos, { x: c.x, y: 0, z: c.z });
      if (d <= rBu) { now++; if (sim.state.tick - t0 >= 300) seenInside.add(`${a.id}:${a.state}:${a.bb['fo.home']}:${a.nav.mode}`); if (!inside.has(a.id)) { entries++; inside.add(a.id); } } else inside.delete(a.id);
    }
    if (sim.state.tick - t0 >= 300) insideAfter30s = Math.max(insideAfter30s, now);
  });
  if (seenInside.size > 0) console.log('inside after 30 s:', [...seenInside].slice(0, 10).join(' '));
  return { entries, insideAfter30s };
}

describe('acceptance 5: markers', () => {
  it('an avoid marker across the trail cuts the traffic through it by >= 80 % and nobody stays inside', () => {
    const { sim, col, entrance, sources } = forageScenario({
      seed: 3, pinned: true, holdStores: { c: 2, p: 0.3 },
      sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 140, bearingDeg: 0, units: 300 }],
    });
    announce(sim, col, sources[0]);
    const bu = sim.world.bu;
    const mid = { x: entrance.pos.x + 70 * bu, z: entrance.pos.z };
    run(sim, 2500); // a game hour to get the trail going
    const before = traffic(sim, mid, 30, 5000);
    sim.enqueue({ type: 'placeMarker', kind: 'avoid', pos: { x: mid.x, y: sim.field.height(mid.x, mid.z), z: mid.z }, radius: 30 * bu });
    const ev = countEvents(sim, ['delivery']);
    const after = traffic(sim, mid, 30, 5000);
    const detoured = ev.kept.filter((e) => e.type === 'delivery' && e.sourceId === sources[0].id).length;
    console.log(`deliveries from the source while the marker stands (the foragers walk round it): ${detoured}`);
    expect(detoured).toBeGreaterThan(0);
    console.log(`avoid marker: entries into the disc ${before.entries} in 2 game hours before, ${after.entries} after;`,
      `ants inside 30 s after placement: ${after.insideAfter30s}`);
    expect(before.entries).toBeGreaterThanOrEqual(5);
    expect(after.entries).toBeLessThanOrEqual(0.2 * before.entries);
    expect(after.insideAfter30s).toBe(0);
  }, 600000);

  it('a forage marker at an undiscovered source brings its discovery forward', () => {
    const LIMIT = 4 * 6000;
    const discoveredAt = (seed: number, marker: boolean): number => {
      const { sim, sources } = forageScenario({
        seed, pinned: true, holdStores: { c: 2, p: 0.3 },
        sources: [{ kind: 'sugar', variant: 'sugar-granules', distBu: 160, bearingDeg: 60, units: 300 }],
      });
      const s = sources[0];
      if (marker) sim.enqueue({ type: 'placeMarker', kind: 'forage', pos: { ...s.pos }, radius: 20 * sim.world.bu });
      const ev = countEvents(sim, ['food-source-discovered']);
      const found = () => ev.kept.some((e) => e.type === 'food-source-discovered' && e.sourceId === s.id);
      while (sim.state.tick < LIMIT && !found()) run(sim, 100);
      return found() ? sim.state.tick : LIMIT;
    };
    const rows = DISCOVERY_SEEDS.map((seed) => ({ seed, with: discoveredAt(seed, true), without: discoveredAt(seed, false) }));
    for (const r of rows) console.log(`forage marker, seed ${r.seed}: discovered at tick ${r.with} with the marker, ${r.without} without (cap ${LIMIT})`);
    const meanWith = rows.reduce((m, r) => m + r.with, 0) / rows.length;
    const meanWithout = rows.reduce((m, r) => m + r.without, 0) / rows.length;
    expect(meanWith).toBeLessThan(0.5 * meanWithout);
    for (const r of rows) expect(r.with).toBeLessThan(LIMIT);
  }, 900000);
});
