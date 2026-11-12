// F-int review (adversarial): makeTestSim / the small nest / the soak invariants, beyond the implementer's tests.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim, SpeciesId } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { walkerSnapshot, walkerStep } from '@/sim/locomotion/walker';
import { stateHash } from '@/sim/save';
import { registerNestTargets } from '@/sim/services';
import { checkInvariants, collectInvariants, type InvariantViolation } from './invariants';
import { makeTestSim } from './testWorld';

const EXIT = { kind: 'exit' as const, id: -1 };
const SEAL = { kind: 'seal' as const, id: -1 };

/**
 * Descends the exit field until the opening is reached on the surface (GDD 03 §5.2 hand-over: D_exit reaches the
 * opening, then surface navigation takes over). The rim walk-off itself is loco's, so it is not required here.
 */
function walkOut(sim: Sim, ant: Ant, maxTicks: number): { ticks: number; out: boolean; minClear: number } {
  const nest = sim.state.nests[0], ent = nest.entrances[0], bu = sim.world.bu;
  const field = nestFieldId(nest.id, EXIT);
  const target = { x: 0, y: 0, z: 0 }, want = { x: 0, y: 0, z: 0 };
  let minClear = Infinity;
  for (let t = 0; t < maxTicks; t++) {
    const d = sim.kernel.nav.lookahead(field, ant.pos, 4, target);
    const outside = !sim.field.isInSubstrate(ant.pos.x, ant.pos.y, ant.pos.z);
    if (outside && Math.hypot(ant.pos.x - ent.pos.x, ant.pos.z - ent.pos.z) < ent.radius + 2 * bu) return { ticks: t, out: true, minClear };
    if (d > 0.5 * bu && Number.isFinite(d)) {
      want.x = target.x - ant.pos.x; want.y = target.y - ant.pos.y; want.z = target.z - ant.pos.z;
    } else {
      want.x = ant.pos.x - ent.pos.x + ent.dir.x * bu; want.y = ent.dir.y * bu; want.z = ant.pos.z - ent.pos.z + ent.dir.z * bu + 0.3 * bu;
    }
    walkerSnapshot(ant);
    walkerStep(sim.field, ant, want, 12 * bu, 0.1, sim.kernel.walker);
    minClear = Math.min(minClear, sim.field.sample(ant.pos) / ant.footOffset);
  }
  return { ticks: maxTicks, out: false, minClear };
}

describe('F-int verify: small nest workers', () => {
  it('EVERY one of the 20 workers (all three chambers) walks out with kernel nest-nav + walker only', () => {
    const sim = makeTestSim({ nest: 'small', workers: 20, systems: [] });
    const stuck: string[] = [];
    for (const a of sim.state.ants.filter((x) => x.caste === 'worker')) {
      const r = walkOut(sim, a, 600);
      if (!r.out || r.minClear < 0.3) stuck.push(`ant ${a.id} chamber ${a.chamberId}: out=${r.out} ticks=${r.ticks} minClear=${r.minClear.toFixed(2)}`);
    }
    expect(stuck).toEqual([]);
  });

  it('workers are placed with consistent previous-tick kinematics (render interpolation) and are not falling', () => {
    const sim = makeTestSim({ nest: 'small', workers: 12, terrain: 'noise', features: 'all', seed: 7, systems: [] });
    for (const a of sim.state.ants.filter((x) => x.caste === 'worker')) {
      expect(a.prevPos).toEqual(a.pos);
      expect(a.prevUp).toEqual(a.up);
      expect(a.prevFwd).toEqual(a.fwd);
      expect(a.medium).not.toBe('air');
      expect(Math.abs(a.fwd.x * a.up.x + a.fwd.y * a.up.y + a.fwd.z * a.up.z)).toBeLessThan(1e-6); // fwd tangent
    }
    const out: InvariantViolation[] = [];
    expect(checkInvariants(sim, collectInvariants(), out)).toBe(0);
  });

  it('two identical makeTestSim calls give identical state (deterministic test fixture)', () => {
    const mk = () => makeTestSim({ nest: 'small', workers: 20, terrain: 'noise', features: 'all', seed: 11, systems: [] });
    expect(stateHash(mk().state)).toBe(stateHash(mk().state));
  });

  // Only Lasius is registered today (species-data adds the others); the layout is in BU, so a BU-scaled world must
  // work too: same species, a world built for another BU is not possible yet, so this checks the registered ones.
  for (const species of ['lasius-niger'] as SpeciesId[]) {
    it(`small nest + workers works for ${species} on noise terrain with every feature`, () => {
      const sim = makeTestSim({ species, nest: 'small', workers: 6, terrain: 'noise', features: 'all', seed: 3, systems: [] });
      const nest = sim.state.nests[0];
      for (const a of sim.state.ants.filter((x) => x.caste === 'worker')) {
        expect(Math.abs(sim.field.sample(a.pos) - a.footOffset)).toBeLessThan(0.02 * sim.world.bu);
        expect(sim.nestNav.distance(nest.id, EXIT, a.pos)).toBeGreaterThan(0);
      }
    });
  }

  it('workers without the small nest are refused loudly', () => {
    expect(() => makeTestSim({ workers: 3 })).toThrow(/nest/);
  });
});

describe('F-int verify: registerNestTargets', () => {
  it('re-registering is idempotent (same distances) and drops fields of removed chambers', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const nest = sim.state.nests[0], bu = sim.world.bu;
    const p = nest.chambers[2].center;
    const d0 = sim.nestNav.distance(nest.id, EXIT, p);
    registerNestTargets(sim.nestNav, nest, bu);
    expect(sim.nestNav.distance(nest.id, EXIT, p)).toBeCloseTo(d0, 9);
    const gone = nest.chambers.pop()!;
    registerNestTargets(sim.nestNav, nest, bu);
    expect(sim.kernel.nav.hasTarget(nestFieldId(nest.id, { kind: 'chamber', id: gone.id }))).toBe(false);
  });

  it('a fully sealed nest has no exit field but a finite seal field from every chamber (GDD 03 N1)', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const nest = sim.state.nests[0], bu = sim.world.bu;
    nest.entrances[0].status = 'sealed';
    registerNestTargets(sim.nestNav, nest, bu);
    expect(sim.kernel.nav.hasTarget(nestFieldId(nest.id, EXIT))).toBe(false);
    for (const c of nest.chambers) expect(sim.nestNav.distance(nest.id, SEAL, c.center)).toBeGreaterThan(0);
  });

  it('a nest with no entrances and no chambers registers nothing and does not throw', () => {
    const sim = makeTestSim({ systems: [] });
    const nest = sim.state.nests[0];
    expect(() => registerNestTargets(sim.nestNav, nest, sim.world.bu)).not.toThrow();
    expect(sim.kernel.nav.targets().filter((t) => t.startsWith(`nest:${nest.id}:`))).toEqual([]);
  });
});
