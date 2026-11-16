// What the ground overlays show, read from the sim (read only): surface temperature (environment), topsoil
// moisture and puddles (moisture grid), and the threat classes (danger grid, predators and their territories,
// known hazards, rival territories, hot surfaces, forecast human events). Each builds a TexelSampler for one
// raster pass; per-pass lists (zones) are gathered once when the pass starts.
import type { Sim } from '@/sim/types';
import { surfaceTemp } from '@/sim/environment/surface';
import { stressCOf } from '@/sim/environment/antThermal';
import { DANGER_CELL_BU } from '@/sim/balance';
import { TICKS_PER_HOUR } from '@/sim/time';
import { claimAt } from '@/sim/rivals/claims';
import { coreRadiusBu } from '@/sim/rivals/init';
import type { TexelSampler } from './raster';
import {
  DANGER_FULL, FLOODED_PUDDLE, PREDATOR_KINDS, PREDATOR_REACH_BU, TEMP_MAX_C, TEMP_MIN_C,
} from './tuning';

export type FieldMode = 'temperature' | 'moisture' | 'threats';

/** °C <-> channel value of the temperature field. */
export function encodeTemp(c: number): number {
  return (c - TEMP_MIN_C) / (TEMP_MAX_C - TEMP_MIN_C);
}
export function decodeTemp(v: number): number {
  return TEMP_MIN_C + v * (TEMP_MAX_C - TEMP_MIN_C);
}

/** Temperature: R = encoded surface temperature, G = 1 (data present). */
export function temperatureSampler(sim: Sim): TexelSampler {
  const size = sim.world.size;
  return {
    sample(x, z, out) {
      if (x < 0 || z < 0 || x > size || z > size) return; // the locality only
      out[0] = encodeTemp(surfaceTemp(sim, x, z));
      out[1] = 1;
    },
  };
}

/** Topsoil moisture 0..1 at (x, z): the live moisture grid, else the world's base map, else null. */
export function topsoilMoistureAt(sim: Sim, x: number, z: number): number | null {
  const m = sim.state.env?.moisture;
  if (m && m.nx > 0 && m.theta0.length > 0) {
    const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(x / m.cell)));
    const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(z / m.cell)));
    return m.theta0[iz * m.nx + ix] / 255;
  }
  const b = sim.world.maps?.moisture;
  if (b && b.nx > 0) {
    const ix = Math.min(b.nx - 1, Math.max(0, Math.floor(x / b.cell)));
    const iz = Math.min(b.nz - 1, Math.max(0, Math.floor(z / b.cell)));
    return b.data[iz * b.nx + ix] / 255;
  }
  return null;
}

/** Moisture: R = topsoil moisture, G = 1 (data present), B = flooded (standing water). */
export function moistureSampler(sim: Sim): TexelSampler {
  const m = sim.state.env?.moisture;
  const size = sim.world.size;
  return {
    sample(x, z, out) {
      if (x < 0 || z < 0 || x > size || z > size) return;
      const v = topsoilMoistureAt(sim, x, z);
      if (v === null) return;
      out[0] = v;
      out[1] = 1;
      if (m && m.puddle.length === m.nx * m.nz && m.nx > 0) {
        const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(x / m.cell)));
        const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(z / m.cell)));
        if (m.puddle[iz * m.nx + ix] >= FLOODED_PUDDLE) out[2] = 1;
      }
    },
  };
}

/** A disc zone of one threat class: channel 0 predator, 1 rival territory, 3 human forecast. */
export interface Zone {
  x: number;
  z: number;
  r: number;
  ch: 0 | 1 | 3;
  strength: number;
}

/** A countdown label of a forecast human event. */
export interface Forecast {
  x: number;
  y: number;
  z: number;
  text: string;
}

/** "in 2 h" / "in 40 min" (game time, GDD 08 §10.1). */
export function countdownText(ticks: number): string {
  const h = ticks / TICKS_PER_HOUR;
  if (h >= 1) return `in ${Math.round(h)} h`;
  return `in ${Math.max(1, Math.round(h * 60))} min`;
}

