// Adversarial checks of the F1b skeleton (reviewer-written). Tests that FAIL here document real defects for the fixer.
import { describe, expect, it } from 'vitest';
import type { Command, Sim, System } from '@/sim/types';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { findNonPlain } from '@/sim/testing/plainData';
import { encode } from '@/core/serialize';

function run(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

/** A rich command script: every implemented handler with state effects, issued at fixed ticks. */
function scripted(sim: Sim): void {
  const col = sim.state.colonies[0];
  const q = sim.world.queenStart.pos;
  const t = sim.state.tick;
  const at = (k: number, cmds: Command[]): void => {
    if (t === k) for (const c of cmds) sim.enqueue(c);
  };
  at(3, [
    { type: 'cheat.spawnAnts', colonyId: col.id, n: 6, caste: 'worker', ageGd: 1, task: 'forage', pos: null },
    { type: 'cheat.spawnBrood', colonyId: col.id, stage: 'larva', n: 4, chamberId: -1, progress: 0.3, destined: null },
    { type: 'cheat.spawnFood', kind: 'sugar', variant: null, pos: { x: q.x + 20, y: q.y, z: q.z }, units: 7, stage: null },
    { type: 'cheat.spawnCreature', kind: 'springtail', variant: null, pos: { x: q.x - 20, y: q.y, z: q.z }, state: null },
  ]);
  at(10, [
    { type: 'placeMarker', kind: 'forage', pos: { x: q.x + 30, y: q.y, z: q.z }, radius: 40 },
    { type: 'possess', antId: col.queenId, via: 'command' },
    { type: 'setTrail', on: true },
    { type: 'setDirectives', colonyId: col.id, stayIn: true, allocation: { forage: 40, nurse: 30, dig: 20, defend: 10 } },
    { type: 'cheat.carveSphere', pos: { x: q.x, y: q.y - 8, z: q.z }, r: 4 },
  ]);
  at(40, [
    { type: 'release', reason: 'player' },
    { type: 'cheat.addFood', colonyId: col.id, c: 3, p: 1, toxin: 0 },
    { type: 'cheat.kill', id: sim.state.ants.length > 1 ? sim.state.ants[1].id : -1, cause: 'old-age' },
  ]);
}

const scriptSystem: System = { name: 'test-script', run: scripted };

describe('F1b verify: determinism with the implemented command handlers', () => {
  it('restore at N + M more ticks equals a straight run, with possession, markers, carving, cheats', () => {
    const world = makeTestWorld({ seed: 11, terrain: 'noise', prims: 2 });
    const systems = [scriptSystem, ...SYSTEMS];
    const mk = (): Sim => makeTestSim({ world, seed: 11, systems });
    for (const N of [5, 10, 11, 39, 41]) {
      const straight = mk();
      run(straight, 120);
      const first = mk();
      run(first, N);
      const resumed = createSim(restore(snapshot(first)).state, world, { systems });
      run(resumed, 120 - N);
      expect(stateHash(resumed.state), `N=${N}`).toBe(stateHash(straight.state));
    }
  });

  it('state stays plain data after the scripted commands', () => {
    const sim = makeTestSim({ systems: [scriptSystem, ...SYSTEMS] });
    run(sim, 60);
    expect(findNonPlain(sim.state)).toEqual([]);
    expect(sim.state.markers.length).toBe(1);
    expect(sim.state.worldDelta.carve.keys.length).toBeGreaterThan(0);
  });

  it('ids are never reused across death, sweep and restore', () => {
    const sim = makeTestSim();
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 3, caste: 'worker', ageGd: 0, task: null, pos: null });
    sim.tick();
    const ids = sim.state.ants.map((a) => a.id);
    sim.enqueue({ type: 'cheat.killAll', colonyId: col.id });
    sim.tick();
    expect(sim.state.ants.length).toBe(0);
    const resumed = createSim(restore(snapshot(sim)).state, sim.world);
    resumed.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 3, caste: 'worker', ageGd: 0, task: null, pos: null });
    resumed.tick();
    for (const a of resumed.state.ants) expect(ids).not.toContain(a.id);
  });
});

describe('F1b verify: command robustness', () => {
  it('a malformed command (unknown type, e.g. from the debug API) must not wedge every later tick', () => {
    const sim = makeTestSim();
    sim.enqueue({ type: 'noSuchCommand' } as unknown as Command);
    // One bad command may be rejected (or even throw once), but the sim must keep ticking afterwards.
    try { sim.tick(); } catch { /* tolerated once */ }
    expect(() => sim.tick()).not.toThrow();
  });

  it('possessing an ant while running at 8x drops the speed (GDD 08: 8x disabled while possessing, drop to 1x)', () => {
    const sim = makeTestSim();
    sim.enqueue({ type: 'setSpeed', speed: 8 });
    sim.tick();
    expect(sim.state.env.time.speed).toBe(8);
    sim.enqueue({ type: 'possess', antId: sim.state.colonies[0].queenId, via: 'command' });
    sim.tick();
    expect(sim.state.player.possessedAntId).toBe(sim.state.colonies[0].queenId);
    expect(sim.state.env.time.speed).not.toBe(8);
  });

  it('possessing a dead or foreign id is rejected with an event, never throws', () => {
    const sim = makeTestSim();
    const seen: string[] = [];
    sim.events.on('possess-rejected', (e) => seen.push(e.reason));
    sim.enqueue({ type: 'possess', antId: 999999, via: 'command' });
    sim.enqueue({ type: 'possess', antId: -1, via: 'command' });
    sim.tick();
    expect(seen).toEqual(['dead', 'dead']);
    expect(sim.state.player.possessedAntId).toBe(-1);
  });

  it('killing the possessed ant ends possession and queues possession-ended', () => {
    const sim = makeTestSim();
    const qid = sim.state.colonies[0].queenId;
    const ends: string[] = [];
    sim.events.on('possession-ended', (e) => ends.push(e.reason));
    sim.enqueue({ type: 'possess', antId: qid, via: 'command' });
    sim.tick();
    sim.enqueue({ type: 'cheat.killQueen', colonyId: sim.state.colonies[0].id, cause: 'test' });
    sim.tick();
    expect(sim.state.player.possessedAntId).toBe(-1);
    expect(ends).toEqual(['death']);
    expect(sim.state.ants.find((a) => a.id === qid)).toBeUndefined(); // swept
  });
});

describe('F1b verify: save robustness and size', () => {
  it('restore rejects garbage, a wrong format tag and a newer version with an Error', () => {
    expect(() => restore(new Uint8Array([1, 2, 3, 4]))).toThrow();
    expect(() => restore(encode({ format: 'other', version: 1, state: {} }))).toThrow(/not a FOUNDRESS/);
    expect(() => restore(encode({ format: 'foundress-sim', version: 99, state: { version: 99 } }))).toThrow(/newer/);
  });

  it('records the encoded size per simulated ant (packaging: 2500 ants across colonies)', () => {
    const sim = makeTestSim();
    const base = snapshot(sim).length;
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: sim.state.colonies[0].id, n: 500, caste: 'worker', ageGd: 0, task: null, pos: null });
    sim.tick();
    const perAnt = (snapshot(sim).length - base) / 500;
    // Breadcrumb ring + 2 route slots are preallocated Float32Arrays in every ant (about 2 kB of zeros each).
    expect(perAnt).toBeLessThan(4096);
    expect(perAnt * 2500).toBeLessThan(12 * 1024 * 1024);
  });
});
