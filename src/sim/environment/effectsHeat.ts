// Heat exposure diagnostic (GDD 06 App. D `diag-heat-exposure`, §4.5 `heat-stupor-mass`): warn when more than 10 %
// of the player colony's surface ants run at Tb >= stressC - 3, bad when 10 % or more are in heat stupor. The alert
// `heat-danger` follows through the diagnostics registry (progression). The thermal doses themselves are env-core's
// antThermal system; this file only reads them.

import type { Ant, MaterialId, Sim } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import { UNDERGROUND_MM } from '@/sim/balance';
import { WX_HEAT_MARGIN_C, WX_HEAT_MIN_ANTS, WX_HEAT_STUPOR_SHARE, WX_HEAT_WARN_SHARE } from '@/sim/balance/weather';
import { publishDiagnostic } from '@/sim/progression/diagnostics';
import { stressCOf } from './antThermal';
import { LAWN_SLOT, surfaceSlotAt } from './ground';
import { microTemp } from './microTemp';
import { calendarNow } from './calendar';
import { thermalDefOf } from './thermalResponse';

export interface HeatExposure {
  surfaceAnts: number;
  /** Surface ants with Tb >= stressC - WX_HEAT_MARGIN_C. */
  stressed: number;
  stupor: number;
  /** Hottest ground under a surface ant: micro temperature (C) and surface name. */
  hottestC: number;
  hottestSurface: MaterialId | 'lawn' | 'none';
}

function onSurface(sim: Sim, ant: Ant): boolean {
  if (ant.medium === 'cavity' || ant.medium === 'water') return false;
  return ant.pos.y >= sim.field.height(ant.pos.x, ant.pos.z) - UNDERGROUND_MM;
}

/** Counts the player colony's surface ants by heat load. */
export function heatExposure(sim: Sim): HeatExposure {
  const out: HeatExposure = { surfaceAnts: 0, stressed: 0, stupor: 0, hottestC: -Infinity, hottestSurface: 'none' };
  const colony = sim.state.colonies[0];
  if (!colony) return out;
  const def = thermalDefOf(sim, colony.species);
  const limit = stressCOf(sim, def) - WX_HEAT_MARGIN_C;
  for (const ant of sim.stores.ants.list) {
    if (!ant.alive || ant.colony !== colony.id || !onSurface(sim, ant)) continue;
    out.surfaceAnts++;
    if (ant.tb >= limit) out.stressed++;
    if (ant.thermalState === 'heat-stupor') out.stupor++;
    const t = microTemp(sim, ant.pos, ant.medium);
    if (t > out.hottestC) {
      out.hottestC = t;
      const slot = surfaceSlotAt(sim.world, ant.pos.x, ant.pos.z);
      out.hottestSurface = slot === LAWN_SLOT ? 'lawn' : MATERIAL_IDS[slot] ?? 'none';
    }
  }
  return out;
}

/** Publishes `diag-heat-exposure` for the player colony. */
export function publishHeatDiagnostic(sim: Sim): HeatExposure {
  const h = heatExposure(sim);
  const n = h.surfaceAnts;
  const stressShare = n > 0 ? h.stressed / n : 0, stuporShare = n > 0 ? h.stupor / n : 0;
  let status: 'ok' | 'warn' | 'bad' = 'ok';
  if (n >= WX_HEAT_MIN_ANTS) {
    if (stuporShare >= WX_HEAT_STUPOR_SHARE) status = 'bad';
    else if (stressShare > WX_HEAT_WARN_SHARE) status = 'warn';
  }
  const hour = calendarNow(sim).hour;
  const temp = Number.isFinite(h.hottestC) ? Math.round(h.hottestC) : 0;
  publishDiagnostic(sim, {
    id: 'diag-heat-exposure', system: 'environment', status,
    label: status === 'ok' ? 'Surface temperatures bearable' : 'Surface too hot to cross',
    value: stressShare,
    factors: [
      { cause: 'surface-heat', weight: Math.max(stressShare, 0.01), detail: `${h.hottestSurface} ${temp} °C`, diagId: null },
      { cause: 'heat-stupor', weight: stuporShare, detail: `${h.stupor} of ${n} ants in heat stupor`, diagId: null },
      { cause: 'hour', weight: hour >= 11 && hour <= 16 ? 0.2 : 0.05, detail: `${Math.floor(hour)}:00`, diagId: null },
    ],
    remedies: status === 'ok' ? [] : ['remedy.hours.dawn-dusk', 'remedy.route.shade', 'remedy.marker.avoid'],
    sinceTick: -1, focus: null,
  });
  return h;
}