/** The threat zones of the player colony right now. */
export function threatZones(sim: Sim): { zones: Zone[]; forecasts: Forecast[] } {
  const zones: Zone[] = [];
  const forecasts: Forecast[] = [];
  const bu = sim.world.bu;
  const s = sim.state;
  const player = s.colonies.find((c) => c.alive && c.isPlayer);
  for (const c of s.creatures) {
    if (!c.alive || !PREDATOR_KINDS.has(c.kind)) continue;
    zones.push({ x: c.pos.x, z: c.pos.z, r: Math.max(PREDATOR_REACH_BU * bu, Math.min(c.homeRadius, 40 * bu)), ch: 0, strength: 1 });
  }
  for (const t of s.ecology?.director?.territories ?? []) {
    if (t.occupantId < 0 || !PREDATOR_KINDS.has(t.kind)) continue;
    zones.push({ x: t.center.x, z: t.center.z, r: t.radius, ch: 0, strength: 0.6 });
  }
  const slot = player ? s.rivals?.territory?.slotColony.indexOf(player.id) ?? -1 : -1;
  for (const h of s.ecology?.hazards ?? []) {
    const known = slot < 0 || (h.knownBy & (1 << slot)) !== 0;
    if (!known || (h.untilTick !== undefined && h.untilTick <= s.tick)) continue;
    zones.push({ x: h.pos.x, z: h.pos.z, r: Math.max(h.radius, 2 * bu), ch: 0, strength: 1 });
  }
  const terr = s.rivals?.territory;
  const gridTerritory = !!terr && terr.marks.length === terr.w * terr.h * terr.slots && terr.marks.length > 0;
  if (!gridTerritory) {
    // no territory grid yet: each rival's core area around its entrances (GDD 05 §3.5 R_core = min(150, 40 + 0.1 N) BU)
    for (const n of s.nests) {
      const col = s.colonies.find((c) => c.id === n.colony);
      if (!col || !col.alive || col.isPlayer) continue;
      const r = coreRadiusBu(col.rival?.n ?? col.core?.workers ?? 0) * bu;
      for (const e of n.entrances) zones.push({ x: e.pos.x, z: e.pos.z, r, ch: 1, strength: 1 });
    }
  }
  for (const run of s.env?.human?.active ?? []) {
    for (const cue of run.cues) {
      const left = cue.impactTick - s.tick;
      if (left <= 0) continue;
      zones.push({ x: cue.origin.x, z: cue.origin.z, r: cue.radiusMm, ch: 3, strength: 1 });
      forecasts.push({ x: cue.origin.x, y: sim.field.height(cue.origin.x, cue.origin.z), z: cue.origin.z, text: countdownText(left) });
    }
  }
  return { zones, forecasts };
}

/**
 * Threats: R = predator area / danger, G = rival territory, B = hot surface (above the species' heat-stress
 * temperature), A = forecast human event.
 */
export function threatSampler(sim: Sim, zones: readonly Zone[]): TexelSampler {
  const s = sim.state;
  const player = s.colonies.find((c) => c.alive && c.isPlayer);
  const dCell = DANGER_CELL_BU * sim.world.bu;
  const dW = Math.max(1, Math.ceil(sim.world.size / dCell));
  const danger = player && player.danger?.length === dW * dW ? player.danger : null;
  const hotC = stressCOf(sim, sim.species.thermal);
  const terr = s.rivals?.territory;
  const grid = terr && terr.marks.length > 0 && terr.marks.length === terr.w * terr.h * terr.slots ? terr : null;
  const playerId = player ? player.id : -1;
  const p = { x: 0, z: 0 };
  const size = sim.world.size;
  return {
    sample(x, z, out) {
      if (x < 0 || z < 0 || x > size || z > size) return;
      for (let k = 0; k < zones.length; k++) {
        const q = zones[k];
        const d = Math.hypot(x - q.x, z - q.z);
        if (d > q.r) continue;
        if (q.strength > out[q.ch]) out[q.ch] = q.strength;
      }
      if (danger) {
        const ix = Math.floor(x / dCell), iz = Math.floor(z / dCell);
        if (ix >= 0 && iz >= 0 && ix < dW && iz < dW) {
          const v = Math.min(1, danger[iz * dW + ix] / DANGER_FULL);
          if (v > out[0]) out[0] = v;
        }
      }
      if (grid) {
        // rival territory = cells a rival colony claims (GDD 05 §3.5: marks >= CLAIM_MIN and >= 1.5 x the second)
        p.x = x; p.z = z;
        const claim = claimAt(sim, p);
        if (claim.owner >= 0 && claim.owner !== playerId) out[1] = 1;
      }
      const t = surfaceTemp(sim, x, z);
      if (t >= hotC) out[2] = Math.min(1, 0.5 + (t - hotC) / 10);
    },
  };
}

/** The sampler of a field overlay for one pass (and the forecast labels of the threats overlay). */
export function samplerFor(sim: Sim, mode: FieldMode): { sampler: TexelSampler; forecasts: Forecast[] } {
  if (mode === 'temperature') return { sampler: temperatureSampler(sim), forecasts: [] };
  if (mode === 'moisture') return { sampler: moistureSampler(sim), forecasts: [] };
  const { zones, forecasts } = threatZones(sim);
  return { sampler: threatSampler(sim, zones), forecasts };
}
