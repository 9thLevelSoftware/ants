// Wood state, moisture and decay, bite rules (GDD 07 §6.2.1-§6.2.3; App. E 11; GDD 03 App. E 4).

import { describe, expect, it } from 'vitest';
// the sim first: entering through a deep module would evaluate module indexes half loaded (import cycles)
import { makeTestSim } from '@/sim/testing/testWorld';
import { DIG_BITE_S } from '@/sim/balance/actions';
import { digBiteDef } from '@/sim/ants/actions/defs/dig';
import { digBiteImpl } from '@/sim/nest/bite';
import { AntFlag } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { installWoodHooks } from './hooks';
import { woodParamsOf } from './params';
import { ensureWoodStates, isNestWood, woodOf } from './woodState';
import { mcEquilibrium, setWood, stepWood, weatherTerms } from './moisture';
import { woodDecayFactor } from './biteRule';
import { BU, carveLogChamber, CP, LOG_ID, testLog, TWIG_ID, woodSim, worker } from './testkit';

installWoodHooks();

describe('wood state (GDD 07 §6.2.1)', () => {
  it('a thick diggable log is nest wood, a twig is not; the record has grain, thickness and segments', () => {
    const sim = woodSim();
    const list = ensureWoodStates(sim);
    expect(list.map((w) => w.primId)).toEqual([LOG_ID]);
    expect(isNestWood(sim.world.prims.find((p) => p.id === TWIG_ID)!, CP, BU)).toBe(false);
    const w = woodOf(sim, LOG_ID)!;
    expect(Math.abs(w.grainAxis!.x)).toBeCloseTo(1, 5);
    expect(w.thicknessBu).toBeCloseTo(20, 5);
    expect(w.segments!.length).toBe(4);
    expect(w.placement).toBe('log-on-soil');
    // the log's centre is 8 BU up and it is 20 BU thick: no segment centre is more than half a thickness above ground
    for (const s of w.segments!) expect(s.mc).toBe(28);
    expect(w.decay).toBe(2);
  });
});

describe('moisture and decay (GDD 07 §6.2.2)', () => {
  it('relaxes toward the equilibrium at MC_RATE 0.25 per GD; rain raises the equilibrium by 8 on exposed wood', () => {
    const sim = woodSim();
    const p = woodParamsOf(sim.species)!;
    const w = woodOf(sim, LOG_ID)!;
    const t = { sunDay: false, winter: false };
    expect(mcEquilibrium(sim, w, 28, t)).toBe(28);
    w.lastRainTick = sim.state.tick;
    expect(mcEquilibrium(sim, w, 28, t)).toBe(28 + 8 * (w.sunExposure === 1 ? 1 : 3 / 8));
    w.lastRainTick = -1;
    for (const s of w.segments!) { s.base = 36; }
    for (let i = 0; i < 24; i++) stepWood(sim, w, p, 1 / 24, t, false);
    expect(w.segments![0].mc).toBeCloseTo(28 + 8 * (1 - Math.exp(-0.25)), 3);
  });

  it('windows dry the wood: −2 per window beyond two, at most −10', () => {
    const sim = woodSim();
    const w = woodOf(sim, LOG_ID)!;
    const t = { sunDay: false, winter: false };
    w.windowCount = 4;
    expect(mcEquilibrium(sim, w, 28, t)).toBe(24);
    w.windowCount = 20;
    expect(mcEquilibrium(sim, w, 28, t)).toBe(18);
  });

  it('decay advances one class per 56 GD at mc >= 22 %, never at or below 18 %', () => {
    const sim = woodSim();
    const p = woodParamsOf(sim.species)!;
    const w = woodOf(sim, LOG_ID)!;
    setWood(w, 25, 1);
    const t = weatherTerms(sim);
    for (let d = 0; d < 56; d++) stepWood(sim, w, p, 1, { ...t, sunDay: false, winter: false }, false);
    expect(w.decay).toBe(2);
    setWood(w, 17, 1);
    for (let d = 0; d < 120; d++) stepWood(sim, w, p, 1, { sunDay: false, winter: false }, false);
    expect(w.decay).toBe(1);
  });

  it('cheat.setWood sets moisture and decay of one primitive and refuses non-wood', () => {
    const sim = makeTestSim({ species: CP, prims: [testLog()] });
    const rejected: string[] = [];
    sim.events.on('command-rejected', (e) => rejected.push(e.commandType));
    sim.enqueue({ type: 'cheat.setWood', primId: LOG_ID, mc: 12, decay: 3 });
    sim.enqueue({ type: 'cheat.setWood', primId: 999, mc: 12, decay: 3 });
    sim.tick();
    const w = woodOf(sim, LOG_ID)!;
    expect(w.moisture).toBeCloseTo(12, 0);
    expect(w.decay).toBe(3);
    expect(rejected).toContain('cheat.setWood');
  });
});

