// AC3 and GDD 04 App. E 12: every event's cues precede each of its impacts by at least the stated lead (x the
// difficulty's telegraph multiplier); `human.telegraph` reaches a worker 1 m from a pass >= 3.0 s (gentle 4.5 s)
// before the first footfall within 2 m; an ant using only cue data escapes a pass that kills stationary ants.

import { describe, expect, it } from 'vitest';
import { rngFork, rngRange } from '@/core/rng';
import type { DifficultyId, HumanCue, HumanEventKind, HumanVariant, Sim, WorldData } from '@/sim/types';
import { HUMAN_CUES, WIPE_CUES } from '@/sim/balance/human';
import { HUMAN_CUE_FEEL_MULT } from '@/sim/balance/foraging';
import { humanPlan } from './plans';
import { humanSites } from './sites';
import { TICKS_PER_SECOND } from '@/sim/time';
import { alive, humanSim, patioWorld, placeWorker, runToEnd, scheduleNow } from './testkit';

/** Ant walk speed, BU/s (docs/01-design-seed.md §3). */
const WALK_BU_S = 12;

interface Seen { firstSeen: Map<string, number>; impacts: { tick: number; kind: HumanEventKind }[] }

/** Runs one event, recording when each (cue, impact tick) first appeared in state and every impact tick. */
function record(sim: Sim, kind: HumanEventKind, variant: HumanVariant | null, regionId: number, at: { x: number; y: number; z: number } | null): Seen {
  const seen: Seen = { firstSeen: new Map(), impacts: [] };
  sim.events.on('human.impact', (e) => { seen.impacts.push({ tick: sim.state.tick - 1, kind: e.kind }); });
  const inst = scheduleNow(sim, kind, variant, regionId, at);
  for (let i = 0; i < 4000; i++) {
    sim.tick();
    for (const r of sim.state.env.human.active) {
      for (const c of r.cues) {
        const k = `${c.kind}:${c.impactTick}`;
        if (!seen.firstSeen.has(k)) seen.firstSeen.set(k, sim.state.tick - 1);
      }
    }
    if (inst.cancelled) break;
    if (i > 5 && !sim.state.env.human.active.some((r) => r.instId === inst.id) && !sim.state.env.human.scheduled.includes(inst)) break;
  }
  expect(inst.cancelled, `${kind} cancelled`).toBe(false);
  return seen;
}

function checkLeads(sim: Sim, kind: HumanEventKind, seen: Seen, mult: number, wipe = false): void {
  const specs = wipe ? WIPE_CUES : HUMAN_CUES[kind];
  const ticks = [...new Set(seen.impacts.filter((i) => i.kind === kind).map((i) => i.tick))].sort((a, b) => a - b);
  expect(ticks.length, `${kind} impacts`).toBeGreaterThan(0);
  for (const spec of specs) {
    const lead = Math.round(spec.lead * mult * 10);
    const list = spec.each ? ticks : ticks.slice(0, 1);
    for (const t of list) {
      const first = seen.firstSeen.get(`${spec.cue}:${t}`);
      expect(first, `${kind} ${spec.cue} cue for impact ${t}`).toBeDefined();
      expect(t - first!, `${kind} ${spec.cue} lead`).toBeGreaterThanOrEqual(lead);
    }
  }
  void sim;
}

function worldFor(kind: HumanEventKind): WorldData {
  if (kind === 'mowing') return patioWorld({ zone: 'lawn', variant: 'mown', surface: 'loam', sizeMm: 3000 });
  if (kind === 'children') return patioWorld({ zone: 'sand', variant: 'sand-pit', surface: 'sand', sizeMm: 5000 });
  if (kind === 'car') return patioWorld({ zone: 'asphalt', variant: 'car-park', surface: 'asphalt', sizeMm: 16000 });
  return patioWorld({ surface: 'concrete', sizeMm: 5000 });
}

