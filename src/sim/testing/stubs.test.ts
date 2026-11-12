// The cross-module API of F1c task step 3: every listed function exists and is callable on a fresh game without
// throwing. Stubs return a safe "not available" value until their owner implements them; for modules that have
// landed (environment, pheromones) the checks are only that values are finite and in range.
import { describe, expect, it } from 'vitest';
import * as ants from '@/sim/ants';
import * as colony from '@/sim/colony';
import * as combat from '@/sim/combat';
import * as ecology from '@/sim/ecology';
import * as environment from '@/sim/environment';
import * as locomotion from '@/sim/locomotion';
import * as nest from '@/sim/nest';
import * as pheromones from '@/sim/pheromones';
import * as progression from '@/sim/progression';
import { makeTestSim } from './testWorld';

const API: Record<string, [Record<string, unknown>, string[]]> = {
  locomotion: [locomotion, ['navTo', 'navStop', 'navWander', 'navFollowTrail', 'navRetrace', 'integratePossessed', 'placeOnSurface']],
  nest: [nest, ['canDigAt', 'digBite', 'dumpPellet', 'sealEntrance', 'unsealEntrance', 'claimDigSite', 'releaseDigSite',
    'validatePlan', 'createPlan', 'cancelPlan', 'designateChamber', 'siteAt']],
  colony: [colony, ['depositFood', 'withdrawFood', 'feedBrood', 'layEgg', 'requestTask', 'colonyDemand']],
  pheromones: [pheromones, ['deposit', 'sample', 'senseDirection']],
  ecology: [ecology, ['harvest', 'nearestSource', 'discoverSource']],
  combat: [combat, ['applyDamage', 'beginGrapple', 'releaseGrapple']],
  environment: [environment, ['airTemp', 'surfaceTemp', 'soilTemp', 'chamberTemp', 'speedMult', 'lightLevel',
    'sunDirection', 'isRaining', 'rainRate', 'thermalInputs', 'rainIntensityAt']], // last two: D7.2
  ants: [ants, ['canDo', 'begin', 'cancel', 'currentPrompt', 'inspect']],
  progression: [progression, ['publishDiagnostic', 'recordMilestone', 'unlockCodex', 'raiseAlert']],
};

describe('cross-module stub API', () => {
  it('exports every listed function', () => {
    for (const [mod, [m, names]] of Object.entries(API)) {
      for (const n of names) expect(typeof m[n], `${mod}.${n}`).toBe('function');
    }
  });

  it('returns safe values on a fresh game without throwing', () => {
    const sim = makeTestSim();
    const q = sim.state.ants[0];
    const p = { ...q.pos };
    const h = { x: 1, y: 0, z: 0 };
    expect(locomotion.navTo(sim, q, p)).toBe(false);
    expect(locomotion.navWander(sim, q, p, 10)).toBe(false);
    expect(locomotion.navFollowTrail(sim, q, q.colony, 'trail')).toBe(false);
    expect(locomotion.navRetrace(sim, q)).toBe(false);
    expect(() => locomotion.navStop(sim, q)).not.toThrow();
    expect(() => locomotion.integratePossessed(sim, q, 0.016)).not.toThrow();
    expect(locomotion.placeOnSurface(sim, q, p)).toBe(true);
    expect(nest.canDigAt(sim, q, p)).toBe(false);
    expect(nest.digBite(sim, q, p, h, 30)).toMatchObject({ ok: false, voxels: 0, pelletId: -1 });
    expect(nest.dumpPellet(sim, q, -1, p)).toBeNull();
    expect(nest.sealEntrance(sim, -1, q.id)).toBe(false);
    expect(nest.unsealEntrance(sim, -1, q.id)).toBe(false);
    expect(nest.claimDigSite(sim, q)).toBe(false);
    const spec = { nestId: -1, kind: 'tunnel' as const, anchor: { pos: p, normal: h }, priority: 'normal' as const, confirmWarnings: false };
    expect(nest.validatePlan(sim, spec).ok).toBe(false);
    expect(nest.createPlan(sim, spec, 'player')).toBe(-1);
    expect(nest.cancelPlan(sim, -1, 'player')).toBe(false);
    expect(nest.designateChamber(sim, -1, 'nursery', 'player')).toBe(false);
    expect(nest.siteAt(sim, p)).toBeNull();
    expect(colony.depositFood(sim, q.colony, 1, 1)).toEqual({ c: 0, p: 0 });
    expect(colony.withdrawFood(sim, q.colony, 1, 1)).toEqual({ c: 0, p: 0 });
    expect(colony.feedBrood(sim, q, -1, 1, 1)).toEqual({ c: 0, p: 0 });
    expect(colony.layEgg(sim, q)).toBe(-1);
    expect(colony.requestTask(sim, q, 'forage', 'released')).toBe(false);
    expect(colony.colonyDemand(sim, q.colony, 'forage')).toBe(0);
    pheromones.deposit(sim, q.colony, 'trail', p, 2);
    expect(pheromones.sample(sim, q.colony, 'trail', p)).toBe(2);
    expect(pheromones.senseDirection(sim, q.colony, 'trail', p, h, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 })).toBeGreaterThanOrEqual(0);
    expect(ecology.harvest(sim, q, -1, 1)).toEqual({ c: 0, p: 0 });
    expect(ecology.nearestSource(sim, q.colony, p, 100)).toBe(-1);
    expect(ecology.discoverSource(sim, q.colony, -1, q.id)).toBe(false);
    expect(combat.applyDamage(sim, 'ant', q.id, 5, 'combat')).toBe(0);
    expect(combat.beginGrapple(sim, q.id, 'ant', q.id)).toBe(false);
    expect(() => combat.releaseGrapple(sim, q.id)).not.toThrow();
    expect(environment.airTemp(sim, p)).toBeGreaterThan(0);
    expect(environment.surfaceTemp(sim, p)).toBeGreaterThan(0);
    expect(environment.soilTemp(sim, p)).toBeGreaterThan(0);
    expect(environment.chamberTemp(sim, -1)).toBeGreaterThan(0);
    expect(environment.speedMult(sim, 25, 'lasius-niger')).toBeGreaterThan(0);
    expect(environment.lightLevel(sim, p)).toBeGreaterThanOrEqual(0);
    const sun = environment.sunDirection(sim, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(sun.x, sun.y, sun.z)).toBeCloseTo(1, 5);
    expect(environment.isRaining(sim)).toBe(false);
    expect(environment.rainRate(sim, p)).toBe(0);
    expect(ants.canDo(sim, q, 'dig-bite', null).ok).toBe(false);
    expect(ants.begin(sim, q, 'dig-bite', null)).toBe(false);
    expect(() => ants.cancel(sim, q, null)).not.toThrow();
    expect(ants.currentPrompt(sim, q)).toBeNull();
    expect(ants.inspect(sim, q.id)?.caste).toBe('queen');
    expect(ants.inspect(sim, -1)).toBeNull();
    expect(() => progression.publishDiagnostic(sim, {
      id: 'diag-stores', system: 'colony', status: 'ok', label: '', value: 0, factors: [], remedies: [], sinceTick: 0, focus: null,
    })).not.toThrow();
    expect(progression.recordMilestone(sim, 'ms-first-eggs')).toBe(false);
    expect(progression.unlockCodex(sim, 'cx-honeydew')).toBe(false);
    expect(progression.raiseAlert(sim, {
      kind: 'food-c-low', level: 'warning', subjectId: -1, title: '', cause: '', focus: null, diagnosticId: null,
    })).toBe(-1);
  });
});
