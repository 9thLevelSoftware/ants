// One architect evaluation of a nest (GDD 03 §8.1, §8.3 throttles, §7.8 withdrawal): pressures into the need
// cache, failed sites withdrawn and struck, plans whose need has gone withdrawn, then at most ARCH_NEW_PER_EVAL new
// proposals for the most urgent needs that have no plan yet and fit under the volume cap. In `off`, nothing new;
// proposals still waiting go on as in auto.

import type { Vec3 } from '@/core/math/vec3';
import type { ArchitectNeed, DigPlan, Nest, Sim } from '@/sim/types';
import { ARCHITECT_NEEDS } from '@/sim/types';
import { ARCH_PROPOSAL_S, nestTemplate } from '@/sim/balance/nest';
import {
  ARCH_FAIL_STALL_S, ARCH_MIN_DIGGERS, ARCH_NEW_PER_EVAL, ARCH_WITHDRAW_PROGRESS, CONCURRENT_PLANS, SITE_FAILURE_REASONS,
} from '@/sim/balance/architect';
import { TICKS_PER_SECOND } from '@/sim/time';
import { cancelPlanImpl, createPlanImpl, progressOf } from '../plans/plans';
import { planCache } from '../plans/targets';
import { isLivePlan } from './capacity';
import { evaluateNeeds, liveInputs, needStillThere, type NeedInputs, type NeedRequest } from './needs';
import { choosePlacement } from './place';
import { architectRuntime } from './runtime';
import { pruneSites, recordSiteFailure } from './sites';

const speciesOf = (sim: Sim, nest: Nest): string => sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id;

/** Is the nest past its founding (GDD 03 §13.2: the architect starts at `established`)? */
export function nestEstablished(nest: Nest): boolean {
  return nest.founding === null || nest.founding.state === 'established';
}

/** Concurrent non-terminal architect plans allowed for this many workers. */
export function concurrentLimit(workers: number): number {
  for (const c of CONCURRENT_PLANS) if (workers < c.below) return c.plans;
  return CONCURRENT_PLANS[CONCURRENT_PLANS.length - 1].plans;
}

function writeCache(nest: Nest, p: Partial<Record<ArchitectNeed, number>>): void {
  for (const n of ARCHITECT_NEEDS) nest.architect.needCache[n] = Number.isFinite(p[n] ?? 0) ? (p[n] ?? 0) : 1e6;
}

/** Where a plan digs: its room's centre, or a tunnel's end (the site that fails, GDD 03 §7.8). */
export function planSite(sim: Sim, nest: Nest, p: DigPlan): Vec3 {
  const g = planCache(sim, nest, p)?.geometry;
  return g ? { ...(g.ellipsoid?.c ?? g.mouth) } : { ...p.anchor.pos };
}

/** Architect plans stalled for a site reason long enough are withdrawn; each counts as one failure of its site. */
function handleFailures(sim: Sim, nest: Nest): void {
  const now = sim.state.tick, limit = ARCH_FAIL_STALL_S * TICKS_PER_SECOND;
  for (const p of [...nest.digPlans]) {
    if (p.source !== 'architect' || p.status !== 'stalled' || !p.blockedReason) continue;
    if (!SITE_FAILURE_REASONS.includes(p.blockedReason) || now - p.statusTick < limit) continue;
    const site = planSite(sim, nest, p);
    if (!cancelPlanImpl(sim, p.id, 'architect')) continue;
    recordSiteFailure(sim, nest.architect, site);
    architectRuntime(sim).failures++;
  }
}

/**
 * Recorded decision (GDD 03 §8.1 "in off, existing architect plans continue" vs §7.8, which defines
 * proposed -> queued only for auto and suggest): a proposal still waiting when the mode is set to off goes on as
 * in auto, queued once ARCH_PROPOSAL_S has passed (the player can still cancel it). The nest module's plan update
 * only queues proposals in auto, so the architect does it here, at its own cadence (up to one period late).
 */
function continueProposals(sim: Sim, nest: Nest): void {
  const now = sim.state.tick, wait = ARCH_PROPOSAL_S * TICKS_PER_SECOND;
  for (const p of nest.digPlans) if (p.source === 'architect' && now - p.createdTick >= wait) queueProposal(sim, p);
}

