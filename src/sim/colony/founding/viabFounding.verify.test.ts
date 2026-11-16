// Adversarial checks of task viab-founding (independent review). Each test states the spec line it probes.
// Cheap set-ups only: the throat case of sealKit.ts (flat loam test world) and the cheat founding of alarms.test.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { makeTestSim } from '@/sim/testing';
import { isWorkerCaste } from '../census';
import { REOPEN_DEEP_REACH_BU } from '@/sim/balance/founding';
import { cavityEntrances } from './dig';
import { plugInnerFace, plugRemnants } from './reopen';
import { act, walkTo } from './verifyKit';
import { SG } from './sealGuide';
import { cellReachesAir } from './sealPlan';
import { throatCase } from './sealKit';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';

/** Counts every refusal the queen's E presses get (action-failed / command-rejected). */
function refusals(sim: Sim, antId: number): string[] {
  const out: string[] = [];
  sim.events.on('action-failed', (e) => { if (e.antId === antId) out.push(`${e.action}:${e.reason}`); });
  sim.events.on('command-rejected', (e) => out.push(`${e.commandType}:${e.reason}`));
  return out;
}

describe('item 2: E pressed anywhere in phase seal', () => {
  it('pressed on the surface 10 BU from the opening: no refusal, no new hole dug from the surface, and the seal completes', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu, q = queen(sim), nest = nestOf(sim);
    pinTemperature(sim, 22);
    expect(phase(sim)).toBe('seal');
    // she walked out of her cell onto the surface (the shaft runs toward +x: stand on the other side)
    const p = { x: c.mouth.x - 10 * bu, y: sim.field.height(c.mouth.x - 10 * bu, c.mouth.z) + 0.5 * bu, z: c.mouth.z };
    sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: p });
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    const entrancesBefore = nest.entrances.length;
    const refused = refusals(sim, q.id);
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => phase(sim) !== 'seal', 3000);
    const dug = Math.hypot(q.pos.x - p.x, q.pos.z - p.z) / bu;
    expect(refused).toEqual([]);
    expect({ phase: phase(sim), entrances: nest.entrances.length, movedBu: Math.round(dug), bites: q.bb['fd.bites'] ?? 0 })
      .toMatchObject({ phase: 'lay', entrances: entrancesBefore });
  }, 90_000);
});

describe('item 2: the guide never takes the queen from the player', () => {
  it('after the first plug, a player on the surface who holds a direction walks away (the guide does not fight the input)', () => {
    const c = throatCase({ pitchDeg: 70, widthBu: 3.0, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu, q = queen(sim);
    pinTemperature(sim, 22);
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => ((q.bb[SG.total] ?? 0) >= 1 && q.action === null) || phase(sim) !== 'seal', 3000);
    expect(phase(sim)).toBe('seal');
    // she is out on the surface (walked out, or shut out above a plug) and the player holds "walk -x", away from the nest
    const p = { x: c.mouth.x - 10 * bu, y: sim.field.height(c.mouth.x - 10 * bu, c.mouth.z) + 0.5 * bu, z: c.mouth.z };
    sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: p });
    sim.tick();
    const x0 = q.pos.x;
    for (let t = 0; t < 300; t++) {
      const d = sim.state.player.intent.dir;
      d.x = -1; d.y = 0; d.z = 0;
      sim.tick();
    }
    expect((x0 - q.pos.x) / bu).toBeGreaterThan(3);
  }, 90_000);
});

describe('item 1: a founding cavity that broke into a world cavity far from the opening', () => {
  it('a crack from the cell to the surface 20 BU away (beyond FOUND_ABANDON_BU): the seal still completes, the cell cut off', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu, nest = nestOf(sim);
    pinTemperature(sim, 22);
    const cell = nest.chambers.find((ch) => ch.type === 'founding')!;
    const top = { x: cell.center.x + 20 * bu, y: sim.field.height(cell.center.x + 20 * bu, cell.center.z), z: cell.center.z };
    const n = 80;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      sim.enqueue({ type: 'cheat.carveSphere', pos: { x: cell.center.x + (top.x - cell.center.x) * t, y: cell.center.y + (top.y + bu - cell.center.y) * t, z: cell.center.z }, r: 0.7 * bu });
    }
    sim.tick();
    expect(cellReachesAir(sim, nest)).toBe(true);
    const q = queen(sim);
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => phase(sim) !== 'seal', 6000);
    const ents = nest.entrances.map((e) => `${e.kind}:${e.status}`);
    const cavity = cavityEntrances(sim, nest).map((e) => `${e.kind}:${e.status}`);
    expect({ phase: phase(sim), air: cellReachesAir(sim, nest), ents, cavity, state: q.bb[SG.state] ?? 0 })
      .toMatchObject({ phase: 'lay', air: false });
  }, 90_000);
});

