// A play session (GDD 04 §15.2 `children`): 1-4 children run between play spots for 40-90 s (child footfalls), one
// digs at the sand pit (scoops that throw ants and sand), and a session may drop sweets (p 0.3) or spill a drink
// (p 0.15). Only soles, a toy scoop and falling food are drawn.

import { rngChance, rngFork, rngInt, rngPick, rngRange, type RngState } from '@/core/rng';
import type { HumanEventInst, Sim } from '@/sim/types';
import {
  CHILD_COUNT, CHILD_DIG_EVERY_S, CHILD_SCOOP_R_MM, CHILD_SCOOP_THROW_MM, CHILD_SESSION_S, CHILD_SPILL_P, CHILD_SWEETS_P,
  CHILD_PIT_JITTER_MM, CHILD_RUN_SHARE, CHILD_SPOT_JITTER_MM, CHILD_SPOT_SHARE, GAIT, HUMAN_CUES, SPILL_D_MM,
} from '@/sim/balance/human';
import { isFreeAt, type Pt } from '../grid';
import { planY } from '../ground';
import { rectOfImpacts, type Actor, type HumanPlan, type Impact } from '../plan';
import { siteById, type HumanSite } from '../sites';
import { leadTicks, secondsToT } from './lead';
import { walkFootfalls } from './walk';


function playPoint(rng: RngState, site: HumanSite): Pt {
  if (site.spots.length > 0 && rngChance(rng, CHILD_SPOT_SHARE)) {
    const s = rngPick(rng, site.spots);
    return { x: s.x + rngRange(rng, -CHILD_SPOT_JITTER_MM, CHILD_SPOT_JITTER_MM), z: s.z + rngRange(rng, -CHILD_SPOT_JITTER_MM, CHILD_SPOT_JITTER_MM) };
  }
  for (let i = 0; i < 20; i++) {
    const x = rngRange(rng, site.rect.x0, site.rect.x1), z = rngRange(rng, site.rect.z0, site.rect.z1);
    if (!site.grid || isFreeAt(site.grid, x, z)) return { x, z };
  }
  return { x: (site.rect.x0 + site.rect.x1) / 2, z: (site.rect.z0 + site.rect.z1) / 2 };
}

export function buildChildren(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const site = siteById(sim.world, inst.regionId);
  if (!site) return null;
  const rng = rngFork(inst.seed, 'human.plan');
  const cues = HUMAN_CUES.children;
  const t0 = leadTicks(sim, cues);
  const dur = rngRange(rng, CHILD_SESSION_S[0], CHILD_SESSION_S[1]);
  const n = rngInt(rng, CHILD_COUNT[0], CHILD_COUNT[1]);
  const impacts: Impact[] = [], actors: Actor[] = [];
  const runLen = GAIT.child.speed * dur * CHILD_RUN_SHARE;
  for (let c = 0; c < n; c++) {
    const pts: Pt[] = [inst.at && c === 0 ? { x: inst.at.x, z: inst.at.z } : playPoint(rng, site)];
    let len = 0;
    while (len < runLen) {
      const p = playPoint(rng, site), q = pts[pts.length - 1];
      len += Math.hypot(p.x - q.x, p.z - q.z);
      pts.push(p);
    }
    walkFootfalls(sim, rng, pts, { gait: 'child', contact: 'child-shoe', t0: t0 + secondsToT(rngRange(rng, 0, 3)), floorY: NaN, actor: actors.length }, impacts, actors);
  }
  // digging at the pit
  const pit = site.spots.find((s) => s.tag === 'sand-pit');
  if (pit) {
    const scoop: Actor = { kind: 'scoop', scale: 1, side: 0, keys: [] };
    const idx = actors.length;
    actors.push(scoop);
    for (let s = 2; s < dur; s += CHILD_DIG_EVERY_S) {
      const x = pit.x + rngRange(rng, -CHILD_PIT_JITTER_MM, CHILD_PIT_JITTER_MM), z = pit.z + rngRange(rng, -CHILD_PIT_JITTER_MM, CHILD_PIT_JITTER_MM);
      const y = planY(sim, x, z);
      const t = t0 + secondsToT(s);
      const r = rngRange(rng, CHILD_SCOOP_R_MM[0], CHILD_SCOOP_R_MM[1]);
      impacts.push({ t, fp: { x, y, z, yaw: rngRange(rng, 0, Math.PI * 2), hx: r, hz: r, disc: true }, contact: 'scoop', actor: idx, value: rngRange(rng, CHILD_SCOOP_THROW_MM[0], CHILD_SCOOP_THROW_MM[1]) });
      scoop.keys.push({ t: t - secondsToT(1), x, y, z, yaw: 0, lift: 300 }, { t, x, y, z, yaw: 0, lift: -30 }, { t: t + secondsToT(1), x, y, z, yaw: 0, lift: 400 });
    }
  }
  // sweets and a sugary drink
  const extra = (contact: 'drop' | 'spill', value: number, r: number, kind: Actor['kind']) => {
    const p = playPoint(rng, site), y = planY(sim, p.x, p.z), t = t0 + secondsToT(rngRange(rng, 5, dur));
    actors.push({ kind, scale: value, side: 0, keys: [{ t: t - 4, x: p.x, y, z: p.z, yaw: 0, lift: 700 }, { t, x: p.x, y, z: p.z, yaw: 0, lift: 0 }] });
    impacts.push({ t, fp: { x: p.x, y, z: p.z, yaw: 0, hx: r, hz: r, disc: true }, contact, actor: actors.length - 1, value });
  };
  if (rngChance(rng, CHILD_SWEETS_P)) extra('drop', 1, 20, 'crumb');
  if (rngChance(rng, CHILD_SPILL_P)) { const d = rngRange(rng, SPILL_D_MM[0], SPILL_D_MM[1]); extra('spill', d, d / 2, 'pour'); }
  impacts.sort((a, b) => a.t - b.t);
  if (impacts.length === 0) return null;
  const last = impacts[impacts.length - 1].t;
  return {
    instId: inst.id, kind: 'children', variant: inst.variant, firstT: t0, endT: last + secondsToT(2), impacts, actors, cues,
    area: rectOfImpacts(impacts, 2000), siteId: site.id, extent: 0, resumeKey: null, resume: -1,
  };
}
