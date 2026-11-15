// Antlion and its pit (GDD 05 §2.2b, §2.4). The pit is a hazard record (state.ecology.hazards, kind 'antlion-pit')
// with the antlion buried at its centre: wait -> flick (an ant on the slope, every 0.8 s, p 0.6, 1.5 L downslope)
// -> grab (within 0.8 L of the centre) -> drag (1.5/s; struggle, nestmates within 1 L pull) -> feed 120 s ->
// rebuild 300 s. Dormant at <= 10 C and in winter; rain collapses the pit (rebuilt 0.3 gd after the rain).
// Upslope speed x0.4 inside the pit is a locomotion speed factor (hooks.ts). Nestmates that witness a flick or a
// grab learn the pit (hazard.knownBy, colony slot bits) for the ant side's avoidance (knownHazardsNear).

import type { Ant, Creature, Hazard, Sim } from '@/sim/types';
import { colonySlotBit } from '@/sim/entities';
import {
  ANTLION_DORMANT_C, ANTLION_FLICK_EVERY_S, ANTLION_FLICK_L, ANTLION_FLICK_P, ANTLION_GRAB_L, ANTLION_HELP_L,
  ANTLION_RAIN_REBUILD_GD, ANTLION_REBUILD_S, FEED_S, VENOM_PER_S, WITNESS_L,
} from '@/sim/balance/creatures';
import { SECONDS_PER_DAY } from '@/sim/time';
import { CreatureFlag, antLen, chance, cue, dist2D, setState, ticks, timerDone } from './common';
import type { Conditions } from './conditions';
import { holdTick, isSeized, releaseAnt, seizeAnt } from './attack';
import { canPrey } from './predator';
import { queueDisplacement } from './hooks';
import type { KindBehaviour } from './kinds';

export function pitOf(sim: Sim, c: Creature): Hazard | undefined {
  const id = c.bb.pit ?? -1;
  return sim.state.ecology.hazards.find((h) => h.id === id);
}

const _ids: number[] = [];

/** Surface ants on the pit (horizontal distance within its radius), ascending ids. */
function antsInPit(sim: Sim, pit: Hazard, out: Ant[]): Ant[] {
  out.length = 0;
  sim.index.queryAnts(pit.pos, pit.radius + 2 * sim.world.bu, _ids);
  _ids.sort((a, b) => a - b);
  for (const id of _ids) {
    const a = sim.stores.ants.get(id);
    if (a && a.alive && a.nestId < 0 && a.medium === 'surface' && dist2D(a.pos, pit.pos) <= pit.radius) out.push(a);
  }
  return out;
}

/** Colonies with an ant within 6 L of p (other than `except`) learn the pit. */
function witness(sim: Sim, pit: Hazard, p: Ant['pos'], except: number): void {
  sim.index.queryAnts(p, WITNESS_L * 4 * sim.world.bu, _ids);
  for (const id of _ids) {
    if (id === except) continue;
    const a = sim.stores.ants.get(id);
    if (a && dist2D(a.pos, p) <= WITNESS_L * antLen(sim, a)) pit.knownBy |= colonySlotBit(sim, a.colony);
  }
}

function setPit(pit: Hazard | undefined, state: string): void {
  if (pit) pit.state = state;
}

const _in: Ant[] = [];