describe('determinism of the guided seal', () => {
  it('two runs of the same throat give the same ticks to seal and the same plugs', () => {
    const run = () => {
      const c = throatCase({ pitchDeg: 70, widthBu: 3.0, soil: 'loam' });
      const sim = c.sim, q = queen(sim);
      pinTemperature(sim, 22);
      sim.enqueue({ type: 'possess', antId: q.id });
      sim.tick();
      sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
      const ticks = stepUntil(sim, () => phase(sim) !== 'seal', 3000);
      return { ticks, plugs: q.bb[SG.total] ?? 0, strat: q.bb[SG.strategy] ?? 0, pos: [q.pos.x, q.pos.y, q.pos.z], carve: sim.carve.version };
    };
    const a = run(), b = run();
    expect(b).toEqual(a);
    expect(a.ticks).toBeLessThan(3000);
  }, 90_000);
});

describe('the back-fill strategy (`below`) and the hand-over reopening', () => {
  it('a seal laid by the `below` strategy (the second strategy, after `narrow` stalls) is reopened after the hand-over', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, q = queen(sim), nest = nestOf(sim);
    pinTemperature(sim, 28); // a short lapse
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    q.bb[SG.strategy] = 1; // SEAL_STRATEGIES[1] = 'below', as after one watchdog change
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => phase(sim) !== 'seal', 3000);
    expect(phase(sim)).toBe('lay');
    const e = cavityEntrances(sim, nest)[0];
    // where the plug went, and whether the hand-over's reopening can find it
    const deep = plugRemnants(sim, e, 'soil', REOPEN_DEEP_REACH_BU).length;
    sim.enqueue({ type: 'release', reason: 'player' });
    sim.tick();
    walkTo(sim, c.floor, 0.8);
    for (let i = 0; i < 3; i++) act(sim, 'lay-egg');
    sim.tick();
    sim.enqueue({ type: 'openingBeginTimelapse' });
    stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 40_000);
    expect(phase(sim)).toBe('handover');
    const opened = stepUntil(sim, () => cavityEntrances(sim, nest).some((x) => x.status === 'open'), 2 * TICKS_PER_DAY);
    expect({ deep, face: plugInnerFace(sim, nest, e) !== null, opened, statuses: cavityEntrances(sim, nest).map((x) => x.status) })
      .toMatchObject({ statuses: ['open'] });
  }, 180_000);
});

describe('GDD 06 §5.13 (b): the entrance is reopened by the first workers', () => {
  it('with every worker gone at the hand-over, nothing opens the plug (no stand-in unplugging)', () => {
    const sim = makeTestSim({ sizeBu: 128, seed: 2 });
    pinTemperature(sim, 28); // a short lapse
    sim.enqueue({ type: 'cheat.completeFounding', workers: 8 });
    stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 6 * 6000);
    expect(phase(sim)).toBe('handover');
    const nest = nestOf(sim);
    expect(cavityEntrances(sim, nest).every((e) => e.status !== 'open')).toBe(true);
    // the first workers die at once (nobody can dig the plug)
    for (const a of sim.state.ants) if (a.alive && a.colony === nest.colony && isWorkerCaste(a.caste)) sim.enqueue({ type: 'cheat.kill', id: a.id, cause: 'test' });
    sim.tick();
    expect(sim.state.ants.filter((a) => a.alive && a.colony === nest.colony && isWorkerCaste(a.caste))).toEqual([]);
    const opened = stepUntil(sim, () => cavityEntrances(sim, nest).some((e) => e.status === 'open'), TICKS_PER_DAY / 2);
    expect({ opened, statuses: cavityEntrances(sim, nest).map((e) => e.status) }).toMatchObject({ opened: TICKS_PER_DAY / 2 });
  }, 120_000);
});
