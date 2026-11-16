// Telegraph cues (GDD 04 §15.3): each run keeps, in state, the cues an ant could sense now — per impact (tremor,
// shadow, airflow, spray, sound with the kind's lead before that impact) and once before the first impact (the
// mower's or vacuum's engine). Perception (src/sim/ants/perception/sense.ts) and the camera tremor relay
// (src/game/views/tremorCue.ts) read `run.cues`; a cue stays listed HUMAN_CUE_TAIL_S after its impact so a frame
// drawn a few ticks later still sees it. `human.telegraph` events (audio, HUD, alerts) are throttled per cue kind.

import type { HumanCue, HumanEventInst, HumanEventRun, Sim } from '@/sim/types';
import {
  HUMAN_CUE_TAIL_S, HUMAN_FRONT_SPEED, HUMAN_SHADOW_MARGIN, HUMAN_TELEGRAPH_EVENT_GAP_S, TREMOR_TRANSMISSION, type HumanCueSpec,
} from '@/sim/balance/human';
import { TICKS_PER_SECOND } from '@/sim/time';
import { surfaceClass, surfaceY } from './ground';
import { footprintRadius, type HumanPlan, type Impact } from './plan';
import { cueLeadTicks, firstImpactAtOrAfter, isQuietImpact } from './plans';

const TAIL = Math.round(HUMAN_CUE_TAIL_S * TICKS_PER_SECOND);
const GAP = Math.round(HUMAN_TELEGRAPH_EVENT_GAP_S * TICKS_PER_SECOND);

/**
 * Substrate transmission of each impact's tremor, read from the live surface the first time the impact's tremor is
 * listed (a few seconds before it lands, after any mowing that changed the sward) and kept for the plan's life.
 */
const transCache = new WeakMap<HumanPlan, Float32Array>();
const at: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
function transOf(sim: Sim, plan: HumanPlan, i: number): number {
  let c = transCache.get(plan);
  if (!c) { c = new Float32Array(plan.impacts.length).fill(NaN); transCache.set(plan, c); }
  if (Number.isNaN(c[i])) {
    const imp = plan.impacts[i];
    at.x = imp.fp.x; at.z = imp.fp.z; at.y = surfaceY(sim, imp.fp.x, imp.fp.z);
    c[i] = TREMOR_TRANSMISSION[surfaceClass(sim, at)];
  }
  return c[i];
}

function cueOf(sim: Sim, inst: HumanEventInst, spec: HumanCueSpec, plan: HumanPlan, i: number, startTick: number): HumanCue {
  const imp = plan.impacts[i];
  let radius: number, intensity = spec.intensity;
  if (spec.radius === 'fp') radius = footprintRadius(imp.fp) * HUMAN_SHADOW_MARGIN;
  else if (spec.radius === 'world') radius = sim.world.size * 1.5;
  else radius = spec.radius;
  if (spec.cue === 'tremor') { const t = transOf(sim, plan, i); radius *= t; intensity *= t; }
  return {
    kind: spec.cue, origin: { x: imp.fp.x, y: imp.fp.y, z: imp.fp.z }, radiusMm: radius, intensity,
    startTick, impactTick: inst.startTick + imp.t,
  };
}

/**
 * Rebuilds `run.cues` for the current tick; emits throttled `human.telegraph` events for cues that just began. Only
 * impacts inside the longest per-impact lead are visited (the once-only engine sound looks at the first impact).
 */
export function refreshCues(sim: Sim, run: HumanEventRun, inst: HumanEventInst, plan: HumanPlan): void {
  const now = sim.state.tick, t = now - inst.startTick;
  let eachLead = 0;
  for (const s of plan.cues) if (s.each) eachLead = Math.max(eachLead, cueLeadTicks(sim, s));
  const cues: HumanCue[] = [];
  if (plan.impacts.length > 0 && t <= plan.impacts[0].t + TAIL) {
    for (const s of plan.cues) if (!s.each) cues.push(cueOf(sim, inst, s, plan, 0, inst.startTick + plan.impacts[0].t - cueLeadTicks(sim, s)));
  }
  for (let i = firstImpactAtOrAfter(plan, t - TAIL); i < plan.impacts.length; i++) {
    const imp = plan.impacts[i];
    if (imp.t > t + eachLead) break;
    if (isQuietImpact(plan, imp)) continue;
    for (const s of plan.cues) {
      if (!s.each) continue;
      const start = inst.startTick + imp.t - cueLeadTicks(sim, s);
      if (start <= now) cues.push(cueOf(sim, inst, s, plan, i, start));
    }
  }
  run.cues = cues;
  const next = plan.impacts[firstImpactAtOrAfter(plan, t + 1)];
  run.nextImpactTick = next ? inst.startTick + next.t : -1;
  emitTelegraphs(sim, run, inst, cues);
}

function emitTelegraphs(sim: Sim, run: HumanEventRun, inst: HumanEventInst, cues: readonly HumanCue[]): void {
  const now = sim.state.tick;
  const last = (run.telegraphTicks ??= {});
  const fresh = Object.keys(last).length === 0;
  for (const c of cues) {
    if (c.startTick !== now && !(fresh && c.startTick <= now)) continue;
    const prev = last[c.kind];
    if (prev !== undefined && now - prev < GAP) continue;
    last[c.kind] = now;
    const widen = HUMAN_FRONT_SPEED[inst.kind] * HUMAN_TELEGRAPH_EVENT_GAP_S;
    sim.emit({
      type: 'human.telegraph', instId: inst.id, kind: inst.kind, cue: c.kind, origin: { ...c.origin },
      radiusMm: c.radiusMm + widen, intensity: c.intensity, impactTick: c.impactTick,
    });
  }
}
