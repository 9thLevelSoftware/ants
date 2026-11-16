// Lawn sward (GDD 04 §15.5): grass height per nav cell starts 40-60 mm (mown) / 150-250 (rough), grows by season
// (12 / 12 / 5 / 0 mm per GD, mown lawns capped at 120), and the mower cuts it to 35 mm in its stripes, taking the
// food sources above the cut with it (they regrow after MOW_REGROW_GD).

import { rngRange } from '@/core/rng';
import type { FoodSource, HumanEventRun, Sim } from '@/sim/types';
import { createSource } from '@/sim/ecology';
import {
  GRASS_GROWTH_MM_GD, GRASS_MAX_MOWN_MM, GRASS_MAX_ROUGH_MM, GRASS_START_MOWN_MM, GRASS_START_ROUGH_MM, MOW_CUT_MM, MOW_REGROW_GD,
} from '@/sim/balance/human';
import { daysPerYear, seasonOf, TICKS_PER_DAY } from '@/sim/time';
import { humanExtra } from '../extra';
import { zoneIdAt } from '../grid';
import { surfaceY } from '../ground';
import { inFootprint, type Footprint } from '../plan';
import { humanRng } from './common';
import { removeSources } from './ground';

/** Lawn variant ('mown' | 'rough') of each nav cell, or null; cached per world. */
const lawnCells = new WeakMap<object, (string | null)[]>();
function lawnOf(sim: Sim): (string | null)[] {
  let m = lawnCells.get(sim.world);
  if (!m) {
    const nav = sim.world.nav.cls;
    m = new Array<string | null>(nav.nx * nav.nz).fill(null);
    for (let k = 0; k < nav.nz; k++) {
      for (let i = 0; i < nav.nx; i++) {
        const id = zoneIdAt(sim.world, (i + 0.5) * nav.cell, (k + 0.5) * nav.cell);
        const z = sim.world.zones.find((zd) => zd.id === id);
        if (z?.type === 'lawn') m[k * nav.nx + i] = z.variant === 'rough' ? 'rough' : 'mown';
      }
    }
    lawnCells.set(sim.world, m);
  }
  return m;
}

/** First call: sward heights of every lawn cell; then one growth step per new game day. */
export function grassDaily(sim: Sim, dayIndex: number): void {
  const ex = humanExtra(sim);
  const g = sim.state.worldDelta.grassHeightMm, lawn = lawnOf(sim);
  if (ex.grassDay < 0) {
    const rng = humanRng(sim);
    for (let i = 0; i < lawn.length; i++) {
      if (!lawn[i] || g[i] > 0) continue;
      const r = lawn[i] === 'rough' ? GRASS_START_ROUGH_MM : GRASS_START_MOWN_MM;
      g[i] = Math.round(rngRange(rng, r[0], r[1]));
    }
    ex.grassDay = dayIndex;
    return;
  }
  if (dayIndex <= ex.grassDay) return;
  // each elapsed day at its own season's rate (winter 0: a skipped overwintering adds nothing); at most a year,
  // more than enough to reach every cap
  let grow = 0;
  const from = Math.max(ex.grassDay + 1, dayIndex - daysPerYear(sim.state.config) + 1);
  for (let d = from; d <= dayIndex; d++) grow += GRASS_GROWTH_MM_GD[seasonOf(d * TICKS_PER_DAY + TICKS_PER_DAY / 2, sim.state.config)] ?? 0;
  ex.grassDay = dayIndex;
  if (grow <= 0) return;
  for (let i = 0; i < lawn.length; i++) {
    if (!lawn[i]) continue;
    const cap = lawn[i] === 'rough' ? GRASS_MAX_ROUGH_MM : GRASS_MAX_MOWN_MM;
    if (g[i] < cap) g[i] = Math.min(cap, g[i] + grow);
  }
}

/** The deck's cut: sward in the stripe to MOW_CUT_MM, food above the cut removed (regrows later). */
export function mowGrass(sim: Sim, run: HumanEventRun, fp: Footprint, plane: number): void {
  const nav = sim.world.nav.cls, g = sim.state.worldDelta.grassHeightMm, lawn = lawnOf(sim);
  const r = Math.hypot(fp.hx, fp.hz);
  const i0 = Math.max(0, Math.floor((fp.x - r) / nav.cell)), i1 = Math.min(nav.nx - 1, Math.floor((fp.x + r) / nav.cell));
  const k0 = Math.max(0, Math.floor((fp.z - r) / nav.cell)), k1 = Math.min(nav.nz - 1, Math.floor((fp.z + r) / nav.cell));
  const cells: number[] = [];
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      const c = k * nav.nx + i;
      if (!lawn[c] || g[c] <= MOW_CUT_MM) continue;
      if (!inFootprint(fp, (i + 0.5) * nav.cell, (k + 0.5) * nav.cell, nav.cell * 0.5)) continue;
      g[c] = MOW_CUT_MM;
      cells.push(c);
    }
  }
  if (cells.length > 0) sim.emit({ type: 'world.grass-mown', cells, heightMm: MOW_CUT_MM });
  removeSources(sim, run, fp, 1, 'mown', (s) => {
    const above = s.pos.y - surfaceY(sim, s.pos.x, s.pos.z) > MOW_CUT_MM;
    if (above && s.pos.y > plane) noteRegrow(sim, s);
    return above;
  });
}

/** A source removed above the cut comes back after MOW_REGROW_GD. */
export function noteRegrow(sim: Sim, s: FoodSource): void {
  if (!s.variant) return;
  humanExtra(sim).regrow.push({
    tick: sim.state.tick + Math.round(MOW_REGROW_GD * TICKS_PER_DAY), variant: s.variant, pos: { ...s.pos }, up: { ...s.up },
    objectId: s.objectId, plantId: s.plantId, anchorId: s.anchorId,
  });
}

/** Regrows mown anchors whose time has come. */
export function runRegrow(sim: Sim): void {
  const ex = humanExtra(sim);
  if (ex.regrow.length === 0) return;
  const now = sim.state.tick;
  if (!ex.regrow.some((r) => r.tick <= now)) return;
  const due = ex.regrow.filter((r) => r.tick <= now);
  ex.regrow = ex.regrow.filter((r) => r.tick > now);
  for (const r of due) createSource(sim, { variant: r.variant, pos: r.pos, up: r.up, objectId: r.objectId, plantId: r.plantId, anchorId: r.anchorId });
}
