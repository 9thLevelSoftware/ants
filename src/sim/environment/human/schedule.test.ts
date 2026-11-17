// Acceptance 2 and GDD 04 App. E 22-24: the day's draw follows the schedule table per kind and difficulty over a
// 28-day year, never uses a zone the map lacks, and `humanActivity: off` silences people.

import { beforeAll, describe, expect, it } from 'vitest';
import { rngFork } from '@/core/rng';
import type { DifficultyId, Sim } from '@/sim/types';
import { HUMAN_EVENT_KINDS } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { DIFFICULTY_PARAMS, presetRuleValues } from '@/sim/balance';
import { HUMAN_SCHEDULE } from '@/sim/balance/human';
import { daysPerYear } from '@/sim/time';
import { humanEventsSystem } from './index';
import { dayContext, drawDayEvents, type DayContext } from './schedule';
import { expectedDay } from './testkit';
import { humanSites } from './sites';

const worlds = new Map<string, Sim>();
/** One generated world per archetype (memory: generated worlds are large); presets and rules are switched in place. */
function simFor(arch: 'kitchen-door' | 'playground-park', preset: DifficultyId = 'naturalist', humanActivity?: 'off'): Sim {
  let s = worlds.get(arch);
  if (!s) {
    const cfg = defaultGameConfig('lasius-niger', 7);
    cfg.cheats = true;
    cfg.world = { ...cfg.world, archetype: arch };
    const g = createNewGame(cfg);
    s = createSim(g.state, g.world, { systems: [humanEventsSystem] });
    worlds.set(arch, s);
  }
  const d = s.state.config.difficulty;
  d.preset = preset;
  d.params = { ...DIFFICULTY_PARAMS[preset] };
  d.custom = humanActivity ? { humanActivity } : {};
  s.state.config.rules.humanActivity = humanActivity ?? presetRuleValues(preset).humanActivity; // what the preset implies
  return s;
}

/** Expected count of each kind over the year (sum of the day expectations). */
function expectedYear(sim: Sim, ctxOf: (d: number) => DayContext): Record<string, { mean: number; var: number }> {
  const out: Record<string, { mean: number; var: number }> = {};
  for (let d = 0; d < daysPerYear(sim.state.config); d++) {
    for (const [k, e] of Object.entries(expectedDay(sim, ctxOf(d)))) {
      const o = out[k] ??= { mean: 0, var: 0 };
      o.mean += e.mean; o.var += e.var;
    }
  }
  return out;
}

function drawYear(sim: Sim, seed: number, ctxOf: (d: number) => DayContext) {
  const rng = rngFork(seed, 'test.year');
  const counts: Record<string, number> = {};
  const all: ReturnType<typeof drawDayEvents> = [];
  for (let d = 0; d < daysPerYear(sim.state.config); d++) {
    const list = drawDayEvents(sim, ctxOf(d), rng).filter((e) => {
      const h = e.hour;
      // the quiet-hour extras (night cars, one interior pass) are outside the table
      return !((e.kind === 'car' || e.kind === 'footsteps') && (h >= 22 || h < 6));
    });
    for (const e of list) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    all.push(...list);
  }
  return { counts, all };
}

