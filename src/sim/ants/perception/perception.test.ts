// Perception (GDD 02 §7): what an ant can and cannot know. Ranges of contact, antennal chemoreception and smell,
// markers and danger cues, the nearest entrance, and the staggered cadence.

import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { ALARM_ALERT } from '@/sim/balance';
import { CONTACT_DIST_BU, PERCEPTION_EVERY } from '@/sim/balance/foraging';
import { odourRadiusMm } from '@/sim/ecology';
import { placeOnSurface } from '@/sim/locomotion';
import { makeTestSim } from '@/sim/testing';
import {
  avoidMarkerNear, exploredCount, forageMarkerHere, isExplored, markExplored, nearestEntranceId, nestmatesMet,
  perceiveNow, perceptionSystem, smelledSource, THREAT, threatCode, touchedSource, trailHere,
} from './index';

function world(): { sim: Sim; ant: Ant; other: Ant } {
  const sim = makeTestSim({ sizeBu: 200, nest: 'small', workers: 2, systems: [] });
  const [ant, other] = sim.state.ants.filter((a) => a.caste === 'worker');
  const p = { x: 60 * sim.world.bu, y: 0, z: 60 * sim.world.bu };
  placeOnSurface(sim, ant, p);
  ant.fwd = { x: 1, y: 0, z: 0 };
  ant.nestId = -1;
  ant.chamberId = -1;
  return { sim, ant, other };
}

function spawnFood(sim: Sim, x: number, z: number, variant: 'sugar-granules' | 'insect-medium' = 'sugar-granules'): number {
  const before = sim.state.sources.length;
  sim.enqueue({ type: 'cheat.spawnFood', kind: variant === 'sugar-granules' ? 'sugar' : 'carrion', variant, pos: { x, y: 0, z }, units: 50, stage: null });
  sim.applyPendingCommands();
  sim.index.refresh();
  return sim.state.sources[before].id;
}

