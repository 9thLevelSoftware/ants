// Who is working each garden now (GDD 07 §6.4.2 ftend, §6.4.4 weedCoverage), the gardener's job keys, and whether a
// garden is still the founding garden (GDD 07 §6.4.8: the queen tends it until the hand-over).

import type { Ant, Colony, GardenRecord, Sim } from '@/sim/types';

/** bb keys of the fungus behaviours (numbers only). */
export const AK = {
  /** Gardener's job (GJ below). */
  job: 'at.job',
  /** Chamber the gardener works. */
  room: 'at.room',
  /** Cutter: leaf-site index in col.fungus.leafSites; trip start tick; laden distance start (x, z). */
  site: 'at.site',
  tripTick: 'at.trip',
  /** Cutter phase (CP below). */
  phase: 'at.ph',
  /** Phorid: tick a parasitised forager dies (-1 none), and the next exposure roll. */
  phoridDie: 'at.phDie',
  phoridRoll: 'at.phRoll',
  /** Cut time chosen for the current cut, game s. */
  cutS: 'at.cutS',
  /** Hitchhiker riding this carrier's fragment (ant id, -1 none). */
  rider: 'at.rider',
  /** Laden walk distance so far, mm (hitchhikers board fragments carried >= 100 BU). */
  ladenMm: 'at.laden',
  lastX: 'at.lx',
  lastZ: 'at.lz',
  /** Cutter: tick before which no new trip starts (a failed trip backs off); cell-clear tries and wander centre. */
  retry: 'at.retry',
  clears: 'at.clr',
  cx: 'at.cx',
  cz: 'at.cz',
} as const;

/** Gardener jobs. */
export const GJ = { none: 0, tend: 1, weed: 2, process: 3, plant: 4, waste: 5, piece: 6, harvest: 7 } as const;

/** Tending and weeding gardeners per chamber (minims and small media; processors and haulers do not tend). */
export function gardenWorkers(sim: Sim, col: Colony): Map<number, { gardeners: number; weeders: number }> {
  const m = new Map<number, { gardeners: number; weeders: number }>();
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || a.task !== 'garden' || a.chamberId < 0) continue;
    const job = a.bb[AK.job] ?? 0;
    if (job !== GJ.tend && job !== GJ.weed && job !== GJ.plant && job !== GJ.harvest) continue;
    const e = m.get(a.chamberId) ?? { gardeners: 0, weeders: 0 };
    e.gardeners++;
    if (job === GJ.weed) e.weeders++;
    m.set(a.chamberId, e);
  }
  return m;
}

/** The player's opening is still running (before the hand-over). */
export function openingRunning(sim: Sim, col: Colony): boolean {
  if (!col.isPlayer) return false;
  const op = sim.state.player.opening;
  return !!op && !op.done && op.phase !== 'handover' && op.phase !== 'done' && op.phase !== 'failed';
}

/** Whether this garden is the founding garden under the queen's care (GDD 07 §6.4.8). */
export function isFoundingGarden(sim: Sim, col: Colony, _g: GardenRecord): boolean {
  return openingRunning(sim, col);
}

/** A worker of a caste that cuts leaves (media or major; GDD 07 §6.4.6 stage 1). */
export function cutsLeaves(a: Pick<Ant, 'caste'>): boolean {
  return a.caste === 'media' || a.caste === 'major';
}

/** Small media (GDD 07 §5.4.1: media under 0.8 BU). */
export function isSmallMedia(a: Pick<Ant, 'caste' | 'lengthBu'>): boolean {
  return a.caste === 'media' && a.lengthBu < 0.8;
}
