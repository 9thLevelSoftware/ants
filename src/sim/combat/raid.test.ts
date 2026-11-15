// Integration on the full system list: a band of rival workers walks up to the player's nest entrance. The colony
// recruits through guards, encounters and alarm; fights run with locks, sprays and flight; corpses appear. Checks
// the core invariants every 100 ticks, that combat events flow, and the cost of the combat system.
import { describe, expect, it } from 'vitest';
import { createColony, spawnAnt } from '@/sim/entities';
import { makeTestSim } from '@/sim/testing/testWorld';
import { checkInvariants, collectInvariants, type InvariantViolation } from '@/sim/testing';
import { combatSystem, combatSummary } from './index';
import { record } from './testkit';

describe('a raid on the player nest (full systems)', () => {
  it('fights happen, nothing breaks, corpses are items, the combat system stays cheap', () => {
    const sim = makeTestSim({ seed: 21, nest: 'small', workers: 30, sizeBu: 128 });
    const rival = createColony(sim, { species: 'lasius-niger', isPlayer: false });
    const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
    const e = nest.entrances[0];
    const bu = sim.world.bu;
    const band = Array.from({ length: 12 }, (_, i) => spawnAnt(sim, {
      colony: rival.id, caste: 'worker', lengthBu: 1, task: 'idle',
      pos: { x: e.pos.x + (6 + (i % 4)) * bu, y: 0, z: e.pos.z + (Math.floor(i / 4) - 1) * 1.5 * bu },
      fwd: { x: -1, y: 0, z: 0 },
    }));
    for (const a of band) { a.tb = 25; a.bb['cb.alX'] = e.pos.x; a.bb['cb.alY'] = e.pos.y; a.bb['cb.alZ'] = e.pos.z; a.alarmLevel = 1; }
    sim.index.refresh();
    const ev = record(sim, ['combat-hit', 'combat-lock', 'ant-died', 'alarm-raised']);
    const inv = collectInvariants();
    const bad: InvariantViolation[] = [];
    // time the combat system alone (minimum of a few measures, load-tolerant)
    const run = combatSystem.run;
    let combatMs = 0;
    combatSystem.run = (s) => { const t0 = performance.now(); run(s); combatMs += performance.now() - t0; };
    try {
      for (let t = 0; t < 1500; t++) {
        sim.tick();
        if (t % 100 === 0) checkInvariants(sim, inv, bad);
      }
    } finally { combatSystem.run = run; }
    sim.events.flush();
    expect(bad).toEqual([]);
    const hits = ev.filter((x) => x.type === 'combat-hit').length;
    expect(hits).toBeGreaterThan(0);
    const deaths = ev.filter((x) => x.type === 'ant-died' && x.cause === 'combat');
    for (const d of deaths) {
      const corpse = sim.state.items.find((i) => i.kind === 'corpse' && Math.hypot(i.pos.x - (d.pos as { x: number }).x, i.pos.z - (d.pos as { z: number }).z) < 2 * bu);
      expect(corpse).toBeDefined();
    }
    const s = combatSummary(sim);
    // eslint-disable-next-line no-console
    console.log(`raid: ${hits} hits, ${ev.filter((x) => x.type === 'combat-lock').length} locks, ${deaths.length} combat deaths, summary ${JSON.stringify(s)}, combat system ${(combatMs / 1500).toFixed(3)} ms/tick`);
    // load-tolerant budget: the combat system with ~45 ants must stay well under a millisecond per tick
    expect(combatMs / 1500).toBeLessThan(2);
  });
});
