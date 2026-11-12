// The opening's state machine on the running simulation (GDD 06 §5.1-§5.10, §5.14; GDD 03 §13.2): the player's
// own path through the real action primitives where it is short (sniff, the first bite, a batch), the debug world
// edits where digging by hand would take minutes (carving the cell, closing the throat), and the failure path.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { begin } from '@/sim/ants';
import { OPEN_LAY_BATCH_EGGS } from '@/sim/balance/actions';
import { foundingView } from './view';
import { nestOf, phase, pinTemperature, queen, searchingSim, stepUntil } from './testkit';
import { makeTestSim } from '@/sim/testing';

function rejections(sim: Sim): string[] {
  const out: string[] = [];
  sim.events.on('command-rejected', (e) => out.push(`${e.commandType}:${e.reason}`));
  return out;
}

/** Carves the Lasius founding template right below the queen and puts her into the cell (debug edits). */
function carveCellUnderQueen(sim: Sim): void {
  const q = queen(sim), bu = sim.world.bu;
  const x = q.pos.x, z = q.pos.z, g = sim.field.height(x, z);
  for (let d = -0.5; d <= 10; d += 0.5) sim.enqueue({ type: 'cheat.carveSphere', pos: { x, y: g - d * bu, z }, r: 1.25 * bu });
  sim.enqueue({ type: 'cheat.carveEllipsoid', center: { x: x + 2 * bu, y: g - 10.5 * bu, z }, radii: { x: 2 * bu, y: 1 * bu, z: 2.25 * bu }, yawDeg: 0 });
  sim.tick();
  sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: { x: x + 2 * bu, y: g - 11.4 * bu, z } });
  sim.tick();
}

