// TEMPORARY probe (colony-life round 8, protein ledger): how each chase of patch prey ends. Deleted after use; a copy
// is kept under test-output/colony-life/round-8/protein/.
import { describe, it } from 'vitest';
import type { PreyPatch } from '@/sim/types';
import { colonySlotBit } from '@/sim/entities';
import { forageScenario, run } from './testkit';
import { K, PHASE } from './keys';

function addPatch(sim: ReturnType<typeof forageScenario>['sim'], at: { x: number; z: number }, distBu: number, rBu: number, k: number) {
  const bu = sim.world.bu, x = at.x + distBu * bu, z = at.z;
  const p: PreyPatch = { id: sim.state.nextId++, center: { x, y: sim.field.height(x, z), z }, radius: rBu * bu, kind: 'springtail', count: k, k };
  sim.state.ecology.preyPatches.push(p);
  return p;
}

describe('probe: chase outcomes', () => {
  it('traces chases for one game day', () => {
    const { sim, col, entrance } = forageScenario({ workers: 14, stores: { c: 4, p: 0 }, holdNeeds: { needC: 0, needP: 1, sP: 0.9 } });
    const patch = addPatch(sim, entrance.pos, 60, 20, 400);
    patch.knownBy = colonySlotBit(sim, col.id);
    const bu = sim.world.bu;
    const out: Record<string, number> = {};
    const bump = (k: string) => { out[k] = (out[k] ?? 0) + 1; };
    const live = new Map<number, { t0: number; prey: number; from: number; minD: number; touches: number }>();
    let kills = 0, escEv = 0, spawned = 0, vanished = 0;
    sim.events.on('prey-subdued', (e) => { if (e.antIds.length) kills++; });
    sim.events.on('prey-escaped', () => escEv++);
    sim.events.on('creature-spawned', (e) => { if (e.kind === 'springtail') spawned++; });
    sim.events.on('creature-despawned', (e) => { if (e.kind === 'springtail' && e.cause === 'vanished') vanished++; });
    const jumps = new Map<number, { x: number; z: number }>();
    let jumpCount = 0;
    for (let t = 0; t < 6000; t++) {
      run(sim, 1);
      for (const c of sim.stores.creatures.list) {
        if (!c.alive || c.kind !== 'springtail') continue;
        const p = jumps.get(c.id);
        if (p && Math.hypot(c.pos.x - p.x, c.pos.z - p.z) > 30) jumpCount++;
        jumps.set(c.id, { x: c.pos.x, z: c.pos.z });
      }
      for (const a of sim.stores.ants.list) {
        if (!a.alive || a.colony !== col.id) continue;
        const ph = a.bb[K.phase];
        const tr = live.get(a.id);
        if (ph === PHASE.hunt) {
          const preyId = a.bb[K.prey] ?? -1;
          if (!tr) live.set(a.id, { t0: sim.state.tick, prey: preyId, from: a.bb[K.huntFrom] ?? -1, minD: Infinity, touches: 0 });
          const c = sim.stores.creatures.get(preyId);
          const cur = live.get(a.id)!;
          if (c && c.alive) cur.minD = Math.min(cur.minD, Math.hypot(c.pos.x - a.pos.x, c.pos.z - a.pos.z) / bu);
          continue;
        }
        if (!tr) continue;
        live.delete(a.id);
        const c = sim.stores.creatures.get(tr.prey);
        const s = (sim.state.tick - tr.t0) / 10;
        const preyState = !c ? 'prey-gone' : c.alive ? 'prey-alive' : 'prey-dead';
        const dist = c && c.alive ? Math.hypot(c.pos.x - a.pos.x, c.pos.z - a.pos.z) / bu : -1;
        const carry = a.carry.kind === 'item' ? 'carrying' : 'empty';
        const dur = s >= 19.5 ? 'timeout' : s < 2 ? '<2s' : '2-20s';
        bump(`${preyState} ${carry} ${dur} from${tr.from} -> ph${ph}`);
        bump(`minD ${tr.minD < 0.5 ? '<0.5' : tr.minD < 1 ? '0.5-1' : tr.minD < 2 ? '1-2' : tr.minD < 5 ? '2-5' : '>=5'} BU`);
        if (dist >= 0) bump(`end dist ${dist < 2 ? '<2' : dist < 10 ? '2-10' : '>=10'} BU`);
      }
    }
    throw new Error("PROBE " + JSON.stringify({ spawned, vanished, kills, escEv, jumpCount, patchCount: Math.round(patch.count), out }));
  }, 300_000);
});
