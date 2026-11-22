// Independent review of colony-life round 11, R38 items 2, 3 and 5 (notice.ts): wiring and determinism.
// The round's unit tests call noticeOutside() directly, so none of them fails if the behaviour runner stops calling it.
// Here the colony runs on real ticks: a non-scout worker on her trip must come to hold a smelled-food report
// (ant.bb 'notice.report', set only by notice.ts, which only behaviourRunner.ts calls), and a game saved while such
// reports and patch-walk timers are pending (ant.bb 'notice.report' / 'notice.patch0' / 'notice.next') must continue
// exactly as the uninterrupted game (design seed: deterministic given seed + commands).
import { describe, expect, it } from 'vitest';
import type { PreyPatch } from '@/sim/types';
import { createSource } from '@/sim/ecology/sources/spawn';
import { discoverSource } from '@/sim/ecology';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { findNonPlain } from '@/sim/testing';
import { forageScenario, run } from './testkit';

describe('colony-life round 11 review: R38 notice rules on real ticks', () => {
  it('a non-scout reports smelled food through the runner, and a save with pending notices loads equal', () => {
    // a known sugar spill 40 BU out; an unknown carcass beside the way there; an unknown full prey patch on the way
    const { sim, col, entrance, sources } = forageScenario({
      workers: 24, stores: { c: 1, p: 0 },
      sources: [{ kind: 'sugar', variant: 'sugary-spill', bearingDeg: 0, distBu: 40, units: 300 }],
    });
    const bu = sim.world.bu;
    for (const s of sources) {
      discoverSource(sim, col.id, s.id, -1);
      if (!col.knownSourceIds.includes(s.id)) col.knownSourceIds.push(s.id);
    }
    const cx = entrance.pos.x + 25 * bu, cz = entrance.pos.z + 6 * bu;
    const carcass = createSource(sim, { variant: 'insect-medium', pos: { x: cx, y: sim.field.height(cx, cz), z: cz } });
    const px = entrance.pos.x + 20 * bu, pz = entrance.pos.z;
    const patch: PreyPatch = { id: sim.state.nextId++, center: { x: px, y: sim.field.height(px, pz), z: pz }, radius: 8 * bu, kind: 'springtail', count: 300, k: 400 };
    sim.state.ecology.preyPatches.push(patch);

    const pendingNonScout = () => sim.stores.ants.list.some((a) => a.alive && a.task !== 'scout' && (a.bb['notice.report'] ?? -1) === carcass.id);
    let t = 0;
    for (; t < 9000 && !pendingNonScout() && !col.knownSourceIds.includes(carcass.id); t += 10) run(sim, 10);
    const tasks = sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id).map((a) => a.task);
    expect(pendingNonScout(), JSON.stringify({ t, known: col.knownSourceIds.includes(carcass.id), tasks })).toBe(true);

    expect(findNonPlain(sim.state)).toEqual([]);
    const loaded = createSim(restore(snapshot(sim)).state, sim.world);
    expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
    run(sim, 1500);
    run(loaded, 1500);
    expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
    // the report arrives home and the colony knows the carcass (it was never collected by a scout in between or not)
    expect(col.knownSourceIds.includes(carcass.id) || sim.stores.ants.list.some((a) => (a.bb['notice.report'] ?? -1) === carcass.id)).toBe(true);
  }, 240_000);
});