describe('opening state machine (GDD 06 §5.1)', () => {
  it('intro card waits; skip -> dealation (wings shed after 8 s) -> search, with the first aim', () => {
    const sim = makeTestSim({ sizeBu: 128 });
    const rej = rejections(sim);
    for (let i = 0; i < 50; i++) sim.tick();
    expect(phase(sim)).toBe('intro-card');
    sim.enqueue({ type: 'openingBeginTimelapse' });
    sim.enqueue({ type: 'openingSkipIntro' });
    sim.tick();
    expect(phase(sim)).toBe('dealation');
    expect(rej).toContain('openingBeginTimelapse:invalid-phase');
    expect(queen(sim).queen!.founding!.wings).toBe(true);
    const t = stepUntil(sim, () => phase(sim) === 'search', 200);
    expect(t).toBeGreaterThanOrEqual(79);
    expect(t).toBeLessThanOrEqual(81);
    expect(queen(sim).queen!.founding!.wings).toBe(false);
    expect(sim.state.progression.aims.map((a) => a.id)).toContain('aim-find-site');
  });

  it('sniffing for 1.2 s (or standing still 1.5 s) shows the site read-out; it holds the 7 factors, Q and its word', () => {
    const sim = searchingSim();
    const q = queen(sim);
    const seen: number[] = [];
    sim.events.on('opening.site-assessed', (e) => seen.push(e.q));
    expect(begin(sim, q, 'sniff', null)).toBe(true);
    stepUntil(sim, () => seen.length > 0, 30);
    expect(seen.length).toBe(1);
    const op = sim.state.player.opening!;
    expect(op.siteFactors).toHaveLength(7);
    expect(op.siteQ).toBeGreaterThan(0);
    expect(op.siteWord).not.toBeNull();
    const v = foundingView(sim)!;
    expect(v.site?.active).toBe(true);
    expect(v.site?.factors.map((f) => f.id)).toEqual(['diggability', 'moisture', 'warmth', 'cover', 'floodSafety', 'rivalScent', 'exposure']);
    // it refreshes every 0.5 s while she stays within 8 BU
    stepUntil(sim, () => seen.length >= 3, 30);
    expect(seen.length).toBeGreaterThanOrEqual(3);
  });

  it('the first bite on diggable ground starts the dig: nest `digging`, soil expelled (no pellet), 0.02 loads per bite', () => {
    const sim = searchingSim();
    const q = queen(sim), nest = nestOf(sim), bu = sim.world.bu;
    const f = q.queen!.founding!;
    let expelled = 0;
    sim.events.on('pellet-expelled', () => { expelled++; });
    const target = { kind: 'point' as const, id: -1, pos: { x: q.pos.x + q.fwd.x * 2 * bu, y: q.pos.y - 2 * bu, z: q.pos.z + q.fwd.z * 2 * bu } };
    const r0 = f.reserveLoads;
    expect(begin(sim, q, 'dig-bite', target)).toBe(true);
    sim.tick();
    expect(phase(sim)).toBe('dig');
    expect(nest.founding!.state).toBe('digging');
    stepUntil(sim, () => q.action === null, 100);
    expect(expelled).toBeGreaterThanOrEqual(1);
    expect(sim.state.items.filter((i) => i.alive && i.kind === 'soil-pellet')).toHaveLength(0);
    expect(r0 - f.reserveLoads).toBeGreaterThan(0.02);
    expect(sim.state.player.opening!.siteQ).toBeGreaterThan(0); // the dig site's reading
  });

  it('dig -> seal when the cell is ready with the queen inside; seal -> lay when the throat is closed; a batch is 6 eggs', () => {
    const sim = searchingSim();
    pinTemperature(sim, 22);
    const q = queen(sim), nest = nestOf(sim);
    const rej = rejections(sim);
    sim.enqueue({ type: 'cheat.setFoundingState', nestId: nest.id, state: 'digging' });
    carveCellUnderQueen(sim);
    expect(phase(sim)).toBe('dig');
    stepUntil(sim, () => phase(sim) === 'seal', 400);
    expect(phase(sim)).toBe('seal');
    expect(nest.founding!.state).toBe('ready');
    expect(nest.chambers.some((c) => c.type === 'founding')).toBe(true);
    const v = foundingView(sim)!;
    expect(v.readiness?.ready).toBe(true);
    // lay-egg is refused before the seal (the colony's laying rule)
    sim.enqueue({ type: 'openingBeginTimelapse' });
    sim.tick();
    expect(rej).toContain('openingBeginTimelapse:invalid-phase');
    // close the throat (debug fill; the player holds E: seal-entrance)
    for (const e of nest.entrances) {
      const bu = sim.world.bu;
      sim.enqueue({ type: 'cheat.fillSphere', pos: { x: e.pos.x - e.dir.x * 1.5 * bu, y: e.pos.y - e.dir.y * 1.5 * bu, z: e.pos.z - e.dir.z * 1.5 * bu }, r: 1.6 * bu, loose: true });
    }
    stepUntil(sim, () => phase(sim) === 'lay', 400);
    expect(phase(sim)).toBe('lay');
    expect(nest.founding!.state).toBe('sealed');
    expect(sim.state.player.opening!.sealed).toBe(true);
    // one lay-egg action lays a batch of 6 eggs from the pool (0.04 each)
    const batches: number[] = [];
    sim.events.on('opening.egg-batch', (e) => batches.push(e.eggs));
    const r = q.queen!.founding!.reserveLoads;
    expect(begin(sim, q, 'lay-egg', null)).toBe(true);
    stepUntil(sim, () => q.action === null, 100);
    sim.tick();
    expect(batches).toEqual([OPEN_LAY_BATCH_EGGS]);
    expect(sim.state.brood.filter((b) => b.alive && b.stage === 'egg')).toHaveLength(OPEN_LAY_BATCH_EGGS);
    expect(r - q.queen!.founding!.reserveLoads).toBeGreaterThan(OPEN_LAY_BATCH_EGGS * 0.04 - 1e-9);
    expect(sim.state.player.opening!.layBatches).toBe(1);
    expect(sim.state.env.calendar.foundingTick).toBeGreaterThan(0);
    const fc = foundingView(sim)!.clutch!.forecast!;
    expect(fc.expected).toBeGreaterThan(0);
    // "Tend the brood" starts the time-lapse with the queen's care automated
    sim.enqueue({ type: 'openingBeginTimelapse' });
    sim.tick();
    expect(phase(sim)).toBe('timelapse');
    expect(sim.state.player.timelapse?.kind).toBe('founding');
  }, 60_000);

  it('a passive player: one batch is laid automatically 1.5 GD after sealing', () => {
    const sim = searchingSim();
    pinTemperature(sim, 22);
    const nest = nestOf(sim);
    sim.enqueue({ type: 'cheat.setFoundingState', nestId: nest.id, state: 'digging' });
    carveCellUnderQueen(sim);
    stepUntil(sim, () => phase(sim) === 'seal', 400);
    sim.enqueue({ type: 'cheat.setFoundingState', nestId: nest.id, state: 'sealed' });
    sim.tick();
    expect(phase(sim)).toBe('lay');
    stepUntil(sim, () => queen(sim).queen!.founding!.eggsLaid > 0, 10_000);
    expect(sim.state.tick - nest.founding!.sealedTick).toBeGreaterThanOrEqual(9000 - 2);
    expect(queen(sim).queen!.founding!.eggsLaid).toBe(OPEN_LAY_BATCH_EGGS);
  }, 60_000);
});

