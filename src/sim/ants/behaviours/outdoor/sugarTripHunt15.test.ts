// Colony-life round 15 (direction 30 item 4): a forager sent for carbohydrate keeps to her trip unless the colony is
// short of protein. On woodland-edge #3 (sweep 14's hand-over) 29 of 33 trips to a nectar source turned home short of
// it with a springtail caught on the way, while the colony's carbohydrate stood far under its winter need. The
// departure already weighed the prey patch against the source; breaking off on the way overrode that choice.
// Without a protein deficit: no forager on her way to the nectar breaks off. With one (needP 1): one does (as
// huntSourceTrip.verify, which holds needP 1, already shows).
import { describe, expect, it } from 'vitest';
import type { PreyPatch } from '@/sim/types';
import { spawnCreatureOfKind } from '@/sim/ecology';
import { announce, forageScenario, run } from './testkit';
import { K, PHASE } from './keys';

function chasesOnTheWay(needP: number): { tries: number; hunters: number } {
  const { sim, col, sources } = forageScenario({
    workers: 24, stores: { c: 1, p: 0 }, sources: [{ kind: 'nectar', variant: 'flower', distBu: 70, bearingDeg: 0, units: 50 }],
    holdNeeds: { needC: 1, needP, sP: needP > 0 ? 0.9 : 0, proteinDeficit: needP > 0 },
  });
  const src = sources[0];
  announce(sim, col, src);
  const bu = sim.world.bu;
  const patch: PreyPatch = { id: sim.state.nextId++, center: { x: src.pos.x, y: src.pos.y, z: src.pos.z + 200 * bu }, radius: 10 * bu, kind: 'springtail', count: 100, k: 100 };
  sim.state.ecology.preyPatches.push(patch);
  const hunters = new Set<number>();
  let tries = 0;
  for (let t = 0; t < 8000 && tries < 25 && hunters.size === 0; t += 20) {
    run(sim, 20);
    for (const a of sim.stores.ants.list) {
      // broke off on the way out (D4's hunt on the way home after a failed trip is another rule)
      const from = a.bb[K.huntFrom] ?? -1;
      if (a.alive && a.colony === col.id && a.bb[K.phase] === PHASE.hunt && (a.bb[K.src] ?? -1) >= 0
        && (from === PHASE.outbound || from === PHASE.search)) hunters.add(a.id);
    }
    if (sim.stores.creatures.list.some((c) => c.alive && c.kind === 'springtail')) continue;
    const f = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id && a.task === 'forage' && a.nestId < 0
      && a.bb[K.phase] === PHASE.outbound && a.bb[K.src] === src.id && a.carry.kind === 'none');
    if (!f) continue;
    // a springtail of the patch just ahead of her
    const x = f.pos.x + f.fwd.x * 3 * bu, z = f.pos.z + f.fwd.z * 3 * bu;
    spawnCreatureOfKind(sim, 'springtail', { x, y: sim.field.height(x, z), z }, { state: 'graze', bb: { patch: patch.id, contact: sim.state.tick } });
    tries++;
  }
  return { tries, hunters: hunters.size };
}

describe('a forager on her way to sugar and prey she meets (round 15)', () => {
  it('without a protein deficit she walks on to the nectar', () => {
    const r = chasesOnTheWay(0);
    expect(r.tries, JSON.stringify(r)).toBeGreaterThan(5);
    expect(r.hunters, JSON.stringify(r)).toBe(0);
  }, 180_000);

  it('with a protein deficit she breaks off and hunts', () => {
    const r = chasesOnTheWay(1);
    expect(r.hunters, JSON.stringify(r)).toBeGreaterThan(0);
  }, 180_000);
});
