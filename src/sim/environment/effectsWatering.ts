// Sprinklers, hoses and cans wet the ground (GDD 04 §15.4 water rates, GDD 06 §3.9 soil moisture; task nest-fix3
// item 7). The sky's rain steps every moisture cell (moisture.ts); human watering falls on a footprint only, so it
// is applied here, per cell of the active watering footprints, through the human-events rate function
// (humanRainRateAt): the infiltration part of the cell step (limited by infiltration capacity, permeability and free
// pore space, moistureCell.ts stepCell) into the top layer, and half the runoff into the puddle store. Every
// ENV_MOISTURE_EVERY ticks with the matching step; nothing to do while no watering runs. (The nest inflow of the same
// water is the flood module's: src/sim/nest/flood/inflow.ts intensityAt.)

import type { Sim } from '@/sim/types';
import { ENV_MOISTURE_EVERY } from '@/sim/balance';
import { WX_PUDDLE_FILL, WX_PUDDLE_UNIT_MM, WX_W0_MM } from '@/sim/balance/weather';
import { TICKS_PER_HOUR } from '@/sim/time';
import { humanRainRateAt } from './human/waterRate';
import { humanPlan } from './human/plans';
import { footprintRadius } from './human/plan';
import { moistureStatic } from './moistureStatic';

/** Applies one moisture period of human watering; returns the number of cells wetted (tests). */
export function stepWatering(sim: Sim, dtTicks = ENV_MOISTURE_EVERY): number {
  const m = sim.state.env.moisture;
  if (m.nx <= 0 || m.theta0.length !== m.nx * m.nz) return 0;
  const runs = sim.state.env.human.active;
  let wetted = 0;
  const done = new Set<number>();
  for (const run of runs) {
    const inst = run.inst;
    if (!inst || inst.kind !== 'watering' || !run.started) continue;
    const fp = humanPlan(sim, inst)?.impacts[0]?.fp;
    if (!fp) continue;
    const st = moistureStatic(sim.world, m.cell, m.nx, m.nz);
    const r = footprintRadius(fp), dtH = dtTicks / TICKS_PER_HOUR;
    const i0 = Math.max(0, Math.floor((fp.x - r) / m.cell)), i1 = Math.min(m.nx - 1, Math.floor((fp.x + r) / m.cell));
    const k0 = Math.max(0, Math.floor((fp.z - r) / m.cell)), k1 = Math.min(m.nz - 1, Math.floor((fp.z + r) / m.cell));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const c = k * m.nx + i;
      if (done.has(c) || st.interior[c]) continue;
      const rate = humanRainRateAt(sim, (i + 0.5) * m.cell, (k + 0.5) * m.cell);
      if (rate <= 0) continue;
      done.add(c);
      const water = rate * dtH;
      const theta0 = m.theta0[c] / 255;
      const inf = Math.min(Math.min(water, st.icap[c] * dtH) * st.permeable[c], (1 - theta0) * WX_W0_MM);
      m.theta0[c] = Math.min(255, Math.round((theta0 + inf / WX_W0_MM) * 255));
      if (st.puddleCap[c] > 0) {
        const add = ((water - inf) * WX_PUDDLE_FILL) / WX_PUDDLE_UNIT_MM;
        m.puddle[c] = Math.min(st.puddleCap[c], m.puddle[c] + Math.round(add));
      }
      wetted++;
    }
  }
  return wetted;
}
