// Runtime hooks into locomotion, installed lazily on the first creature tick of a Sim (derived, never persisted;
// a loaded game installs them again on its first tick):
//  - movement override: an ant seized (or carried) by a creature rides at the creature's mouth; a paralysed ant
//    stays put; an antlion flick displaces an ant downslope (pending displacements live only within one tick);
//  - speed factor: x0.4 moving upslope inside an antlion pit, x0.7 on a snail's slime trail (only for ants on the
//    hazard's surface, not in tunnels underneath or on a stem above).

import type { Ant, Creature, Sim, Walker } from '@/sim/types';
import { ANTLION_UPSLOPE_MULT, HAZARD_SURFACE_TOL_BU, SLIME_SPEED_MULT } from '@/sim/balance/creatures';
import { ports } from './ports';

const installed = new WeakSet<Sim>();
/** Flick displacements to apply in this tick's locomotion step: ant id -> target point (mm). */
const pending = new WeakMap<Sim, Map<number, { x: number; y: number; z: number }>>();

function isAnt(w: Walker): w is Ant {
  return typeof (w as Ant).caste === 'string';
}

export function ensureHooks(sim: Sim): void {
  if (installed.has(sim)) return;
  installed.add(sim);
  ports.registerMovementOverride(sim, (s, w) => (isAnt(w) ? overrideAnt(s, w) : false));
  ports.registerSpeedFactor(sim, (s, w) => hazardSpeedMult(s, w));
}

/** Queues an antlion flick: the ant is moved to `to` (re-projected onto the surface) in this tick's locomotion. */
export function queueDisplacement(sim: Sim, antId: number, to: { x: number; y: number; z: number }): void {
  let m = pending.get(sim);
  if (!m) { m = new Map(); pending.set(sim, m); }
  m.set(antId, { x: to.x, y: to.y, z: to.z });
}

/** Clears displacements not consumed in the tick (an ant that was not stepped). Called at the start of a tick. */
export function clearDisplacements(sim: Sim): void {
  pending.get(sim)?.clear();
}

function overrideAnt(sim: Sim, ant: Ant): boolean {
  const cs = ant.combat;
  if (cs && cs.seizedBy >= 0) {
    const c = sim.stores.creatures.get(cs.seizedBy);
    if (c && c.seizedAntId === ant.id) { holdAtMouth(c, ant); return true; }
  }
  if (cs && cs.paralysedUntilTick > sim.state.tick) {
    ant.speed = 0;
    return true;
  }
  const m = pending.get(sim);
  const to = m?.get(ant.id);
  if (to) {
    m!.delete(ant.id);
    if (ports.placeOnSurface(sim, ant, to)) return true;
  }
  return false;
}

/** The held ant sits just in front of the creature, on its surface frame. */
function holdAtMouth(c: Creature, ant: Ant): void {
  const reach = c.radius + 0.5 * ant.radius;
  ant.pos.x = c.pos.x + c.fwd.x * reach;
  ant.pos.y = c.pos.y + c.fwd.y * reach;
  ant.pos.z = c.pos.z + c.fwd.z * reach;
  ant.up.x = c.up.x; ant.up.y = c.up.y; ant.up.z = c.up.z;
  ant.fwd.x = -c.fwd.x; ant.fwd.y = -c.fwd.y; ant.fwd.z = -c.fwd.z;
  ant.speed = c.speed;
  ant.medium = c.medium === 'air' ? 'surface' : c.medium;
}

/**
 * Speed factor of the hazards under an ant. Only an ant walking on the hazard's own surface is slowed: outside the
 * nest, on a surface (not falling), its feet within HAZARD_SURFACE_TOL_BU of the slime or between the pit's rim and
 * floor. Ants in tunnels underneath, or on a stem above a trail, walk at full speed.
 */
function hazardSpeedMult(sim: Sim, w: Walker): number {
  const hz = sim.state.ecology.hazards;
  if (hz.length === 0 || !isAnt(w) || w.nestId >= 0 || w.medium !== 'surface') return 1;
  const tol = HAZARD_SURFACE_TOL_BU * sim.world.bu;
  const feetY = w.pos.y - w.up.y * w.footOffset;
  let m = 1;
  for (let i = 0; i < hz.length; i++) {
    const h = hz[i];
    const dx = w.pos.x - h.pos.x, dz = w.pos.z - h.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > h.radius * h.radius) continue;
    if (h.kind === 'slime-trail') {
      if (Math.abs(feetY - h.pos.y) <= tol) m *= SLIME_SPEED_MULT;
    } else if (h.kind === 'antlion-pit' && h.state !== 'collapsed') {
      const onSlope = feetY <= h.pos.y + tol && feetY >= h.pos.y - h.depth - tol;
      // upslope = heading away from the pit centre
      if (onSlope && dx * w.fwd.x + dz * w.fwd.z > 0) m *= ANTLION_UPSLOPE_MULT;
    }
  }
  return m;
}
