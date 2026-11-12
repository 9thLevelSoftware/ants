// Reviewer tests (int-1A-sim gate). Scenario (c) in stage1a.e2e.test.ts saves and restores a colony that FORAGES:
// nothing is carved in its 3,000 + 3,000 tick window, so it does not exercise GDD 03 App. E check 25 ("identical
// carve-chunk hashes after 6,000 ticks, also after a save / load at tick 3,000") nor the chamber-detection fixes the
// gate report credits to it. Here the founding queen digs (dig-bite, pellets, mound, entrance, chamber detection)
// across the save point, and the restored game runs on a freshly GENERATED world, as a real load does.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Ant, Sim, System, WorldData } from '@/sim/types';
import { begin } from '@/sim/ants';
import { navTo } from '@/sim/locomotion';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { restore, snapshot, stateHash } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { findDigSite, passiveBehaviours } from './colonyScenario';

const SEED = 1;
let world: WorldData;

beforeAll(() => {
  world = generateWorld(defaultGameConfig('lasius-niger', SEED).world);
}, 180_000);

/** Heading turn after an unwalkable ramp step, rad. */
const RAMP_TURN = Math.PI / 3;

/** ant.bb keys of the stateless dig driver (all of its state is persisted). */
const K = { ph: 'rv.ph', k: 'rv.k', on: 'rv.on', fail: 'rv.fail', adv: 'rv.adv', cx: 'rv.cx', cy: 'rv.cy', cz: 'rv.cz', dx: 'rv.dx', dz: 'rv.dz' };

function queenOf(sim: Sim): Ant {
  return sim.stores.ants.get(sim.state.colonies[0].queenId)!;
}

/**
 * The founding dig of foundingScript.ts with every bit of its state in queen.bb, as a system: a ramp shaft to
 * 5 BU, then a room of bites round a growing circle. Works the same in a restored game.
 */
function digDriver(): System {
  return {
    name: 'rv-dig', phase: 'behaviours',
    run(sim) {
      const q = queenOf(sim), bb = q.bb, bu = sim.world.bu;
      if (bb[K.ph] === undefined) return;
      if (bb[K.adv] === 1) {
        if (q.nav.status === 'moving') return;
        bb[K.adv] = 0;
        // gate-review fix of the driver: a step down the ramp that cannot be walked (nav 'failed') left the queen
        // re-biting the same open face forever (seen on the sand site of the current seed-1 world); turn the
        // shaft heading by RAMP_TURN so the next bite meets a new face (persisted in bb like the rest)
        if (q.nav.status === 'failed' && bb[K.ph] === 0) {
          const c = Math.cos(RAMP_TURN), sn = Math.sin(RAMP_TURN), x = bb[K.dx], z = bb[K.dz];
          bb[K.dx] = x * c - z * sn; bb[K.dz] = x * sn + z * c;
        }
        return;
      }
      if (q.action) return;
      const dx = bb[K.dx], dz = bb[K.dz];
      if (bb[K.ph] === 0 && sim.field.height(q.pos.x, q.pos.z) - q.pos.y >= 5 * bu) {
        bb[K.ph] = 1; bb[K.cx] = q.pos.x; bb[K.cy] = q.pos.y; bb[K.cz] = q.pos.z;
      }
      if (bb[K.ph] === 0) {
        if (bb[K.fail] === 1) {
          bb[K.fail] = 0; bb[K.adv] = 1;
          navTo(sim, q, { x: q.pos.x + dx * bu, y: q.pos.y - bu, z: q.pos.z + dz * bu }, 0.6 * bu);
        } else begin(sim, q, 'dig-bite', { kind: 'point', id: -1, pos: { x: q.pos.x + dx * 2 * bu, y: q.pos.y - 2 * bu, z: q.pos.z + dz * 2 * bu } });
        return;
      }
      const k = bb[K.k] ?? 0;
      if (bb[K.fail] === 1 || (bb[K.on] ?? 0) >= 3) {
        bb[K.fail] = 0; bb[K.on] = 0; bb[K.k] = k + 1; bb[K.adv] = 1;
        const a = (k + 1) * 2.4, r = Math.min(2.5, 0.6 + 0.04 * (k + 1)) * bu;
        navTo(sim, q, { x: bb[K.cx] + Math.cos(a) * r, y: bb[K.cy], z: bb[K.cz] + Math.sin(a) * r }, 0.5 * bu);
        return;
      }
      const a = k * 2.4;
      if (begin(sim, q, 'dig-bite', { kind: 'point', id: -1, pos: { x: q.pos.x + Math.cos(a) * 2 * bu, y: q.pos.y - 0.2 * bu, z: q.pos.z + Math.sin(a) * 2 * bu } })) {
        bb[K.on] = (bb[K.on] ?? 0) + 1;
      }
    },
  };
}

