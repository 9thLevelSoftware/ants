// Mowing, vacuum, broom and wipe plans (GDD 04 §15.2): coverage of the site's area in strips or strokes, resolved in
// steps of SWEEP_STEP_S (mower deck and vacuum nozzle) or one impact per broom stroke / cloth step.

import { rngChance, rngFork, type RngState } from '@/core/rng';
import type { HumanEventInst, Sim } from '@/sim/types';
import {
  BROOM_CONTACT_AT, BROOM_MAX_S, BROOM_STROKE_L, BROOM_STROKE_S, BROOM_STROKE_W, HUMAN_CUES, MOW_DECK_MM, MOW_MAX_S, MOW_OVERLAP_MM,
  MOW_SPEED_MM_S, STREET_STRIP_W, SWEEP_STEP_S, VACUUM_CREVICE_PASS_P, VACUUM_FLOOR_SHARE_WITH_CREVICE, VACUUM_MAX_S, VACUUM_PASSES, VACUUM_SPEED_MM_S,
  VACUUM_STRIP_W, WIPE_CUES, WIPE_MAX_S, WIPE_ROW_W, WIPE_SPEED_MM_S,
} from '@/sim/balance/human';
import { isFreeAt, type Rect } from '../grid';
import { planY } from '../ground';
import { rectOfImpacts, type Actor, type ActorKind, type ContactKind, type HumanPlan, type Impact } from '../plan';
import { siteById, type HumanSite } from '../sites';
import { leadTicks, secondsToT } from './lead';
import { coverStrips, type StripStep } from './strips';

function plan(inst: HumanEventInst, kind: HumanPlan['kind'], cues: HumanPlan['cues'], t0: number, impacts: Impact[], actors: Actor[],
  resumeKey: string | null, resume: number): HumanPlan {
  const last = impacts.length > 0 ? impacts[impacts.length - 1].t : t0;
  return {
    instId: inst.id, kind, variant: inst.variant, firstT: t0, endT: last + secondsToT(2), impacts, actors, cues,
    area: rectOfImpacts(impacts, 3000), siteId: inst.regionId, extent: 0, resumeKey, resume,
  };
}

/** Impacts and one actor's keys for a list of coverage steps. */
function stepsToImpacts(sim: Sim, steps: readonly StripStep[], t0: number, contact: ContactKind, hx: number, hz: number, y: number,
  impacts: Impact[], actor: Actor, actorIdx: number, onTop = false): void {
  for (const st of steps) {
    const t = t0 + secondsToT(st.s);
    const gy = onTop ? y : planY(sim, st.x, st.z, y);
    impacts.push({ t, fp: { x: st.x, y: gy, z: st.z, yaw: st.yaw, hx, hz, disc: false }, contact, actor: actorIdx, value: st.strip });
    actor.keys.push({ t, x: st.x, y: gy, z: st.z, yaw: st.yaw, lift: 0 });
  }
}

/** Fade the actor in from above before its first key and out after its last. */
function bracket(actor: Actor, lift: number, ticks: number): void {
  const a = actor.keys[0], b = actor.keys[actor.keys.length - 1];
  if (!a || !b) return;
  actor.keys.unshift({ ...a, t: a.t - ticks, lift });
  actor.keys.push({ ...b, t: b.t + ticks, lift });
}

const insideGrid = (site: HumanSite) => (x: number, z: number): boolean => (site.grid ? isFreeAt(site.grid, x, z) : true);