describe('chewing wood (GDD 07 §6.2.3, App. E 11)', () => {
  const along = { x: 1, y: 0, z: 0 }, across = { x: 0, y: 0, z: 1 };
  function biteSeconds(caste: 'minor' | 'media' | 'major', dir: 'along' | 'across', flags = 0): number {
    const sim = woodSim();
    const c = carveLogChamber(sim);
    const fwd = dir === 'along' ? along : across;
    const ant = worker(sim, caste, c, fwd, flags);
    const contact = dir === 'along' ? { x: c.x + 4 * BU, y: c.y, z: c.z } : { x: c.x, y: c.y, z: c.z + 2.5 * BU };
    return digBiteDef.durationS(sim, ant, { kind: 'surface', id: -1, pos: contact });
  }

  it('a media biting decay-2 wood along the grain takes 1.2 x DIG_BITE_S; across 2.16 x; a minor along 1.92 x', () => {
    expect(biteSeconds('media', 'along')).toBeCloseTo(1.2 * DIG_BITE_S, 6);
    expect(biteSeconds('media', 'across')).toBeCloseTo(2.16 * DIG_BITE_S, 6);
    expect(biteSeconds('minor', 'along')).toBeCloseTo(1.92 * DIG_BITE_S, 6);
    expect(biteSeconds('major', 'along')).toBeCloseTo(0.84 * DIG_BITE_S, 6);
    expect(biteSeconds('minor', 'along', AntFlag.NANITIC)).toBeCloseTo(2.16 * DIG_BITE_S, 6);
  });

  it('bite factors by decay class and moisture', () => {
    const p = woodParamsOf(woodSim().species)!;
    expect([woodDecayFactor(p, 0, 10), woodDecayFactor(p, 0, 20), woodDecayFactor(p, 1, 20), woodDecayFactor(p, 3, 20), woodDecayFactor(p, 4, 20)])
      .toEqual([4.0, 2.5, 2.0, 1.0, 0.8]);
  });

  it('GDD 03 E4: a media at sound wood with mc 20 % bites in 25 ticks and gets a frass item; a Lasius worker cannot dig it', () => {
    const sim = woodSim({ material: 'wood-sound' });
    setWood(woodOf(sim, LOG_ID)!, 20, 0);
    const c = carveLogChamber(sim);
    const ant = worker(sim, 'media', c, { x: 1, y: 0, z: 0 });
    const contact = { x: c.x + 4 * BU, y: c.y, z: c.z };
    const ticks = Math.ceil(digBiteDef.durationS(sim, ant, { kind: 'surface', id: -1, pos: contact }) * 10 - 1e-9);
    expect(ticks).toBe(25);
    expect(digBiteDef.check!(sim, ant, { kind: 'surface', id: -1, pos: contact })).toBeNull();
    const feet = { x: c.x + 3 * BU, y: c.y - 1.2 * BU, z: c.z };
    const res = digBiteImpl(sim, ant, feet, { x: 1, y: 0, z: 0 }, 0);
    expect(res.ok).toBe(true);
    expect(sim.stores.items.get(res.pelletId)?.kind).toBe('frass');

    const ln = makeTestSim({ species: 'lasius-niger', prims: [testLog('wood-sound')], systems: [] });
    const lc = carveLogChamber(ln);
    const lw = worker(ln, 'media', lc);
    lw.caste = 'worker';
    expect(digBiteDef.check!(ln, lw, { kind: 'surface', id: -1, pos: { x: lc.x + 4 * 4, y: lc.y, z: lc.z } })).toBe('not-diggable');
  });

  it('galleries keep their walls: an ant inside the wood may not chew within MIN_WALL_BU of the outside; carved-out wood refuses', () => {
    const sim = woodSim();
    const c = carveLogChamber(sim);
    // the chamber's top is 1.25 BU above the centre: the log's top surface is 10 BU above the centre
    const ant = worker(sim, 'media', c, { x: 0, y: 1, z: 0 });
    expect(digBiteDef.check!(sim, ant, { kind: 'surface', id: -1, pos: { x: c.x, y: c.y + 1.25 * BU, z: c.z } })).toBeNull();
    expect(digBiteDef.check!(sim, ant, { kind: 'surface', id: -1, pos: { x: c.x, y: c.y + 9.6 * BU, z: c.z } })).toBe('not-allowed-here');
    woodOf(sim, LOG_ID)!.carvedFrac = 0.41;
    expect(digBiteDef.check!(sim, ant, { kind: 'surface', id: -1, pos: { x: c.x, y: c.y + 1.25 * BU, z: c.z } })).toBe('not-allowed-here');
  });

  it('a wood-nesting species digs no soil (GDD 07 §5.2.6 "no soil nests")', () => {
    const sim = woodSim();
    const ant = worker(sim, 'media', { x: 20 * BU, y: 0.4 * BU, z: 20 * BU }, { x: 0, y: -1, z: 0 });
    expect(digBiteDef.check!(sim, ant, { kind: 'surface', id: -1, pos: { x: 20 * BU, y: 0, z: 20 * BU } })).toBe('not-diggable');
    expect(TICKS_PER_DAY).toBe(6000);
  });
});