function build(state: Sim['state'], w: WorldData): Sim {
  const sim = createSim(state, w, { systems: [...SYSTEMS, digDriver()], behaviours: passiveBehaviours() });
  // a failed bite is remembered in state (events are flushed after the tick, in both runs alike)
  sim.events.on('action-failed', (e) => { const q = queenOf(sim); if (e.antId === q.id) q.bb[K.fail] = 1; });
  return sim;
}

describe('save / load while the founding queen digs (reviewer, GDD 03 App. E check 25)', () => {
  it('carving, pellets, mound and chamber detection continue identically after a restore on a regenerated world', () => {
    const { state } = createNewGame({ ...defaultGameConfig('lasius-niger', SEED), cheats: true }, world);
    const a = build(state, world);
    const q = queenOf(a), bu = a.world.bu;
    const site = findDigSite(a, q, q.pos, 8, 80)!;
    expect(navTo(a, q, site, 1.5 * bu)).toBe(true);
    for (let t = 0; t < 3000 && q.nav.status === 'moving'; t++) a.tick();
    expect(q.nav.status).toBe('arrived');
    const nest = a.stores.nests.get(a.state.colonies[0].nestIds[0])!;
    nest.founding!.state = 'digging';
    nest.origin = { ...q.pos };
    q.bb[K.ph] = 0; q.bb[K.dx] = q.fwd.x; q.bb[K.dz] = q.fwd.z;
    let chambers = 0, expelled = 0;
    a.events.on('chamber-registered', () => { chambers++; });
    a.events.on('pellet-expelled', () => { expelled++; });

    // save when the shaft is done and the room begins (at most N ticks): the chamber then registers after the save
    // on any world (with a fixed tick the room was already registered on the current seed-1 sand site)
    const N = 8000, M = 6000;
    for (let t = 0; t < N && q.bb[K.ph] !== 1; t++) a.tick();
    expect(q.bb[K.ph]).toBe(1);
    const carved0 = a.state.worldDelta.carve.keys.length;
    expect(carved0).toBeGreaterThan(0);
    const saved = snapshot(a);
    const hashAtSave = stateHash(a.state);
    const expelledAtSave = expelled, chambersAtSave = chambers;
    for (let t = 0; t < M; t++) a.tick();
    expect(expelledAtSave).toBeGreaterThan(10);
    expect(expelled - expelledAtSave).toBeGreaterThan(10);

    // digging went on in the window after the save (the comparison below is not of an idle nest)
    const mound = a.state.worldDelta.mounds.find((m) => m.nestId === nest.id);
    expect(mound && mound.volume).toBeGreaterThan(0);
    expect(stateHash(a.state)).not.toBe(hashAtSave);

    const fresh = generateWorld(defaultGameConfig('lasius-niger', SEED).world);
    const b = build(restore(saved).state, fresh);
    for (let t = 0; t < M; t++) b.tick();
    expect(b.state.tick).toBe(a.state.tick);
    expect(b.state.worldDelta.carve.keys).toEqual(a.state.worldDelta.carve.keys);
    expect(b.state.nests.map((n) => n.chambers.map((c) => [c.id, c.voxelCount]))).toEqual(
      a.state.nests.map((n) => n.chambers.map((c) => [c.id, c.voxelCount])));
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    // the room registered as a chamber inside the post-save window (chamber detection runs on both sides)
    expect(chambersAtSave).toBe(0);
    expect(chambers).toBeGreaterThanOrEqual(1);
  }, 600_000);
});
