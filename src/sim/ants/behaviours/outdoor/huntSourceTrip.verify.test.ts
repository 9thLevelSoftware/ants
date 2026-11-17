// Independent review of colony-life round 2, fix H1 (hunting patch prey, hunt.ts).
//
// huntCheck lets a forager on its way to a known food source break off and hunt patch prey it meets. The chase keeps
// the trip's source (K.src), and the load's food kind is read from that source (transitions.ts noteKind: "hunted
// remains come from no source" is only true on a hunting trip). So a springtail caught on the way to a nectar source
// is booked home as `nectar`, and the return is credited to the nectar source (recordForagerReturn, route memory),
// not to the patch. The round counted prey loads home by the `prey` delivery kind ("16 kills, 11 loads home").
//
// This test: foragers walk to a known nectar source; a springtail of a prey patch is put just ahead of an outbound
// forager until one catches it and brings the remains home. The delivery of those remains must be booked as `prey`.
import { describe, expect, it } from 'vitest';
import type { PreyPatch, SimEvent } from '@/sim/types';
import { spawnCreatureOfKind } from '@/sim/ecology';
import { announce, forageScenario, run } from './testkit';
import { K, PHASE } from './keys';

describe('colony-life round 2 review, H1: prey caught on a trip to a source', () => {
  it('the remains are booked home as prey, not as the source the trip was heading for', () => {
    const { sim, col, sources } = forageScenario({
      workers: 24, stores: { c: 1, p: 0 }, sources: [{ kind: 'nectar', variant: 'flower', distBu: 70, bearingDeg: 0, units: 50 }],
      holdNeeds: { needC: 1, needP: 1, sP: 0.9 },
    });
    const src = sources[0];
    announce(sim, col, src);
    // a springtail patch (its prey must belong to a patch for huntCheck), away from the forager's path
    const bu = sim.world.bu;
    const patch: PreyPatch = { id: sim.state.nextId++, center: { x: src.pos.x, y: src.pos.y, z: src.pos.z + 200 * bu }, radius: 10 * bu, kind: 'springtail', count: 100, k: 100 };
    sim.state.ecology.preyPatches.push(patch);

    // ants that chased prey while their trip had a source
    const hunters = new Set<number>();
    const deliveries: (SimEvent & { type: 'delivery' })[] = [];
    sim.events.on('delivery', (e) => { if (hunters.has(e.antId)) deliveries.push(e); });
    let tries = 0;
    for (let t = 0; t < 12000 && !deliveries.some((d) => d.p > 0); t += 20) {
      run(sim, 20);
      for (const a of sim.stores.ants.list) {
        if (a.alive && a.colony === col.id && a.bb[K.phase] === PHASE.hunt && (a.bb[K.src] ?? -1) >= 0) hunters.add(a.id);
      }
      if (tries >= 40 || sim.stores.creatures.list.some((c) => c.alive && c.kind === 'springtail')) continue;
      const f = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id && a.task === 'forage' && a.nestId < 0
        && a.bb[K.phase] === PHASE.outbound && a.bb[K.src] === src.id && a.carry.kind === 'none');
      if (!f) continue;
      const x = f.pos.x + f.fwd.x * 3 * bu, z = f.pos.z + f.fwd.z * 3 * bu;
      spawnCreatureOfKind(sim, 'springtail', { x, y: sim.field.height(x, z), z }, { state: 'graze', bb: { patch: patch.id, contact: sim.state.tick } });
      tries++;
    }
    const withP = deliveries.filter((d) => d.p > 0);
    const info = JSON.stringify({ tries, hunters: hunters.size, deliveries: deliveries.map((d) => `${d.kind} c${d.c.toFixed(3)} p${d.p.toFixed(3)} src${d.sourceId}`) });
    console.log('[huntSourceTrip.verify]', info);
    expect(hunters.size, info).toBeGreaterThan(0);
    expect(withP.length, info).toBeGreaterThan(0);
    // the remains (P 0.25, no C) are prey and come from no food source
    for (const d of withP) {
      expect(d.kind, info).toBe('prey');
      expect(d.sourceId, info).toBe(-1);
    }
  }, 180_000);
});
