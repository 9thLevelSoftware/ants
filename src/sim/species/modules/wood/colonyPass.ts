// The wood-nesting colony pass, once per game hour: sites, the wood they lie in (carved fraction, windows), frass
// piles and visibility, the moisture read-out of a founding queen, satellites and diagnostics.

import type { Colony, Sim } from '@/sim/types';
import { colonyWoodParams } from './params';
import { refreshSites } from './sites';
import { frassTally, newlyEjected, refreshSiteWood } from './frass';
import { publishWoodDiagnostics } from './diagnostics';
import { woodClimateAt } from './woodState';
import { satellitePass } from './satellites';

/** Frass items seen outside per colony (derived; a repeat cue after a load is harmless). */
const ejectedSeen = new Map<number, Set<number>>();

export function colonyHourly(sim: Sim, col: Colony): void {
  const p = colonyWoodParams(sim, col);
  const def = sim.getSpecies(col.species);
  if (!p || !def || !col.wood) return;
  refreshSites(sim, col);
  refreshSiteWood(sim, col);
  // frass
  let seen = ejectedSeen.get(col.id);
  if (!seen) { seen = new Set(); ejectedSeen.set(col.id, seen); }
  const fresh = newlyEjected(sim, col, seen);
  for (const e of fresh) {
    const site = col.wood.sites.find((s) => s.nestId === e.nestId);
    sim.emit({ type: 'frass-ejected', siteId: site?.id ?? -1, pos: e.pos });
  }
  if (fresh.length > 0) sim.emit({ type: 'cue', cue: 'frass-drop', pos: fresh[0].pos, strength: Math.min(1, fresh.length / p.frassPerPileUnit) });
  const before = Math.floor((col.wood.frassUnitsInterior ?? 0) + (col.wood.frassUnitsOutdoor ?? 0));
  const t = frassTally(sim, col, p);
  col.wood.frassUnitsInterior = t.interior;
  col.wood.frassUnitsOutdoor = t.outdoor;
  col.wood.frassVisibility = t.visibility;
  const after = Math.floor(t.interior + t.outdoor);
  if (after > before) {
    const pile = sim.state.worldDelta.mounds.find((m) => m.material === 'frass' && col.nestIds.includes(m.nestId));
    sim.emit({ type: 'frass-pile-grew', pileId: pile?.id ?? -1, units: after });
  }
  // the founding queen's moisture read-out (GDD 07 §5.2.3: antennating wood shows its moisture class)
  if (col.isPlayer && sim.state.player.opening && !sim.state.player.opening.done) {
    const q = sim.stores.ants.get(col.queenId);
    if (q) sim.state.player.opening.woodMoisture = woodClimateAt(sim, q.pos, sim.world.bu)?.mc ?? -1;
  }
  satellitePass(sim, def, col, p);
  publishWoodDiagnostics(sim, def, col, p);
}
