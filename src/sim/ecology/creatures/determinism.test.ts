// Determinism and plain data (task AC 6; GDD 05 E24, I10): two runs of the same seed give identical creature and
// ecology state; a save/load (structured copy of the plain state) continues identically; nothing un-plain is
// stored; no creature ends inside a solid.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { findNonPlain, makeTestSim } from '@/sim/testing';
import { createSim } from '@/sim/sim';
import { locomotionSystem } from '@/sim/locomotion';
import { creatureDirectorSystem, creatureSystem } from './index';
import { addHerd, installFakeCombat, placeWorker, setClock } from './testkit';

const KINDS = ['wolf-spider', 'jumping-spider', 'ant-spider', 'antlion', 'rove-beetle', 'centipede', 'woodlouse', 'snail', 'millipede', 'earthworm', 'springtail'] as const;

function build(seed: number): Sim {
  const sim = makeTestSim({ seed, sizeBu: 200, terrain: 'noise', prims: 6, systems: [creatureDirectorSystem, creatureSystem, locomotionSystem] });
  setClock(sim, 'summer', 3, 17);
  KINDS.forEach((kind, i) => {
    const a = (2 * Math.PI * i) / KINDS.length;
    sim.state.ecology.director.territories.push({
      kind, center: { x: 400 + Math.cos(a) * 250, y: 0, z: 400 + Math.sin(a) * 250 }, radius: kind === 'antlion' ? 25 : 200,
      occupantId: -1, vacantUntilTick: -1,
    });
  });
  addHerd(sim, 400, 400, 300);
  for (let i = 0; i < 24; i++) {
    const ant = placeWorker(sim, 330 + (i % 6) * 25, 330 + Math.floor(i / 6) * 25);
    ant.task = 'forage';
  }
  return sim;
}

/** The parts of the state this module owns or writes, serialised. */
function snapshot(sim: Sim): string {
  const s = sim.state;
  return JSON.stringify({
    creatures: s.creatures, ecology: { ...s.ecology, carrionAcc: Array.from(s.ecology.carrionAcc) }, threat: s.rivals.threatDirector,
    ants: s.ants.map((a) => [a.id, a.alive, a.hp, a.pos, a.combat]), items: s.items, sources: s.sources,
    danger: Array.from(s.colonies[0].danger), rng: s.rngStreams,
  });
}

function wander(sim: Sim, ticks: number): void {
  for (let t = 0; t < ticks; t++) sim.tick();
}

describe('creature determinism', () => {
  it('same seed -> identical state after 2000 ticks; plain data; nobody inside a solid', () => {
    const { restore } = installFakeCombat();
    try {
      const a = build(7), b = build(7);
      wander(a, 2000); wander(b, 2000);
      expect(snapshot(a)).toBe(snapshot(b));
      expect(a.stores.creatures.list.filter((c) => c.alive).length).toBeGreaterThan(5);
      expect(findNonPlain(a.state.creatures)).toEqual([]);
      expect(findNonPlain(a.state.ecology)).toEqual([]);
      for (const c of a.stores.creatures.list) if (c.alive) expect(a.field.sample(c.pos)).toBeGreaterThan(-0.5);
    } finally {
      restore();
    }
  }, 60_000);

  it('a save/load in the middle continues exactly like the uninterrupted run', () => {
    const { restore } = installFakeCombat();
    try {
      const a = build(11);
      wander(a, 800);
      const copy = structuredClone(a.state);
      const b = createSim(copy, a.world, { systems: [creatureDirectorSystem, creatureSystem, locomotionSystem] });
      wander(a, 800); wander(b, 800);
      expect(snapshot(b)).toBe(snapshot(a));
    } finally {
      restore();
    }
  }, 60_000);
});
