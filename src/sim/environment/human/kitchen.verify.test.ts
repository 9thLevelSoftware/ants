// Reviewer tests (human-events verify pass) on one generated kitchen-door map: the interior broom only on days
// without the vacuum, `humanActivity: off` silencing the reactive events too, and the vacuum / wipe telegraph leads
// (not covered by telegraph.test.ts). Failing tests demonstrate defects against GDD 04 §15 and stay for the fixer.

import { beforeAll, describe, expect, it } from 'vitest';
import { rngFork } from '@/core/rng';
import type { HumanEventKind, Sim } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { DIFFICULTY_PARAMS } from '@/sim/balance';
import { COUNTER_TRAIL_MIN, HUMAN_CUES, WIPE_CUES, type HumanCueSpec } from '@/sim/balance/human';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { humanEventsSystem } from './index';
import { humanExtra } from './extra';
import { dayContext, drawDayEvents } from './schedule';
import { humanSites } from './sites';
import { scheduleNow } from './testkit';

let shared: Sim | null = null;
function kitchen(): Sim {
  if (!shared) {
    const cfg = defaultGameConfig('lasius-niger', 7);
    cfg.cheats = true;
    cfg.world = { ...cfg.world, archetype: 'kitchen-door' };
    const g = createNewGame(cfg);
    shared = createSim(g.state, g.world, { systems: [humanEventsSystem] });
    const q = shared.stores.ants.get(shared.state.colonies[0].queenId);
    if (q) { q.pos = { x: 1, y: -1000, z: 1 }; q.nestId = 1; }
  }
  const sim = shared;
  sim.state.config.difficulty.preset = 'naturalist';
  sim.state.config.difficulty.params = { ...DIFFICULTY_PARAMS.naturalist };
  sim.state.config.difficulty.custom = {};
  sim.state.config.rules.humanActivity = 'normal';
  return sim;
}

/** First tick each (cue kind, impact tick) appeared in state, and the impact ticks, for one cheat-scheduled run. */
function leads(sim: Sim, kind: HumanEventKind, variant: string | null, siteId: number): { first: Map<string, number>; impacts: number[] } {
  const first = new Map<string, number>(), impacts: number[] = [];
  const off = sim.events.on('human.impact', (e) => { if (e.kind === kind) impacts.push(sim.state.tick - 1); });
  const inst = scheduleNow(sim, kind, variant as never, siteId, null);
  for (let i = 0; i < 3000; i++) {
    sim.tick();
    for (const r of sim.state.env.human.active) {
      if (r.instId !== inst.id) continue;
      for (const c of r.cues) { const k = `${c.kind}:${c.impactTick}`; if (!first.has(k)) first.set(k, sim.state.tick - 1); }
    }
    if (i > 5 && !sim.state.env.human.active.some((r) => r.instId === inst.id)) break;
  }
  if (typeof off === 'function') off();
  expect(inst.cancelled, `${kind} cancelled`).toBe(false);
  return { first, impacts: [...new Set(impacts)].sort((a, b) => a - b) };
}

function checkLeads(specs: readonly HumanCueSpec[], seen: { first: Map<string, number>; impacts: number[] }, label: string): void {
  expect(seen.impacts.length, `${label} impacts`).toBeGreaterThan(0);
  for (const spec of specs) {
    const lead = Math.round(spec.lead * TICKS_PER_SECOND);
    for (const t of spec.each ? seen.impacts.slice(0, 40) : seen.impacts.slice(0, 1)) {
      const f = seen.first.get(`${spec.cue}:${t}`);
      expect(f, `${label} ${spec.cue} cue for impact ${t}`).toBeDefined();
      expect(t - f!, `${label} ${spec.cue} lead`).toBeGreaterThanOrEqual(lead);
    }
  }
}

describe('kitchen: reviewer checks', () => {
  beforeAll(() => { kitchen(); }, 180_000);

  // GDD 04 §15.2 sweeping row: "interior broom 1 on non-vacuum days". The vacuum row comes after the broom row in
  // HUMAN_SCHEDULE, so drawDayEvents' vacuumDay flag is still false when the broom is drawn.
  it('the interior broom is never drawn on a day that also has a vacuum', () => {
    const sim = kitchen();
    const sites = humanSites(sim.world).list;
    const rng = rngFork(21, 'verify.broom');
    let vacuumDays = 0, both = 0;
    for (let d = 0; d < 84; d++) {
      const ev = drawDayEvents(sim, dayContext(sim, d), rng);
      const vac = ev.some((e) => e.kind === 'vacuum');
      const broom = ev.some((e) => e.kind === 'sweeping' && e.variant === 'broom' && sites[e.siteId].kind === 'interior-floor');
      if (vac) vacuumDays++;
      if (vac && broom) both++;
    }
    expect(vacuumDays).toBeGreaterThan(5);
    expect(both, `${both} of ${vacuumDays} vacuum days also had the interior broom`).toBe(0);
  });

  // GDD 04 App. E 24: with humanActivity off no `human.start` at all. The reactive rules (extra wipe, bait) ignore it.
  it('humanActivity off: a worktop trail held 0.55 GD starts no extra wipe and schedules no bait', () => {
    const sim = kitchen();
    sim.state.config.rules.humanActivity = 'off';
    sim.state.config.difficulty.custom = { humanActivity: 'off' };
    const col = sim.state.colonies[0].id;
    const counter = humanSites(sim.world).list.find((s) => s.kind === 'counter')!;
    const r = counter.rects[0];
    const p = { x: r.x0 + 50, y: r.y + sim.world.bu * 0.5, z: r.z0 + 50 };
    let starts = 0;
    sim.events.on('human.start', () => { starts++; });
    for (let i = 0; i < 0.55 * TICKS_PER_DAY; i++) {
      if (sim.phero.sample(col, 'trail', p) < COUNTER_TRAIL_MIN * 4) sim.phero.deposit(col, 'trail', p, 5);
      sim.tick();
    }
    // extra wipe at 0.25 GD (+0.25 h) and a bait station due at 18:00 after 0.5 GD
    expect({ starts, baitDue: humanExtra(sim).baitDueTick >= 0 }).toEqual({ starts: 0, baitDue: false });
  });

  it('vacuum cues precede each nozzle impact by their lead (sound 6 s once, tremor 2 s, airflow 0.3 s, shadow 0.5 s)', () => {
    const sim = kitchen();
    sim.state.config.difficulty.params.humanFreqMult = 0;
    const floor = humanSites(sim.world).list.find((s) => s.kind === 'interior-floor')!;
    checkLeads(HUMAN_CUES.vacuum, leads(sim, 'vacuum', null, floor.id), 'vacuum');
  });

  it('wipe cues precede each cloth impact by their lead (shadow 0.5 s, tremor 0.5 s)', () => {
    const sim = kitchen();
    sim.state.config.difficulty.params.humanFreqMult = 0;
    const counter = humanSites(sim.world).list.find((s) => s.kind === 'counter')!;
    checkLeads(WIPE_CUES, leads(sim, 'sweeping', 'wipe', counter.id), 'wipe');
  });
});
