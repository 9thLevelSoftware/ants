// The agent budget (GDD 05 §3.3, I7; directions §K; acceptance 2): RIVAL_AGENT_BUDGET = min(900, 2500 - player -
// 50), shared by priority; player + rival ants <= 2500 at every tick, also when the player colony grows into the
// budget (agents are absorbed at once, player ants never removed). The 28-day soak with 4 rivals and forced wars
// runs behind FOUNDRESS_LONG.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { spawnAnt } from '@/sim/entities';
import { commandsSystem } from '@/sim/systems';
import { behaviourSystem, lifecycleSystem } from '@/sim/ants';
import { checkInvariants, collectInvariants, type InvariantViolation } from '@/sim/testing';
import { ANT_TOTAL_CAP } from '@/sim/balance/rivals';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { allocateBudget, antCounts, rivalAgentBudget } from './fielding';
import { rivalsSystem, rivalsTickSystem } from './index';
import { JOB } from './state';
import { player, rivalSim, rivalsOf } from './testkit';

const LONG = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_LONG;

function total(sim: Sim): number {
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive) n++;
  return n;
}

function forceWars(sim: Sim): void {
  const cols = rivalsOf(sim);
  for (let i = 0; i < cols.length; i++) {
    sim.enqueue({ type: 'cheat.setRelation', a: cols[i].id, b: cols[(i + 1) % cols.length].id, e: 40, state: 'war' });
    sim.enqueue({ type: 'cheat.setRelation', a: player(sim).id, b: cols[i].id, e: 40, state: 'war' });
  }
}

const FOUR = [
  { species: 'lasius-niger' as const, dx: -200, dz: -200 }, { species: 'tetramorium-immigrans' as const, dx: 200, dz: -200 },
  { species: 'myrmica-rubra' as const, dx: -200, dz: 200 }, { species: 'formica-rufa' as const, dx: 200, dz: 200 },
];

describe('agent budget', () => {
  it('budget formula and priority sharing', () => {
    expect(rivalAgentBudget(0)).toBe(900);
    expect(rivalAgentBudget(1600)).toBe(850);
    expect(rivalAgentBudget(2500)).toBe(0);
    // two colonies: defenders first, then raid ..., foragers share what is left proportionally
    const t = [new Array(13).fill(0), new Array(13).fill(0)];
    t[0][JOB.defend] = 5; t[0][JOB.forage] = 100; t[1][JOB.guard] = 4; t[1][JOB.forage] = 300;
    const a = allocateBudget(t, 109);
    expect(a[0][JOB.defend]).toBe(5);
    expect(a[1][JOB.guard]).toBe(4);
    expect(a[0][JOB.forage] + a[1][JOB.forage]).toBeLessThanOrEqual(100);
    expect(a[0][JOB.forage]).toBe(25);
    expect(a[1][JOB.forage]).toBe(75);
  });

  it('a player colony grown into the budget pushes the rival agents out; the total never exceeds 2500', () => {
    const sim = rivalSim({ sizeBu: 640, rivals: FOUR, systems: [commandsSystem, behaviourSystem, rivalsTickSystem, rivalsSystem, lifecycleSystem] });
    sim.tick();
    forceWars(sim);
    for (let i = 0; i < 400; i++) sim.tick();
    const fieldedBefore = rivalsOf(sim).reduce((s, c) => s + c.rival.fieldedIds.length, 0);
    expect(fieldedBefore).toBeGreaterThan(0);
    // the player colony jumps to 2440 ants (more than budget + margin leaves room for)
    const col = player(sim), q = sim.stores.ants.get(col.queenId)!;
    while (antCounts(sim).player < 2440) spawnAnt(sim, { colony: col.id, caste: 'worker', pos: { ...q.pos }, task: 'idle', ageGd: 5 });
    let worst = 0;
    for (let i = 0; i < 2 * TICKS_PER_HOUR; i++) {
      sim.tick();
      worst = Math.max(worst, total(sim));
      expect(total(sim)).toBeLessThanOrEqual(ANT_TOTAL_CAP);
    }
    const fielded = rivalsOf(sim).reduce((s, c) => s + c.rival.fieldedIds.length, 0);
    expect(fielded).toBeLessThanOrEqual(rivalAgentBudget(antCounts(sim).player));
    expect(antCounts(sim).player).toBe(2440); // player ants are never removed
    // eslint-disable-next-line no-console
    console.log(`budget: fielded before ${fieldedBefore}, after ${fielded}, worst total ${worst}`);
  }, 120_000);

  it.skipIf(!LONG)('28 gd naturalist soak, 4 rivals, forced wars: player + rival ants <= 2500 every tick (App. E 21)', () => {
    const sim = rivalSim({ seed: 1, sizeBu: 768, nest: 'small', workers: 40, rivals: FOUR });
    const inv = collectInvariants();
    const bad: InvariantViolation[] = [];
    let worst = 0, worstFielded = 0, overs = 0;
    const t0 = performance.now();
    for (let t = 0; t < 28 * TICKS_PER_DAY; t++) {
      if (t % (6 * TICKS_PER_HOUR) === 1) forceWars(sim);
      sim.tick();
      const n = total(sim);
      if (n > ANT_TOTAL_CAP) overs++;
      worst = Math.max(worst, n);
      worstFielded = Math.max(worstFielded, rivalsOf(sim).reduce((s, c) => s + c.rival.fieldedIds.length, 0));
      if (t % TICKS_PER_DAY === 0) {
        checkInvariants(sim, inv, bad);
        // eslint-disable-next-line no-console
        console.log(`day ${t / TICKS_PER_DAY}: ants ${n}, fielded max ${worstFielded}, rivals ${rivalsOf(sim).map((c) => `${c.species}:${c.rival.n.toFixed(0)}`).join(' ')}, ${((performance.now() - t0) / 1000).toFixed(0)} s`);
      }
    }
    expect(overs).toBe(0);
    expect(worst).toBeLessThanOrEqual(ANT_TOTAL_CAP);
    expect(bad.filter((v) => v.invariant.startsWith('rivals'))).toEqual([]);
  }, 7_200_000);
});