describe('human schedule (AC2, GDD 04 §15.1-15.2)', () => {
  // world generation takes seconds (more on a loaded machine): once, outside the per-test timeout
  beforeAll(() => { simFor('kitchen-door'); simFor('playground-park'); }, 180_000);

  it.each(['gentle', 'naturalist', 'harsh'] as const)('matches the table per kind over a 28-day year on %s', (preset) => {
    for (const arch of ['kitchen-door', 'playground-park'] as const) {
      const sim = simFor(arch, preset);
      const ctxOf = (d: number) => ({ ...dayContext(sim, d), heat: false });
      const exp = expectedYear(sim, ctxOf);
      const { counts, all } = drawYear(sim, 11, ctxOf);
      for (const k of HUMAN_EVENT_KINDS) {
        const e = exp[k] ?? { mean: 0, var: 0 };
        const got = counts[k] ?? 0;
        // sampling error: floor + Bernoulli draws (and the per-day p of a row), 4 sigma plus one event
        expect(Math.abs(got - e.mean), `${arch} ${preset} ${k}: got ${got}, expected ${e.mean.toFixed(1)}`).toBeLessThanOrEqual(4 * Math.sqrt(e.var) + 1);
      }
      // no event in a zone the map lacks, nor of a kind worldgen disabled
      const zoneIds = new Set(sim.world.zones.map((z) => z.id));
      for (const e of all) {
        const site = humanSites(sim.world).list[e.siteId];
        expect(site, `${e.kind} site`).toBeDefined();
        for (const z of site.zoneIds) expect(zoneIds.has(z)).toBe(true);
        expect(sim.world.meta.disabledEvents).not.toContain(e.kind);
      }
    }
  });

  it('draws children only where there is a play area, and the kitchen kinds only with a kitchen', () => {
    const kd = drawYear(simFor('kitchen-door'), 3, (d) => dayContext(simFor('kitchen-door'), d)).counts;
    const pp = drawYear(simFor('playground-park'), 3, (d) => dayContext(simFor('playground-park'), d)).counts;
    expect(kd.children ?? 0).toBe(0);
    expect(kd.vacuum ?? 0).toBeGreaterThan(0);
    expect(pp.vacuum ?? 0).toBe(0);
    expect(pp.children ?? 0).toBeGreaterThan(0);
  });

  it('each meal gets its own interior passes (3), crumb drop (1) and wipe (1) on Naturalist', () => {
    const sim = simFor('kitchen-door');
    const sites = humanSites(sim.world).list;
    const rng = rngFork(13, 'meals');
    const inW = (h: number, w: { from: number; to: number }) => h >= w.from && h < w.to;
    for (let d = 0; d < 7; d++) {
      const ev = drawDayEvents(sim, dayContext(sim, d), rng);
      for (const [kind, site, perWindow] of [['footsteps', 'interior-lane', 3], ['food-drop', 'table', 1], ['sweeping', 'counter', 1]] as const) {
        const row = HUMAN_SCHEDULE.find((r) => r.kind === kind && r.site === site)!;
        const list = ev.filter((e) => e.kind === kind && sites[e.siteId].kind === site && e.hour >= 6 && e.hour < 22);
        const n = sites.filter((s) => s.kind === site).length;
        // windows can overlap (08-22 holds the breakfast window): count the meal windows' shares by the draw itself
        expect(list.length, `${kind} day ${d}`).toBe(perWindow * row.windows.length * n);
        for (const w of row.windows.slice(0, 3)) expect(list.filter((e) => inW(e.hour, w)).length).toBeGreaterThanOrEqual(perWindow * n);
      }
    }
  });

  it('E22: a summer weekend day on a playground-park map has 3 children sessions, all within 10:00-17:00', () => {
    const sim = simFor('playground-park');
    let day = -1;
    for (let d = 0; d < 28 && day < 0; d++) { const c = dayContext(sim, d); if (c.season === 'summer' && c.weekend) day = d; }
    expect(day).toBeGreaterThanOrEqual(0);
    const rng = rngFork(5, 'e22');
    const ev = drawDayEvents(sim, dayContext(sim, day), rng).filter((e) => e.kind === 'children' && humanSites(sim.world).list[e.siteId].kind === 'playground');
    expect(ev.length).toBe(3);
    for (const e of ev) { expect(e.hour).toBeGreaterThanOrEqual(10); expect(e.hour).toBeLessThanOrEqual(17); }
  });

  it('E23: footsteps passes on gentle are 0.5 x Naturalist within 15 % over 30 GD', () => {
    const count = (preset: DifficultyId) => {
      const sim = simFor('kitchen-door', preset);
      const rng = rngFork(9, 'e23');
      let n = 0;
      for (let d = 0; d < 30; d++) n += drawDayEvents(sim, dayContext(sim, d), rng).filter((e) => e.kind === 'footsteps').length;
      return n;
    };
    const g = count('gentle'), n = count('naturalist');
    expect(g / n).toBeGreaterThan(0.5 * 0.85);
    expect(g / n).toBeLessThan(0.5 * 1.15);
  });

  it('E24: humanActivity off: no human.start in 5 GD and empty schedules', () => {
    const sim = simFor('kitchen-door', 'naturalist', 'off');
    let starts = 0;
    sim.events.on('human.start', () => { starts++; });
    for (let i = 0; i < 5 * 6000; i++) sim.tick();
    expect(starts).toBe(0);
    expect(sim.state.env.human.scheduled.length).toBe(0);
    expect(sim.state.env.human.active.length).toBe(0);
  });
});
