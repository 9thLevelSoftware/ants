// Nest overview's data (GDD 08 4.6, GDD 03 §6): the player's main nest as plain numbers in BU relative to its origin:
// chambers with their load, climate and flood state, entrances with mound height and traffic, and the tunnels the
// finished and running dig plans have carved. The schematic itself (axis, scale, links) is drawn by the UI.
import { CHAMBER_MIN_VOL } from '@/sim/balance/nest';
import { DESIGNATABLE_TYPES } from '@/sim/balance/nestTemplates';
import type { ChamberType, DigPlan, Nest, Sim, SpeciesId } from '@/sim/types';
import type { UiChamber, UiEntrance, UiNest, UiNestPoint, UiTunnel } from '@/ui/api';

const OPEN_STATUSES = new Set(['proposed', 'queued', 'active', 'stalled', 'paused']);
const TUNNEL_KINDS = new Set(['tunnel', 'shaft', 'entrance']);
/** Tunnel polylines are thinned to this many points (a long tunnel has a sphere every half body length). */
const TUNNEL_POINTS_MAX = 24;

/** The first living nest of the player colony, or undefined. */
export function playerNestOf(sim: Sim): Nest | undefined {
  const col = sim.state.colonies[0];
  if (!col) return undefined;
  return col.nestIds.map((id) => sim.stores.nests.get(id)).find((n): n is Nest => !!n && n.alive);
}

function tunnelOf(sim: Sim, nest: Nest, plan: DigPlan, bu: number): UiTunnel | null {
  const done = plan.status === 'complete' ? plan.spheres : plan.spheres.filter((s) => s.done);
  if (done.length < 2) return null;
  const step = Math.max(1, Math.ceil(done.length / TUNNEL_POINTS_MAX));
  const pts: UiNestPoint[] = [];
  for (let i = 0; i < done.length; i += step) pts.push(pointOf(sim, nest, done[i].c.x, done[i].c.y, done[i].c.z, bu));
  const last = done[done.length - 1];
  if ((done.length - 1) % step !== 0) pts.push(pointOf(sim, nest, last.c.x, last.c.y, last.c.z, bu));
  return { planId: plan.id, kind: plan.kind, status: plan.status, pts };
}

function pointOf(sim: Sim, nest: Nest, x: number, y: number, z: number, bu: number): UiNestPoint {
  return { x: (x - nest.origin.x) / bu, z: (z - nest.origin.z) / bu, depth: Math.max(0, (sim.field.height(x, z) - y) / bu) };
}

export function nestOf(sim: Sim): UiNest | null {
  const nest = playerNestOf(sim);
  const col = sim.state.colonies[0];
  if (!nest || !col) return null;
  const bu = sim.world.bu;
  const species = col.species as SpeciesId;
  const allowedTypes = DESIGNATABLE_TYPES[species] ?? DESIGNATABLE_TYPES['lasius-niger'];
  const def = sim.getSpecies(col.species);
  const clim = def?.nestTemplate.broodClimate.find((c) => c.stage === 'larva') ?? def?.nestTemplate.broodClimate[0];
  const sealedFounding = !!nest.founding && nest.founding.state === 'sealed';
  const chambers: UiChamber[] = nest.chambers.map((c) => ({
    id: c.id, type: c.type, designatedBy: c.designatedBy,
    p: { x: (c.center.x - nest.origin.x) / bu, z: (c.center.z - nest.origin.z) / bu, depth: c.depthBu },
    radius: ((c.radii.x + c.radii.z) / 2) / bu, volume: c.volume,
    capacity: { adults: c.capacity.adults, brood: c.capacity.brood, food: c.capacity.food, other: c.capacity.other },
    occupancy: { adults: c.occupancy.adults, brood: c.occupancy.brood, food: c.occupancy.food, other: c.occupancy.other },
    temp: c.temp, humidity: c.humidity, flooded: c.flooded, floodRisk: c.floodRisk,
    allowed: c.type === 'founding' && sealedFounding ? [] : (allowedTypes as readonly ChamberType[]).filter((t) => c.volume >= CHAMBER_MIN_VOL[t]),
  }));
  const mounds = sim.state.worldDelta.mounds;
  const entrances: UiEntrance[] = nest.entrances.map((e) => {
    const m = e.moundId >= 0 ? mounds.find((x) => x.id === e.moundId) : undefined;
    let h = 0;
    if (m) for (let i = 0; i < m.h.length; i++) if (m.h[i] > h) h = m.h[i];
    return {
      id: e.id, status: e.status, kind: e.kind, p: pointOf(sim, nest, e.pos.x, e.pos.y, e.pos.z, bu),
      moundBu: m ? h / bu : null, trafficIn: e.trafficIn, trafficOut: e.trafficOut,
    };
  });
  const tunnels: UiTunnel[] = [];
  for (const plan of nest.digPlans) {
    if (!TUNNEL_KINDS.has(plan.kind) || plan.status === 'cancelled') continue;
    const t = tunnelOf(sim, nest, plan, bu);
    if (t) tunnels.push(t);
  }
  return {
    nestId: nest.id, species: col.species,
    broodBand: clim ? { lo: clim.tOpt[0], hi: clim.tOpt[1], rhLo: clim.rh[0], rhHi: clim.rh[1] } : null,
    volumeOpen: nest.volumeOpen, chambers, entrances, tunnels, openPlans: nest.digPlans.filter((p) => OPEN_STATUSES.has(p.status)).length,
  };
}
