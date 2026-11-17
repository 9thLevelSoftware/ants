// Fix-round regression tests (review of task species-leafcutter): player prompts by caste, display lumps not
// pickable, lying fragments joining the cache, chambers reusable only after W = 0, a lost chamber's garden death
// reported, the phorid rate's denominator, and a starved seeded garden ending in the garden-less state.

import { describe, expect, it } from 'vitest';
import type { GardenRecord } from '@/sim/types';
import { canDo } from '@/sim/ants/actions/runner';
import { spawnItem } from '@/sim/entities';
import { TICKS_PER_DAY } from '@/sim/time';
import { addAnts, attaKit, run } from './testkit';
import { fungusSelfPrompt } from './playerPrompts';
import { absorbLyingFragments, lotsLu } from './cache';
import { emptyFungusChambers, syncGardens } from './state';
import { phoridStep, resetRider } from './phorids';
import { gardenLessStep } from './gardenLess';
import { nextState } from './states';
import { stepGarden } from './dynamics';

describe('fix round: possession prompts and display lumps', () => {
  it('a possessed gardener in the garden is offered fungus work by caste', () => {
    const k = attaKit({ G: 2 });
    const [minim] = addAnts(k, 'minor', 1, k.room, 'idle', 0.35);
    const [media] = addAnts(k, 'media', 1, k.room, 'idle', 0.9);
    k.garden.yieldStanding = 0.5;
    expect(fungusSelfPrompt(k.sim, minim)?.primary).toBe('tend-fungus');
    k.garden.cache = [{ lu: 1, q: 0.8, p: 0.1, t: 0, plantId: 1, tick: k.sim.state.tick }];
    expect(fungusSelfPrompt(k.sim, media)?.primary).toBe('process-leaf');
    k.garden.waste = 2;
    // the media's secondary is "take waste" (no pulp waiting); a minim has no secondary (waste is not hers)
    expect(fungusSelfPrompt(k.sim, media)?.secondary).toBe('tend-fungus');
    k.garden.pulp = [];
    expect(fungusSelfPrompt(k.sim, minim)?.secondary ?? null).toBeNull();
  });

  it('a garden display lump cannot be picked up', () => {
    const k = attaKit({ G: 2 });
    run(k.sim, 120); // the display system lays the lumps
    const col = k.sim.state.colonies[0];
    const lump = k.sim.stores.items.list.find((it) => it.alive && it.kind === 'fungus-piece' && it.hardness === 0 && it.colony === col.id);
    expect(lump).toBeDefined();
    const [m] = addAnts(k, 'minor', 1, k.room, 'idle', 0.35);
    const r = canDo(k.sim, m, 'pick-up', { kind: 'item', id: lump!.id, pos: { ...lump!.pos } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-target');
  });

  it('a leaf fragment lying in the garden chamber joins the cache', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    const it = spawnItem(k.sim, { kind: 'leaf-fragment', pos: { ...k.room.center }, init: { bulk: 0.6, colony: col.id, inNest: true, chamberId: k.room.id, nestId: k.nest.nest.id } });
    expect(absorbLyingFragments(k.sim, col, k.garden)).toBeCloseTo(0.6, 6);
    expect(lotsLu(k.garden.cache)).toBeCloseTo(0.6, 6);
    expect(k.sim.stores.items.get(it.id)?.alive ?? false).toBe(false);
  });
});

describe('fix round: garden records', () => {
  it('a dead garden chamber is reusable only once its waste is gone (GDD 07 §6.4.3)', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    k.garden.state = 'dead'; k.garden.biomass = 0; k.garden.waste = 1.5;
    expect(emptyFungusChambers(k.sim, col).some((c) => c.id === k.room.id)).toBe(false);
    k.garden.waste = 0;
    expect(emptyFungusChambers(k.sim, col).some((c) => c.id === k.room.id)).toBe(true);
  });

  it('a garden whose chamber is lost dies with an event and a cause', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    const events: string[] = [];
    k.sim.events.on('garden-state', (e) => { if (e.state === 'dead') events.push(e.cause); });
    k.nest.nest.chambers = k.nest.nest.chambers.filter((c) => c.id !== k.room.id);
    syncGardens(k.sim, col, k.P);
    k.sim.events.flush?.();
    expect(k.garden.state).toBe('dead');
    expect(col.fungus!.lostCause).toBe('collapse');
  });

  it('a seeded garden with no substrate shrinks, dies and leaves the colony garden-less', () => {
    const k = attaKit({ G: 0.6 });
    const col = k.sim.state.colonies[0];
    const g: GardenRecord = k.garden;
    g.state = 'seeded';
    const dt = 25 / TICKS_PER_DAY;
    for (let t = 0; t < 20 && g.state !== 'dead'; t += dt) {
      stepGarden(k.P, g, { tempC: 23, rh: 0.9, gardeners: 3, weeders: 0, subIn1Gd: 0, subQ: 1, subP: 0.1, subT: 0, founding: false, queenInChamber: false }, dt);
      const s = nextState(k.P, g);
      g.state = s === 'dead' ? 'dead' : s;
    }
    expect(g.state).toBe('dead');
    gardenLessStep(k.sim, col, k.P, dt);
    expect(col.fungus!.gardenLess).toBe(true);
  });
});

describe('fix round: phorid rate', () => {
  it('every laden carrier counts once per trip among the day\'s foragers, also on a short carry', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    const [a] = addAnts(k, 'media', 1, null, 'cut', 0.9);
    resetRider(a);
    phoridStep(k.sim, a, col);
    phoridStep(k.sim, a, col);
    expect(col.fungus!.phoridForagersToday).toBe(1);
    resetRider(a);
    phoridStep(k.sim, a, col);
    expect(col.fungus!.phoridForagersToday).toBe(2);
  });
});