/** proposed -> queued (the nest module's own transition, GDD 03 §7.8); false when the plan is not a proposal. */
export function queueProposal(sim: Sim, plan: DigPlan): boolean {
  if (plan.status !== 'proposed') return false;
  plan.status = 'queued';
  plan.blockedReason = null;
  plan.statusTick = sim.state.tick;
  sim.emit({ type: 'plan-status-changed', planId: plan.id, status: 'queued', blockedReason: null });
  return true;
}

/** The architect's own plans below ARCH_WITHDRAW_PROGRESS whose need has gone are cancelled (GDD 03 §7.8). */
function withdraw(sim: Sim, nest: Nest, species: string, inputs: NeedInputs): void {
  for (const p of [...nest.digPlans]) {
    if (p.source !== 'architect' || !isLivePlan(p) || !p.need || progressOf(p) >= ARCH_WITHDRAW_PROGRESS) continue;
    if (needStillThere(nest, species, inputs, p.need)) continue;
    if (cancelPlanImpl(sim, p.id, 'architect')) architectRuntime(sim).withdrawn++;
  }
}

/** Volume of soil the live plans of the nest (every source) still have to remove, BU^3. */
export function pendingVolume(nest: Nest): number {
  return nest.digPlans.filter(isLivePlan).reduce((s, p) => s + Math.max(0, p.targetVolume - p.removedVolume), 0);
}

/** Room left under the volume cap once the live plans are dug, BU^3 (GDD 03 §8.3 "nothing above volumeCap"). */
export function volumeRoom(nest: Nest, species: string): number {
  return nestTemplate(species).volumeCap - nest.volumeOpen - pendingVolume(nest);
}

/**
 * Validated placement for a request, then the plan (source architect, status proposed); its id or -1. The
 * plan's own volume must fit in the room left under the cap with every other live plan counted: candidates are
 * filtered by their analytic volume, and the created plan's exact target volume is checked once more (a plan
 * that still does not fit is withdrawn at once and the next candidate is tried).
 */
export function proposeFor(sim: Sim, nest: Nest, req: NeedRequest): number {
  const rt = architectRuntime(sim);
  const room = volumeRoom(nest, speciesOf(sim, nest));
  let id = -1;
  const placement = choosePlacement(sim, nest, req, sim.state.rng, (spec) => {
    rt.probe?.(spec, req);
    id = createPlanImpl(sim, spec, 'architect');
    if (id < 0) { rt.createRefused++; return false; } // validation refused after the architect's own checks
    const plan = nest.digPlans.find((p) => p.id === id);
    if (plan && plan.targetVolume > room) {
      cancelPlanImpl(sim, id, 'architect');
      rt.createRefused++;
      id = -1;
      return false;
    }
    return true;
  }, { maxVolumeBu3: room });
  if (!placement) { rt.noSite++; return -1; }
  const plan = nest.digPlans.find((p) => p.id === id);
  if (plan) plan.need = req.need;
  rt.created++;
  sim.emit({ type: 'architect-proposal', planId: id, need: req.need, priority: req.priority });
  return id;
}

/** Ids of the plans created by this evaluation. */
export function evaluateNest(sim: Sim, nest: Nest): number[] {
  const arch = nest.architect, species = speciesOf(sim, nest);
  architectRuntime(sim).evaluations++;
  arch.lastEvalTick = sim.state.tick;
  pruneSites(sim, arch);
  const inputs = liveInputs(sim, nest);
  writeCache(nest, evaluateNeeds(nest, species, inputs, false).pressures);
  if (!nestEstablished(nest)) return [];
  handleFailures(sim, nest);
  if (arch.mode === 'off') { continueProposals(sim, nest); return []; } // existing architect plans continue (§8.1)
  withdraw(sim, nest, species, inputs);
  if (inputs.diggers < ARCH_MIN_DIGGERS) return [];
  const live = nest.digPlans.filter((p) => p.source === 'architect' && isLivePlan(p));
  const slots = Math.min(ARCH_NEW_PER_EVAL, concurrentLimit(inputs.workers) - live.length);
  if (slots <= 0) return [];
  if (volumeRoom(nest, species) <= 0) return [];
  const created: number[] = [];
  for (const req of evaluateNeeds(nest, species, inputs, true).requests) {
    if (created.length >= slots) break;
    if (arch.needToggles[req.need] === false) continue; // T2 per-need toggles (setArchitectNeed)
    if (live.some((p) => p.need === req.need)) continue; // one plan per need at a time
    const id = proposeFor(sim, nest, req);
    if (id >= 0) created.push(id);
  }
  return created;
}