describe('perception', () => {
  it('smells food only inside its odour radius, touches it only at contact distance', () => {
    const { sim, ant } = world();
    const bu = sim.world.bu;
    const id = spawnFood(sim, ant.pos.x + 30 * bu, ant.pos.z);
    const r = odourRadiusMm(sim.stores.sources.get(id)!, bu);
    perceiveNow(sim, ant);
    expect(smelledSource(ant)).toBe(-1);
    placeOnSurface(sim, ant, { x: ant.pos.x + 30 * bu - r + bu, y: 0, z: ant.pos.z });
    sim.index.refresh();
    perceiveNow(sim, ant);
    expect(smelledSource(ant)).toBe(id);
    expect(touchedSource(ant)).toBe(-1);
    const s = sim.stores.sources.get(id)!;
    placeOnSurface(sim, ant, { x: s.pos.x - 4.5 * bu, y: 0, z: s.pos.z });
    sim.index.refresh();
    perceiveNow(sim, ant);
    expect(touchedSource(ant)).toBe(id);
  });

  it('meets a nestmate only within CONTACT_DIST and in the front cone', () => {
    const { sim, ant, other } = world();
    const bu = sim.world.bu;
    other.nestId = -1;
    placeOnSurface(sim, other, { x: ant.pos.x + 0.9 * CONTACT_DIST_BU * bu, y: 0, z: ant.pos.z });
    sim.index.refresh();
    perceiveNow(sim, ant);
    expect(nestmatesMet(ant)).toBe(1);
    placeOnSurface(sim, other, { x: ant.pos.x - 0.9 * CONTACT_DIST_BU * bu, y: 0, z: ant.pos.z }); // behind
    sim.index.refresh();
    perceiveNow(sim, ant);
    expect(nestmatesMet(ant)).toBe(0);
    placeOnSurface(sim, other, { x: ant.pos.x + 2 * CONTACT_DIST_BU * bu, y: 0, z: ant.pos.z }); // too far
    sim.index.refresh();
    perceiveNow(sim, ant);
    expect(nestmatesMet(ant)).toBe(0);
  });

  it('reads trail under its antennae, not trail a few BU to the side', () => {
    const { sim, ant } = world();
    const bu = sim.world.bu;
    sim.phero.deposit(ant.colony, 'trail', { x: ant.pos.x + 40 * bu, y: ant.pos.y, z: ant.pos.z }, 5);
    perceiveNow(sim, ant);
    expect(trailHere(ant)).toBe(0);
    sim.phero.deposit(ant.colony, 'trail', { x: ant.pos.x + 1.2 * bu, y: ant.pos.y, z: ant.pos.z }, 5);
    perceiveNow(sim, ant);
    expect(trailHere(ant)).toBeGreaterThan(0.3);
  });

  it('notices own forage and avoid markers, alarm as a threat, and the nearest entrance', () => {
    const { sim, ant } = world();
    const bu = sim.world.bu;
    const col = sim.state.colonies[0];
    const mk = (kind: 'forage' | 'avoid', dx: number, radius: number) => {
      sim.state.markers.push({
        id: sim.state.nextId++, alive: true, kind, pos: { x: ant.pos.x + dx * bu, y: 0, z: ant.pos.z }, radius: radius * bu,
        colony: col.id, targetChamberId: -1, sourceChamberId: -1, expiresTick: -1,
        params: { mode: null, priority: null, chamberType: null, planId: -1 }, placedTick: 0,
      });
      sim.stores.markers.rebuild();
      return sim.state.markers[sim.state.markers.length - 1].id;
    };
    const f = mk('forage', 5, 20);
    const a = mk('avoid', 40, 30);
    perceiveNow(sim, ant);
    expect(forageMarkerHere(ant)).toBe(f);
    expect(avoidMarkerNear(ant)).toBe(-1);
    placeOnSurface(sim, ant, { x: ant.pos.x + 5 * bu, y: 0, z: ant.pos.z });
    perceiveNow(sim, ant);
    expect(avoidMarkerNear(ant)).toBe(a);
    expect(threatCode(ant)).toBe(THREAT.none);
    sim.phero.deposit(ant.colony, 'alarm', ant.pos, ALARM_ALERT * 4);
    perceiveNow(sim, ant);
    expect(threatCode(ant)).toBe(THREAT.alarm);
    expect(nearestEntranceId(ant)).toBe(sim.stores.nests.get(col.nestIds[0])!.entrances[0].id);
  });

  it('feels a looming human event (tremor / shadow cue) before impact', () => {
    const { sim, ant } = world();
    sim.state.env.human.active.push({
      instId: 1, progressS: 0, nextImpactTick: sim.state.tick + 30,
      cues: [{ kind: 'shadow', origin: { x: ant.pos.x + 20, y: 0, z: ant.pos.z }, radiusMm: 60, intensity: 1, startTick: 0, impactTick: sim.state.tick + 30 }],
    });
    perceiveNow(sim, ant);
    expect(threatCode(ant)).toBe(THREAT.human);
  });

  it('runs staggered: each ant is perceived once every PERCEPTION_EVERY ticks', () => {
    const { sim, ant } = world();
    let n = 0;
    for (let t = 0; t < PERCEPTION_EVERY * 4; t++) {
      const before = ant.bb['pc.t'] ?? -1;
      perceptionSystem.run(sim);
      if ((ant.bb['pc.t'] ?? -1) !== before) n++;
      sim.state.tick++;
    }
    expect(n).toBe(4);
  });

  it('keeps the colony explored bitmap', () => {
    const { sim } = world();
    const col = sim.state.colonies[0];
    expect(isExplored(sim, col, 100, 100)).toBe(false);
    markExplored(sim, col, 100, 100);
    expect(isExplored(sim, col, 100, 100)).toBe(true);
    expect(exploredCount(col)).toBe(1);
  });
});