export function buildMowing(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const site = siteById(sim.world, inst.regionId);
  if (!site) return null;
  const cues = HUMAN_CUES.mowing;
  const t0 = leadTicks(sim, cues);
  const cover = coverStrips({
    rect: site.rect, inside: insideGrid(site), spacing: MOW_DECK_MM - MOW_OVERLAP_MM, step: MOW_SPEED_MM_S * SWEEP_STEP_S,
    speed: MOW_SPEED_MM_S, maxS: MOW_MAX_S, startStrip: Math.max(0, inst.param ?? 0), passes: 1,
  });
  if (cover.steps.length === 0) return null;
  const impacts: Impact[] = [];
  const actor: Actor = { kind: 'mower', scale: 1, side: 0, keys: [] };
  stepsToImpacts(sim, cover.steps, t0, 'mower-deck', (MOW_SPEED_MM_S * SWEEP_STEP_S) / 2, MOW_DECK_MM / 2, NaN, impacts, actor, 0);
  bracket(actor, 0, secondsToT(3));
  return plan(inst, 'mowing', cues, t0, impacts, [actor], `mow:${site.id}`, cover.nextStrip);
}

export function buildVacuum(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const site = siteById(sim.world, inst.regionId);
  if (!site) return null;
  const rng = rngFork(inst.seed, 'human.plan');
  const cues = HUMAN_CUES.vacuum;
  const t0 = leadTicks(sim, cues);
  const crevice = site.rects.length > 0 && rngChance(rng, VACUUM_CREVICE_PASS_P);
  const floorS = crevice ? VACUUM_MAX_S * VACUUM_FLOOR_SHARE_WITH_CREVICE : VACUUM_MAX_S;
  const step = VACUUM_SPEED_MM_S * SWEEP_STEP_S;
  const cover = coverStrips({
    rect: site.rect, inside: insideGrid(site), spacing: VACUUM_STRIP_W, step, speed: VACUUM_SPEED_MM_S, maxS: floorS,
    startStrip: Math.max(0, inst.param ?? 0), passes: VACUUM_PASSES,
  });
  const impacts: Impact[] = [];
  const actor: Actor = { kind: 'nozzle', scale: 1, side: 0, keys: [] };
  stepsToImpacts(sim, cover.steps, t0, 'vacuum', step / 2, VACUUM_STRIP_W / 2, site.y, impacts, actor, 0);
  if (crevice) {
    // along each skirting run, nozzle edge-on to the wall
    let s = cover.steps.length > 0 ? cover.steps[cover.steps.length - 1].s + 2 : 0;
    const steps: StripStep[] = [];
    for (const r of site.rects) {
      const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
      const n = Math.max(1, Math.floor((alongX ? r.x1 - r.x0 : r.z1 - r.z0) / step));
      for (let i = 0; i <= n && s < VACUUM_MAX_S; i++) {
        const x = alongX ? r.x0 + i * step : (r.x0 + r.x1) / 2, z = alongX ? (r.z0 + r.z1) / 2 : r.z0 + i * step;
        steps.push({ x, z, yaw: alongX ? 0 : Math.PI / 2, s, strip: -1 });
        s += SWEEP_STEP_S;
      }
    }
    stepsToImpacts(sim, steps, t0, 'vacuum-crevice', step / 2, VACUUM_STRIP_W / 4, site.y, impacts, actor, 0);
  }
  if (impacts.length === 0) return null;
  bracket(actor, 400, secondsToT(2));
  return plan(inst, 'vacuum', cues, t0, impacts, [actor], `vac:${site.id}`, cover.nextStrip);
}

/** Broom strokes over a grid or over strip rectangles (street broom), crowd first when `at` is set. */
function broomStrokes(rng: RngState, site: HumanSite, at: { x: number; z: number } | null): StripStep[] {
  const out: StripStep[] = [];
  const rects: Rect[] = site.rects.length > 0 ? site.rects : [site.rect];
  let s = 0;
  const rows: { x: number; z: number; yaw: number }[][] = [];
  for (const r of rects) {
    const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
    const a0 = alongX ? r.x0 : r.z0, a1 = alongX ? r.x1 : r.z1, w0 = alongX ? r.z0 : r.x0, w1 = alongX ? r.z1 : r.x1;
    const spacing = site.rects.length > 0 ? Math.max(BROOM_STROKE_W, STREET_STRIP_W / 2) : BROOM_STROKE_W;
    for (let across = w0 + spacing / 2; across < w1; across += spacing) {
      const row: { x: number; z: number; yaw: number }[] = [];
      for (let along = a0 + BROOM_STROKE_L / 2; along < a1; along += BROOM_STROKE_L * 0.85) {
        const x = alongX ? along : across, z = alongX ? across : along;
        if (site.rects.length === 0 && !insideGrid(site)(x, z)) continue;
        row.push({ x, z, yaw: alongX ? 0 : Math.PI / 2 });
      }
      if (row.length > 0) rows.push(row);
    }
  }
  if (at) rows.sort((p, q) => Math.hypot(p[0].x - at.x, p[0].z - at.z) - Math.hypot(q[0].x - at.x, q[0].z - at.z));
  else if (rows.length > 1 && rngChance(rng, 0.5)) rows.reverse();
  rows.forEach((row, ri) => {
    for (const p of row) {
      if (s >= BROOM_MAX_S) return;
      out.push({ ...p, s, strip: ri });
      s += BROOM_STROKE_S;
    }
  });
  return out;
}

