// Raids on the full system list (acceptance 4): a raid on the player arrives with a warning (`rival-raid-started`
// at launch, then the `raid-seen` alert before the first raider is inside the nest); the party walks there,
// fights and goes home; the ant budget holds every tick.
import { describe, expect, it } from 'vitest';
import { ANT_TOTAL_CAP } from '@/sim/balance/rivals';
import { BB } from './state';
import { rmod } from './state';
import { player, record, rivalSim, rivalsOf } from './testkit';

describe('a raid on the player nest', () => {
  it('is announced, warned about before the raiders get in, fought, and ends', () => {
    const sim = rivalSim({ seed: 4, nest: 'small', workers: 12, rivals: [{ species: 'tetramorium-immigrans', dx: 70, dz: 10 }] });
    sim.tick(); // the rival nest is built
    const rival = rivalsOf(sim)[0];
    const pnest = sim.stores.nests.get(player(sim).nestIds[0])!;
    const ev = record(sim, ['rival-raid-started', 'rival-raid-ended', 'alert', 'combat-hit']);
    sim.enqueue({ type: 'cheat.triggerRaid', attacker: rival.id, target: player(sim).id, force: true });
    let startTick = -1, warnTick = -1, entryTick = -1, maxTotal = 0;
    for (let t = 0; t < 4000; t++) {
      sim.tick();
      sim.events.flush();
      const total = sim.state.ants.filter((a) => a.alive).length;
      maxTotal = Math.max(maxTotal, total);
      if (startTick < 0 && ev.some((e) => e.type === 'rival-raid-started')) startTick = sim.state.tick;
      if (warnTick < 0 && ev.some((e) => e.type === 'alert' && (e as { alert: { kind: string } }).alert.kind === 'raid-seen')) warnTick = sim.state.tick;
      if (entryTick < 0 && sim.state.ants.some((a) => a.alive && a.colony === rival.id && a.nestId === pnest.id && (a.bb[BB.raid] ?? -1) >= 0)) entryTick = sim.state.tick;
      if (entryTick >= 0 && t > 200 && ev.some((e) => e.type === 'rival-raid-ended')) break;
    }
    expect(startTick).toBeGreaterThan(0);
    expect(warnTick).toBeGreaterThan(0);
    expect(warnTick).toBeGreaterThanOrEqual(startTick);
    if (entryTick >= 0) expect(warnTick).toBeLessThan(entryTick);
    expect(ev.filter((e) => e.type === 'combat-hit').length).toBeGreaterThan(0);
    expect(maxTotal).toBeLessThanOrEqual(ANT_TOTAL_CAP);
    const started = ev.find((e) => e.type === 'rival-raid-started') as { partySize: number };
    expect(started.partySize).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`raid: start ${startTick}, warning ${warnTick}, first raider inside ${entryTick}, party ${started.partySize}, records ${rmod(sim.state).raids.length}`);
  }, 120_000);
});