function waitTick(sim: Sim, c: Creature, pit: Hazard): void {
  const ants = antsInPit(sim, pit, _in);
  const flickNow = (sim.state.tick - c.stateTick) % ticks(ANTLION_FLICK_EVERY_S) === 0;
  for (const a of ants) {
    if (isSeized(a) || !canPrey(sim, c, a)) continue;
    const L = antLen(sim, a);
    const d = dist2D(a.pos, pit.pos);
    if (d <= ANTLION_GRAB_L * L) {
      seizeAnt(sim, c, a);
      sim.emit({ type: 'antlion-grab', hazardId: pit.id, antId: a.id });
      witness(sim, pit, pit.pos, a.id);
      setState(sim, c, 'drag');
      setPit(pit, 'drag');
      return;
    }
    if (flickNow && chance(sim, ANTLION_FLICK_P)) {
      const step = Math.min(ANTLION_FLICK_L * L, d);
      const k = step / Math.max(d, 1e-6);
      const ground = { x: a.pos.x - a.up.x * a.footOffset, y: a.pos.y - a.up.y * a.footOffset, z: a.pos.z - a.up.z * a.footOffset };
      queueDisplacement(sim, a.id, { x: ground.x + (pit.pos.x - a.pos.x) * k, y: ground.y, z: ground.z + (pit.pos.z - a.pos.z) * k });
      sim.emit({ type: 'antlion-flick', hazardId: pit.id, antId: a.id });
      cue(sim, 'antlion-flick', pit.pos, 0.7);
      c.bb[`fl.${a.id}`] = sim.state.tick;
      witness(sim, pit, a.pos, a.id);
    }
  }
  // a flicked ant that got out knows the pit now
  for (const k of Object.keys(c.bb)) {
    if (!k.startsWith('fl.')) continue;
    const a = sim.stores.ants.get(Number(k.slice(3)));
    if (!a) { delete c.bb[k]; continue; }
    if (dist2D(a.pos, pit.pos) > pit.radius) { pit.knownBy |= colonySlotBit(sim, a.colony); delete c.bb[k]; }
  }
}

/** Nestmates of the grabbed ant within 1 L pulling it out (+0.10/s each). */
function pullers(sim: Sim, c: Creature): number {
  const v = sim.stores.ants.get(c.seizedAntId);
  if (!v) return 0;
  const r = ANTLION_HELP_L * antLen(sim, v);
  sim.index.queryAnts(v.pos, r + c.radius, _ids);
  let n = 0;
  for (const id of _ids) {
    const a = sim.stores.ants.get(id);
    if (a && a.id !== v.id && a.colony === v.colony && !isSeized(a) && dist2D(a.pos, v.pos) <= r) n++;
  }
  return n;
}

export const antlion: KindBehaviour = {
  update(sim, c, cond: Conditions) {
    const pit = pitOf(sim, c);
    if (!pit) return;
    if (cond.raining && c.state !== 'collapsed') {
      if (c.seizedAntId >= 0) releaseAnt(sim, c, false);
      setState(sim, c, 'collapsed');
      setPit(pit, 'collapsed');
    }
    const dormant = cond.winter || cond.airC <= ANTLION_DORMANT_C;
    if (dormant) c.flags |= CreatureFlag.DORMANT; else c.flags &= ~CreatureFlag.DORMANT;
    switch (c.state) {
      case 'collapsed':
        if (cond.raining) { c.stateTimer = ticks(ANTLION_RAIN_REBUILD_GD * SECONDS_PER_DAY); return; }
        if (timerDone(c)) { setState(sim, c, 'wait'); setPit(pit, 'wait'); }
        return;
      case 'drag': {
        const r = holdTick(sim, c, VENOM_PER_S.antlion ?? 1.5, 'antlion', pullers(sim, c));
        if (r === 'dead') { c.eaten++; setState(sim, c, 'feed', FEED_S.antlion ?? 120); setPit(pit, 'feed'); }
        else if (r === 'freed') { setState(sim, c, 'wait'); setPit(pit, 'wait'); }
        return;
      }
      case 'feed':
        if (timerDone(c)) { setState(sim, c, 'rebuild', ANTLION_REBUILD_S); setPit(pit, 'rebuild'); }
        return;
      case 'rebuild':
        if (timerDone(c)) { setState(sim, c, 'wait'); setPit(pit, 'wait'); }
        return;
      default: // wait
        if (c.state !== 'wait') { setState(sim, c, 'wait'); setPit(pit, 'wait'); }
        if (!dormant) waitTick(sim, c, pit);
    }
  },
};

/** Creates the pit hazard for an antlion territory (radius mm) and returns it. */
export function createPit(sim: Sim, pos: Hazard['pos'], radiusMm: number, depthMm: number): Hazard {
  const h: Hazard = { id: sim.state.nextId++, kind: 'antlion-pit', pos: { ...pos }, radius: radiusMm, depth: depthMm, state: 'wait', knownBy: 0 };
  sim.state.ecology.hazards.push(h);
  return h;
}