export function buildSweeping(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  if (inst.variant === 'wipe') return buildWipe(sim, inst);
  const site = siteById(sim.world, inst.regionId);
  if (!site) return null;
  const rng = rngFork(inst.seed, 'human.plan');
  const cues = HUMAN_CUES.sweeping;
  const t0 = leadTicks(sim, cues);
  const strokes = broomStrokes(rng, site, inst.at ?? null);
  if (strokes.length === 0) return null;
  const impacts: Impact[] = [];
  const actor: Actor = { kind: 'broom', scale: 1, side: 0, keys: [] };
  const back = BROOM_STROKE_L / 2;
  for (const st of strokes) {
    const t = t0 + secondsToT(st.s + BROOM_STROKE_S * BROOM_CONTACT_AT);
    const y = planY(sim, st.x, st.z, site.y);
    impacts.push({ t, fp: { x: st.x, y, z: st.z, yaw: st.yaw, hx: BROOM_STROKE_L / 2, hz: BROOM_STROKE_W / 2, disc: false }, contact: 'broom', actor: 0, value: 0 });
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    actor.keys.push({ t: t0 + secondsToT(st.s), x: st.x - c * back, y, z: st.z - s * back, yaw: st.yaw, lift: 60 });
    actor.keys.push({ t: t0 + secondsToT(st.s + 0.15), x: st.x - c * back, y, z: st.z - s * back, yaw: st.yaw, lift: 0 });
    actor.keys.push({ t, x: st.x + c * back, y, z: st.z + s * back, yaw: st.yaw, lift: 0 });
    actor.keys.push({ t: t0 + secondsToT(st.s + BROOM_STROKE_S * 0.95), x: st.x + c * back, y, z: st.z + s * back, yaw: st.yaw, lift: 80 });
  }
  bracket(actor, 900, secondsToT(1.5));
  return plan(inst, 'sweeping', cues, t0, impacts, [actor], null, -1);
}

function buildWipe(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const site = siteById(sim.world, inst.regionId);
  if (!site || site.rects.length === 0) return null;
  const rng = rngFork(inst.seed, 'human.plan');
  const r = site.rects[Math.floor(rng[0] % site.rects.length)];
  const cues = WIPE_CUES;
  const t0 = leadTicks(sim, cues);
  const step = WIPE_SPEED_MM_S * SWEEP_STEP_S;
  const cover = coverStrips({
    rect: r, inside: () => true, spacing: WIPE_ROW_W, step, speed: WIPE_SPEED_MM_S, maxS: WIPE_MAX_S, startStrip: 0, passes: 1,
  });
  const impacts: Impact[] = [];
  const actor: Actor = { kind: 'cloth' as ActorKind, scale: 1, side: 0, keys: [] };
  stepsToImpacts(sim, cover.steps, t0, 'wipe', step / 2 + 10, WIPE_ROW_W / 2, r.y, impacts, actor, 0, true);
  if (impacts.length === 0) return null;
  bracket(actor, 300, secondsToT(1));
  return plan(inst, 'sweeping', cues, t0, impacts, [actor], null, -1);
}