describe('telegraph (AC3, GDD 04 §15.3)', () => {
  const kinds: [HumanEventKind, HumanVariant | null, string, boolean][] = [
    ['footsteps', 'adult', 'patio-lane', false], ['sweeping', 'broom', 'patio', false], ['food-drop', 'crumb-fall', 'patio', true],
    ['spill', 'sugary', 'patio', false], ['children', 'play-session', 'playground', false], ['mowing', 'motor', 'lawn-mown', false],
    ['car', 'arrive', 'car-park', false], ['watering', 'sprinkler', '', true], ['bait-station', 'station', '', true],
  ];
  it.each(['naturalist', 'gentle', 'harsh'] as DifficultyId[])('every cue precedes each impact by its lead on %s', (preset) => {
    const mult = preset === 'gentle' ? 1.5 : preset === 'harsh' ? 0.75 : 1;
    for (const [kind, variant, siteKind, needsAt] of kinds) {
      const sim = humanSim(worldFor(kind), preset);
      const site = humanSites(sim.world).list.find((s) => s.kind === siteKind);
      if (siteKind) expect(site, `${kind} site ${siteKind}`).toBeDefined();
      const c = sim.world.size / 2;
      const seen = record(sim, kind, variant, site?.id ?? -1, needsAt ? { x: c, y: 0, z: c } : null);
      checkLeads(sim, kind, seen, mult);
    }
  });

  it.each([['naturalist', 30], ['gentle', 45]] as const)('E12: tremor reaches a worker 1 m from the pass >= %s lead (%i ticks)', (preset, minLead) => {
    const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 6000 }), preset);
    const lane = humanSites(sim.world).list.find((s) => s.kind === 'patio-lane')!;
    const inst = scheduleNow(sim, 'footsteps', 'adult', lane.id, null);
    // the pass's own footfalls: a worker 1 m to the side of the middle one
    const plan = humanPlan(sim, inst)!;
    const mid = plan.impacts[Math.floor(plan.impacts.length / 2)].fp;
    const wx = mid.x - Math.sin(mid.yaw) * 1000, wz = mid.z + Math.cos(mid.yaw) * 1000;
    const id = placeWorker(sim, wx, wz);
    expect(id).toBeGreaterThanOrEqual(0);
    const tremors: { tick: number; e: { origin: { x: number; z: number }; radiusMm: number } }[] = [];
    const steps: { tick: number; x: number; z: number }[] = [];
    sim.events.on('human.telegraph', (e) => { if (e.cue === 'tremor') tremors.push({ tick: sim.state.tick - 1, e }); });
    sim.events.on('human.impact', (e) => steps.push({ tick: sim.state.tick - 1, x: e.footprint.x, z: e.footprint.z }));
    const stateCue: number[] = [];
    for (let i = 0; i < 1000; i++) {
      sim.tick();
      const covered = sim.state.env.human.active.some((r) => r.cues.some((c: HumanCue) => c.kind === 'tremor' && Math.hypot(c.origin.x - wx, c.origin.z - wz) <= c.radiusMm));
      if (covered) stateCue.push(sim.state.tick - 1);
      if (sim.state.env.human.active.length === 0 && i > 50) break;
    }
    const near = steps.find((s) => Math.hypot(s.x - wx, s.z - wz) <= 2000);
    expect(near).toBeDefined();
    const ev = tremors.find((t) => Math.hypot(t.e.origin.x - wx, t.e.origin.z - wz) <= t.e.radiusMm);
    expect(ev).toBeDefined();
    expect(near!.tick - ev!.tick).toBeGreaterThanOrEqual(minLead);
    expect(near!.tick - stateCue[0]).toBeGreaterThanOrEqual(minLead);
  });

  it('an ant using only cue data avoids a pass that kills stationary ants (scripted)', () => {
    const outcome = (avoid: boolean): number => {
      const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 6000 }));
      const lane = humanSites(sim.world).list.find((s) => s.kind === 'patio-lane')!;
      const inst = scheduleNow(sim, 'footsteps', 'adult', lane.id, null);
      const plan = humanPlan(sim, inst)!;
      const rng = rngFork(4, 'avoid');
      const ids: number[] = [];
      // 60 workers in the band the soles land in, along the middle of the pass
      const steps = plan.impacts.slice(Math.floor(plan.impacts.length * 0.25), Math.floor(plan.impacts.length * 0.75));
      while (ids.length < 60) {
        const s = steps[Math.floor(rngRange(rng, 0, steps.length))].fp;
        const lat = rngRange(rng, -170, 170), along = rngRange(rng, -350, 350);
        const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
        const id = placeWorker(sim, s.x + c * along - sn * lat, s.z + sn * along + c * lat);
        if (id >= 0) ids.push(id);
      }
      const fleeUntil = new Map<number, { until: number; dx: number; dz: number }>();
      // the design seed's walk speed (12 BU/s), no faster
      const walkPerTick = (WALK_BU_S * sim.world.bu) / TICKS_PER_SECOND;
      for (let i = 0; i < 1500; i++) {
        if (avoid) {
          const now = sim.state.tick;
          for (const id of ids) {
            const a = sim.stores.ants.get(id);
            if (!a?.alive) continue;
            let f = fleeUntil.get(id);
            if (!f || now >= f.until) {
              // cue data only: a tremor or shadow felt here, and the way the pass comes (earlier spot -> later spot)
              for (const r of sim.state.env.human.active) {
                const felt = r.cues.find((c) => (c.kind === 'tremor' || c.kind === 'shadow') && now >= c.startTick && now <= c.impactTick
                  && Math.hypot(a.pos.x - c.origin.x, a.pos.z - c.origin.z) <= c.radiusMm * HUMAN_CUE_FEEL_MULT);
                if (!felt) continue;
                const sorted = [...r.cues].sort((p, q) => p.impactTick - q.impactTick);
                const p0 = sorted[0].origin, p1 = sorted[sorted.length - 1].origin;
                let dx = p1.x - p0.x, dz = p1.z - p0.z;
                const l = Math.hypot(dx, dz);
                if (l < 1) continue; // one spot only: the way it comes is not known yet
                dx /= l; dz /= l;
                const px = -dz, pz = dx;
                // away from the line the pass follows
                const side = (a.pos.x - p0.x) * px + (a.pos.z - p0.z) * pz >= 0 ? 1 : -1;
                f = { until: now + 40, dx: px * side, dz: pz * side };
                fleeUntil.set(id, f);
                break;
              }
            }
            if (f && now < f.until) { a.pos.x += f.dx * walkPerTick; a.pos.z += f.dz * walkPerTick; }
          }
          sim.index.refresh();
        }
        sim.tick();
        if (i > 50 && sim.state.env.human.active.length === 0) break;
      }
      return ids.length - alive(sim, ids);
    };
    const control = outcome(false), avoided = outcome(true);
    expect(control).toBeGreaterThanOrEqual(5);
    expect(avoided).toBeLessThanOrEqual(1);
  });
});