describe('failure and retry (GDD 06 §5.14)', () => {
  it('the queen dies before sealing: phase `failed` with the cause; nothing advances afterwards; undo is allowed', () => {
    const sim = searchingSim();
    const rej = rejections(sim);
    const causes: string[] = [];
    sim.events.on('opening.failed', (e) => causes.push(e.cause));
    sim.enqueue({ type: 'cheat.killQueen', colonyId: sim.state.colonies[0].id, cause: 'predation' });
    for (let i = 0; i < 20; i++) sim.tick();
    expect(phase(sim)).toBe('failed');
    expect(causes).toEqual(['predation']);
    expect(foundingView(sim)!.failCause).toBe('predation');
    expect(foundingView(sim)!.retriesLeft).toBe(1);
    sim.enqueue({ type: 'openingUndo' });
    sim.enqueue({ type: 'openingSkipIntro' });
    for (let i = 0; i < 20; i++) sim.tick();
    expect(rej).not.toContain('openingUndo:invalid-phase');
    expect(rej).toContain('openingSkipIntro:invalid-phase');
    expect(phase(sim)).toBe('failed');
  });

  it('reserves exhausted in the open: failed with cause exhaustion', () => {
    const sim = searchingSim();
    pinTemperature(sim, 22);
    queen(sim).queen!.founding!.reserveLoads = 0.001;
    stepUntil(sim, () => phase(sim) === 'failed', 50);
    expect(foundingView(sim)!.failCause).toBe('exhaustion');
  });
});

describe('debug: cheat.setFoundingState and cheat.completeFounding', () => {
  it('setFoundingState moves the nest record and the opening phase together', () => {
    const sim = searchingSim();
    const nest = nestOf(sim);
    sim.enqueue({ type: 'cheat.setFoundingState', nestId: nest.id, state: 'digging' });
    sim.tick();
    expect(nest.founding!.state).toBe('digging');
    expect(phase(sim)).toBe('dig');
  });

  it('completeFounding runs the remaining steps through the same state machine to the hand-over', () => {
    const sim = makeTestSim({ sizeBu: 128 });
    pinTemperature(sim, 30); // fast development: the test stays short
    const seen: string[] = [];
    sim.events.on('opening.phase', (e) => seen.push(e.to));
    sim.enqueue({ type: 'cheat.completeFounding', workers: 6 });
    stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 30_000);
    expect(seen).toEqual(['dealation', 'search', 'dig', 'seal', 'lay', 'timelapse', 'handover']);
    expect(sim.state.ants.some((a) => a.alive && a.caste === 'worker')).toBe(true);
  }, 120_000);
});
