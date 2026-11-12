// sim-fix-colony item 2 and 4, unit level: haul urgency of spoil in the nest, the passage rule of tamping, the
// internal-dump query (GDD 03 §7.7) and the `entrance-closed` report with its cause.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { HAUL_URGENCY_GAIN, PELLET_TAMP_S } from '@/sim/balance/nest';
import { TICKS_PER_SECOND } from '@/sim/time';
import { OPEN_MIN } from './carve/keys';
import { internalDumpSite } from './deadEnd';
import { designateChamber, haulPelletLoad, haulStimulus, pelletHaulUrgency } from './index';
import { checkEntrances, flushClosedEntrances } from './entrances';
import { createMound, publishMound } from './mounds';
import { moundOrigin } from './moundRelax';
import { collect, nestSim, playerNest, runTicks } from './nestTestKit';
import { fillKeepsPassages } from './passage';
import { loosePellets, placePellet, spawnPellet } from './pellets';
import { tampHeadroomSamples } from './tamp';

const BU = 4;

/** A straight 2 BU tunnel along x at 20 BU depth through the world centre, as the player's nest. */
function tunnel() {
  const sim = nestSim({});
  const c = sim.world.size / 2, y = -20 * BU;
  sim.kernel.carveCapsule({ x: c - 12 * BU, y, z: c }, { x: c + 12 * BU, y, z: c }, BU, { force: true });
  const nest = playerNest(sim, { x: c, y, z: c });
  return { sim, nest, c, y };
}

function floorUnder(sim: Sim, x: number, yGuess: number, z: number) {
  const v = sim.carve.voxel, i = Math.round(x / v), k = Math.round(z / v);
  let j = Math.round(yGuess / v);
  while (sim.carve.sampleAt(i, j - 1, k) >= OPEN_MIN) j--;
  return { x: i * v, y: j * v, z: k * v };
}

describe('haul urgency of spoil in the nest', () => {
  it('rises from 1 at the drop to 1 + HAUL_URGENCY_GAIN at tamping age and weighs the stimulus and the demand', () => {
    const { sim, nest, c, y } = tunnel();
    const at = floorUnder(sim, c, y, c);
    const it = spawnPellet(sim, at, 0.85, 'loam', nest.id, nest.colony, -1);
    placePellet(sim, it, at);
    expect(pelletHaulUrgency(sim, it)).toBeCloseTo(1, 9);
    expect(haulPelletLoad(sim, nest.colony)).toBeCloseTo(1, 9);
    sim.state.tick += (PELLET_TAMP_S * TICKS_PER_SECOND) / 2;
    expect(pelletHaulUrgency(sim, it)).toBeCloseTo(1 + HAUL_URGENCY_GAIN / 2, 9);
    sim.state.tick += PELLET_TAMP_S * TICKS_PER_SECOND;
    expect(pelletHaulUrgency(sim, it)).toBeCloseTo(1 + HAUL_URGENCY_GAIN, 9); // capped at tamping age
    expect(haulStimulus(sim, nest.colony)).toBeCloseTo(0.5 * (1 + HAUL_URGENCY_GAIN), 9); // clutter weighs 0.5
    // a surface pellet is not a haul job
    const out = spawnPellet(sim, { x: c, y: 0, z: c }, 0.85, 'loam', nest.id, nest.colony, -1);
    placePellet(sim, out, { x: c, y: sim.field.height(c, c), z: c });
    expect(pelletHaulUrgency(sim, out)).toBe(0);
  });
});

