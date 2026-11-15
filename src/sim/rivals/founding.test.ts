// Rivals and the founding queen (GDD 05 §3.10; acceptance 5): sealed in her chamber inside a rival-claimed cell
// she is threatened (p per gd = 0.1 x min(1, m_c / 100) x foundingRivalMult; a dig-in brings 3-6 rival workers
// and a real fight); outside rival territory, on gentle, or once she has workers, she is not.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { DIG_P } from '@/sim/balance/rivals';
import { quietTracker } from '@/sim/ecology/creatures';
import { foundingDigChance, foundingThreatHour } from './founding';
import { claimAt } from './territory';
import { chamberFloor, placeOnFloor } from './setup';
import { JOB, rmod } from './state';
import { player, record, rivalSim, rivalsOf } from './testkit';

/** A sealed founding queen in the small test nest's royal chamber; one rival dx BU away. */
function sealed(dx: number, preset: 'gentle' | 'naturalist' | 'harsh' = 'naturalist'): Sim {
  const sim = rivalSim({ preset, sizeBu: 512, nest: 'small', workers: 0, rivals: [{ species: 'tetramorium-immigrans', dx, dz: 0 }] });
  sim.tick(); // builds the rival nest
  const col = player(sim);
  const nest = sim.stores.nests.get(col.nestIds[0])!;
  const royal = nest.chambers.find((c) => c.type === 'royal') ?? nest.chambers[0];
  const q = sim.stores.ants.get(col.queenId)!;
  q.nestId = nest.id; q.chamberId = royal.id;
  placeOnFloor(sim, q, { ...chamberFloor(royal), y: royal.center.y });
  sim.state.player.opening!.sealed = true;
  sim.state.player.opening!.done = false;
  sim.index.refresh();
  return sim;
}

describe('the founding queen and rival territory', () => {
  it('inside a rival-claimed cell she is threatened: p = 0.1 x m_c / 100 x mult; a dig-in fights her', () => {
    const sim = sealed(60);
    const q = sim.stores.ants.get(player(sim).queenId)!;
    const claim = claimAt(sim, q.pos);
    const rival = rivalsOf(sim)[0];
    expect(claim.owner).toBe(rival.id);
    const { p } = foundingDigChance(sim);
    expect(p).toBeCloseTo(DIG_P * Math.min(1, claim.mark / 100) * 1, 6);
    expect(p).toBeGreaterThan(0);
    const ev = record(sim, ['rival-raid-started', 'combat-hit']);
    expect(foundingThreatHour(sim, 1 / 24, true)).toBe(true);
    const diggers = sim.state.ants.filter((a) => a.alive && a.colony === rival.id && a.bb['rv.job'] === JOB.dig);
    expect(diggers.length).toBeGreaterThanOrEqual(3);
    expect(diggers.length).toBeLessThanOrEqual(6);
    // founding stage (no daytime hour counted): the director refuses every major threat; the dig-in reads its
    // rules but holds no slot and writes none of the director's state
    expect(sim.state.rivals.threatDirector.activeKind).toBeNull();
    expect(rmod(sim.state).raids.find((r) => r.kind === 'dig')?.majorThreat).toBe(false);
    for (let t = 0; t < 400; t++) sim.tick();
    sim.events.flush();
    expect(ev.some((e) => e.type === 'rival-raid-started')).toBe(true);
    const onQueen = ev.filter((e) => e.type === 'combat-hit' && ((e as { targetId: number }).targetId === q.id || (e as { attackerId: number }).attackerId === q.id));
    expect(onQueen.length).toBeGreaterThan(0); // one real fight in the chamber
    // only one dig-in at a time
    expect(rmod(sim.state).raids.filter((r) => r.kind === 'dig').length).toBeLessThanOrEqual(1);
  }, 60_000);

  it('once the director counts hours, the dig-in takes its major-threat slot through requestMajorThreat', () => {
    const sim = sealed(60);
    quietTracker(sim).hours.fill(1); // a quiet past
    expect(foundingThreatHour(sim, 1 / 24, true)).toBe(true);
    expect(sim.state.rivals.threatDirector.activeKind).toBe('rival-dig');
    expect(rmod(sim.state).raids.find((r) => r.kind === 'dig')?.majorThreat).toBe(true);
  }, 60_000);

  it('harsh raises the chance by 1.5; gentle never threatens her', () => {
    const h = sealed(60, 'harsh'), n = sealed(60, 'naturalist'), g = sealed(60, 'gentle');
    expect(foundingDigChance(h).p).toBeCloseTo(1.5 * foundingDigChance(n).p, 6);
    expect(foundingDigChance(g).p).toBe(0);
    expect(foundingThreatHour(g, 1 / 24, true)).toBe(false);
  }, 60_000);

  it('beyond the rival territory she is not threatened', () => {
    const sim = sealed(220);
    const q = sim.stores.ants.get(player(sim).queenId)!;
    expect(claimAt(sim, q.pos).owner).toBe(-1);
    expect(foundingDigChance(sim).p).toBe(0);
    expect(foundingThreatHour(sim, 1 / 24, true)).toBe(false);
    expect(sim.state.ants.some((a) => a.alive && a.colony === rivalsOf(sim)[0].id && a.bb['rv.job'] === JOB.dig)).toBe(false);
  }, 60_000);

  it('once she has workers (or the chamber is open) the dig-in rule no longer applies', () => {
    const sim = sealed(60);
    sim.state.player.opening!.sealed = false;
    expect(foundingDigChance(sim).p).toBe(0);
  }, 60_000);
});
