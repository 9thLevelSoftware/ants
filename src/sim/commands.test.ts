import { describe, expect, it } from 'vitest';
import type { Behaviour, System } from '@/sim/types';
import { COMMAND_TYPES, SYSTEM_PHASES } from '@/sim/types';
import { buildCommandTable, commandHandler, commandTableReport, COMMAND_OWNERS } from '@/sim/commands';
import {
  assembleSystems, BEHAVIOURS, createBehaviourTable, duplicateBehaviours, END_OF_TICK_SYSTEM, SIM_MODULES, SYSTEMS,
} from '@/sim/systems';
import { killAnt } from '@/sim/entities';
import { makeTestSim } from '@/sim/testing/testWorld';

describe('command handlers (contributed by module indexes, ruling 9)', () => {
  it('every command type has exactly one handler, from its owner module', () => {
    const r = commandTableReport();
    expect(r.missing).toEqual([]);
    expect(r.duplicates).toEqual([]);
    expect(r.misplaced).toEqual([]);
    expect(r.unknown).toEqual([]);
    for (const t of COMMAND_TYPES) expect(typeof commandHandler(t), t).toBe('function');
    expect(Object.keys(COMMAND_OWNERS).sort()).toEqual([...COMMAND_TYPES].sort());
  });

  it('the merge detects a type claimed twice, a missing type and a misplaced handler', () => {
    const extra = { key: 'world' as const, mod: { systems: [], commandHandlers: { possess: () => {} } } };
    const without = SIM_MODULES.filter((m) => m.key !== 'rivals');
    const r = buildCommandTable([...without, extra]);
    expect(r.duplicates.map((d) => d.type)).toEqual(['possess']);
    expect(r.misplaced).toEqual([{ type: 'possess', owner: 'ants', by: 'world' }]);
    expect(r.missing).toEqual(['cheat.setRival', 'cheat.setRelation', 'cheat.triggerRaid']);
  });
});

describe('system list (assembled from module exports, ruling 13)', () => {
  it('every module system has a phase, and names are unique', () => {
    expect(assembleSystems(SIM_MODULES).unphased).toEqual([]);
    const names = SYSTEMS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('is sorted by phase, starts with commands and ends with lifecycle (architecture §3)', () => {
    const ranks = SYSTEMS.map((s) => (s.name === END_OF_TICK_SYSTEM ? SYSTEM_PHASES.length : SYSTEM_PHASES.indexOf(s.phase!)));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(SYSTEMS[0].name).toBe('commands');
    expect(SYSTEMS[SYSTEMS.length - 1].name).toBe('lifecycle');
  });

  it('keeps the F1b tick order (module owners may add systems in between, ruling 13)', () => {
    const names = SYSTEMS.map((s) => s.name);
    const f1b = [
      'commands', 'calendar', 'weather', 'human-events', 'environment-effects', 'sources', 'plants', 'allocation',
      'queen', 'founding', 'brood', 'perception', 'behaviours', 'player-control', 'actions', 'creature-director',
      'creatures', 'locomotion', 'combat', 'nest', 'architect', 'pheromones', 'economy', 'colony-stats',
      'overwinter', 'reproduction', 'rivals', 'progression', 'diagnostics', 'lifecycle',
    ];
    expect(names.filter((n) => f1b.includes(n))).toEqual(f1b);
  });

  it('places a module system by phase whatever the module order', () => {
    const late: System = { name: 'late-module-early-phase', phase: 'environment', run: () => {} };
    const { systems } = assembleSystems([...SIM_MODULES, { mod: { systems: [late], commandHandlers: {} } }]);
    const names = systems.map((s) => s.name);
    // after every environment-phase system of the listed modules (species modules add some), before ecology
    const at = names.indexOf('late-module-early-phase');
    const lastEnv = systems.reduce((m, s, i) => (s.phase === 'environment' && s !== late ? i : m), -1);
    expect(at).toBe(lastEnv + 1);
    expect(systems[at + 1].phase).toBe('ecology');
  });

  it('runs the corpse pass after lifecycle-phase systems of later modules (a flood-drowned ant keeps its body)', () => {
    // nest-flood (nest module) and fungus-phorid-deaths (species module) share the lifecycle phase but come from
    // modules listed after `ants`; a stable phase sort alone put them after the corpse pass.
    const killer: System = { name: 'test-late-killer', phase: 'lifecycle', run: (sim) => {
      const ant = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker');
      if (ant) killAnt(sim, ant.id, 'drowning');
    } };
    const { systems } = assembleSystems([...SIM_MODULES, { mod: { systems: [killer], commandHandlers: {} } }]);
    const sim = makeTestSim({ nest: 'small', workers: 1, systems });
    const id = sim.state.ants.find((a) => a.caste === 'worker')!.id;
    sim.tick();
    const corpse = sim.state.items.find((it) => it.kind === 'corpse');
    expect(sim.state.ants.some((a) => a.id === id)).toBe(false);
    expect(corpse, 'corpse of the ant killed in the lifecycle phase').toBeDefined();
    const names = SYSTEMS.map((s) => s.name);
    for (const n of ['nest-flood', 'succession']) expect(names.indexOf(n), n).toBeLessThan(names.indexOf('lifecycle'));
  });
});

describe('behaviour table (assembled from module exports)', () => {
  const noop = (): void => {};
  const generic: Behaviour = { task: 'tend', enter: noop, update: noop, exit: noop };
  const lasius: Behaviour = { task: 'tend', species: ['lasius-niger'], enter: noop, update: noop, exit: noop };

  it('prefers the species-specific behaviour, falls back to the generic one', () => {
    const t = createBehaviourTable([generic, lasius]);
    expect(t.get('tend', 'lasius-niger')).toBe(lasius);
    expect(t.get('tend', 'messor-barbarus')).toBe(generic);
    expect(t.get('forage', 'lasius-niger')).toBeUndefined();
  });

  it('reports duplicates; the shipped modules have none', () => {
    expect(duplicateBehaviours([generic, generic, lasius])).toEqual(['tend|*']);
    expect(duplicateBehaviours(BEHAVIOURS)).toEqual([]);
  });
});