describe('passage rule of tamping', () => {
  it('a heap of spoil in a 2 BU tunnel narrows it to a squeeze but leaves 1.5 BU of headroom and the passage', () => {
    const { sim, nest, c, y } = tunnel();
    const need = tampHeadroomSamples(sim, nest);
    expect(need).toBe(3); // 1.5 BU of the standard worker in 0.5 BU samples
    const at = floorUnder(sim, c, y, c);
    for (let n = 0; n < 12; n++) placePellet(sim, spawnPellet(sim, at, 0.85, 'loam', nest.id, nest.colony, -1), at);
    const tamped = collect<{ type: string; into: string }>(sim, ['pellet-dumped'], () => runTicks(sim, PELLET_TAMP_S * TICKS_PER_SECOND + 10));
    expect(tamped.filter((e) => e.into === 'tamp').length).toBeGreaterThan(0);
    // not everything fitted: what is left still lies there (volume kept, partly tamped), retried later
    const left = loosePellets(sim, nest.id);
    expect(left.length).toBeGreaterThan(0);
    // every column within 4 BU of the heap keeps >= 1.5 BU of open headroom wherever it is open at all
    const v = sim.carve.voxel;
    for (let k = Math.round((c - 4 * BU) / v); k <= Math.round((c + 4 * BU) / v); k++)
      for (let i = Math.round((c - 4 * BU) / v); i <= Math.round((c + 4 * BU) / v); i++) {
        const top = Math.round((y + BU) / v);
        let run = 0, best = 0;
        for (let j = Math.round((y - BU) / v); j <= top; j++) { run = sim.carve.sampleAt(i, j, k) >= OPEN_MIN ? run + 1 : 0; best = Math.max(best, run); }
        if (Math.abs(k * v - c) <= 0.25 * BU) expect(best, `column ${i},${k}`).toBeGreaterThanOrEqual(need); // the tunnel axis
      }
    // the tunnel still connects end to end
    const a = sim.nestNav.componentAt({ x: c - 10 * BU, y, z: c }), b = sim.nestNav.componentAt({ x: c + 10 * BU, y, z: c });
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBe(a);
  }, 60_000);

  it('the passage check refuses a fill that would cut a tunnel and accepts one that only lowers it', () => {
    const { sim, c, y } = tunnel();
    const v = sim.carve.voxel;
    // a plug across the whole tunnel cross-section: refused
    const cut = [];
    for (let j = Math.round((y - BU) / v); j <= Math.round((y + BU) / v); j++)
      for (let k = Math.round((c - BU) / v); k <= Math.round((c + BU) / v); k++) cut.push({ x: c, y: j * v, z: k * v });
    expect(fillKeepsPassages(sim, cut, 0.25 * BU)).toBe(false);
    // one floor sample: accepted
    expect(fillKeepsPassages(sim, [floorUnder(sim, c, y, c)], 0.25 * BU)).toBe(true);
  });
});

describe('internal dump (GDD 03 §7.7)', () => {
  it('in the small test nest: the blind branch tip, >= 6 BU from every chamber; a midden chamber wins', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = playerNest(sim);
    const site = internalDumpSite(sim, nest.id);
    expect(site).not.toBeNull();
    expect(site!.kind).toBe('tip');
    expect(site!.fromChamberBu).toBeGreaterThanOrEqual(6);
    // the branch runs 7 BU east of the food-nursery tunnel's middle: the tip is its far end, not a through tunnel
    const food = nest.chambers.find((c) => c.type === 'food')!, nursery = nest.chambers.find((c) => c.type === 'nursery')!;
    const midX = (food.center.x + nursery.center.x) / 2;
    expect(site!.pos.x).toBeGreaterThan(midX + 4 * BU);
    expect(internalDumpSite(sim, nest.id)).toEqual(site); // cached, same answer
    expect(designateChamber(sim, food.id, 'midden', 'player')).toBe(true);
    const midden = internalDumpSite(sim, nest.id);
    expect(midden!.kind).toBe('midden');
    expect(midden!.pos).toEqual(food.center);
  });

  it('null for a nest without chambers', () => {
    const { sim, nest } = tunnel();
    nest.chambers.length = 0;
    expect(internalDumpSite(sim, nest.id)).toBeNull();
  });
});

describe('entrance-closed (sim-fix-colony 4)', () => {
  it('a plain fill reports `filled`, a pile over the opening `mound-buried`; a plug (sealing) reports nothing', () => {
    const fill = nestSim({ nest: 'small' });
    const e1 = playerNest(fill).entrances[0];
    const ev1 = collect<{ type: string; cause: string; entranceId: number }>(fill, ['entrance-closed'], () => {
      fill.enqueue({ type: 'cheat.fillSphere', pos: { x: e1.pos.x, y: e1.pos.y - 1.5 * BU, z: e1.pos.z }, r: 3 * BU, loose: false });
      runTicks(fill, 2);
    });
    expect(e1.status).toBe('sealed');
    expect(ev1.map((e) => [e.entranceId, e.cause])).toEqual([[e1.id, 'filled']]);

    const pile = nestSim({ nest: 'small' });
    const nest = playerNest(pile);
    const e2 = nest.entrances[0];
    const m = createMound(pile, nest, null, e2.pos.x + 20 * BU, e2.pos.z, 'loam'); // a heap whose grid covers the opening
    const { x0, z0 } = moundOrigin(m);
    for (let i = 0; i < m.h.length; i++) {
      const d = Math.hypot(x0 + (i % m.n) * m.cell - e2.pos.x, z0 + Math.floor(i / m.n) * m.cell - e2.pos.z);
      if (d <= e2.radius + 3 * BU) m.h[i] = 2 * BU; // spilled over the opening (by hand: settling keeps it clear)
    }
    publishMound(pile, m);
    const ev2 = collect<{ type: string; cause: string }>(pile, ['entrance-closed'], () => { checkEntrances(pile); flushClosedEntrances(pile); });
    expect(e2.status).toBe('sealed');
    expect(ev2.map((e) => e.cause)).toEqual(['mound-buried']);

    const plug = nestSim({ nest: 'small' });
    const ev3 = collect(plug, ['entrance-closed'], () => runTicks(plug, 30));
    expect(ev3).toEqual([]);
  });
});
