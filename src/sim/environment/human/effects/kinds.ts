// What each impact does (GDD 04 §15.4), by contact. Food goes through the ecology module's runtime creation
// functions, pheromones through the pheromone module, deaths through combat's applyDamage (cause `crushed`).

import { rngChance, rngRange } from '@/core/rng';
import type { HumanEventRun, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { createSource, spawnHumanFood } from '@/sim/ecology';
import {
  BROOM_COLLECT_P, BROOM_DEATH_P, BROOM_DISPLACE_MM, BROOM_ITEM_BU, BROOM_PUSH_MM, BROOM_TUMBLE_S, CAR_ITEM_BU, CAR_ITEM_REMOVE_P,
  CHILD_CAVE_IN_BU, CHILD_CAVE_IN_P, CHILD_CRATER_SHARE, CHILD_HEAP_R_MULT, CHILD_HEAP_SHARE, CHILD_SAND_DELTA_MM, CHILD_SCOOP_ALIVE_P,
  CHILD_SCOOP_STUN_S, CRUSH_STUN_S, DROP_BIG_BU, DROP_KILL_P, DROP_STUN_S, FOOT_ITEM_BU, FOOT_ITEM_REMOVE_P, FOOT_ITEM_SCATTER_BU,
  FOOT_PRINT_MM, FOOT_PRINT_SAND_MM, MOW_ABOVE_CUT_P, MOW_CUT_MM, MOW_REACH_ABOVE_MM, MOW_TUMBLE_BU, MOW_TUMBLE_P, MOW_WHEEL_W_MM,
  PET_BOWL_REFILL_MM, SPILL_AFLOAT_P, SPILL_STUN_S, TUMBLE_STUN_S, VACUUM_CREVICE_P, VACUUM_HEAD_CLEAR_MM, VACUUM_ITEM_BU,
  VACUUM_MOUTH_REACH_BU, VACUUM_REACH_PROBE_MM, VACUUM_REMOVE_P, VACUUM_STUN_S, VACUUM_WALL_BU, WATER_ANT_AREA_BU2, WATER_DISLODGE_P,
  WATER_DROP_MULT, WATER_DROPS_M2_S, WATER_FRONT_EVERY_S, WATER_REACH_ABOVE_MM, WATER_STEM_MIN_BU, WIPE_FOOD_P, WIPE_ITEM_BU,
  WIPE_REMOVE_P, WIPE_SHOVE_MM, WIPE_STUN_S,
} from '@/sim/balance/human';
import { surfaceClass, surfaceY } from '../ground';
import { footprintRadius, type Footprint, type HumanPlan, type Impact } from '../plan';
import { lethalP } from '../rules';
import { siteById } from '../sites';
import {
  antGround, antsIn, contactPlane, displaceAnt, humanRng, isGripping, lethalHit, randomShove, shelteredBelow, stunAnt,
} from './common';
import { crushAnts, disturbItems, isPickSource, removeSources, wipeFootprint } from './ground';
import { mowGrass } from './grass';
import { placeBaitStation } from './bait';
import { addWithin, deformDisc, footprintOnSoil } from './terrain';

const g: Vec3 = { x: 0, y: 0, z: 0 };
const UP: Vec3 = { x: 0, y: 1, z: 0 };
const nozzle: Vec3 = { x: 0, y: 0, z: 0 };

/** Applies one impact of a run. */
export function applyImpact(sim: Sim, run: HumanEventRun, plan: HumanPlan, planned: Impact): void {
  const floorY = siteById(sim.world, plan.siteId)?.y ?? NaN;
  // plans carry static heights (identical after a load); falling things land on the live surface
  const live = planned.contact === 'drop' || planned.contact === 'spill' || planned.contact === 'water' || planned.contact === 'scoop' || planned.contact === 'bait';
  const imp = live ? { ...planned, fp: { ...planned.fp, y: surfaceY(sim, planned.fp.x, planned.fp.z, planned.fp.y) } } : planned;
  switch (imp.contact) {
    case 'adult-shoe': case 'child-shoe': case 'paw': return footfall(sim, run, imp, floorY);
    case 'tyre': return tyre(sim, run, imp);
    case 'mower-deck': return mowerDeck(sim, run, imp);
    case 'broom': return broom(sim, run, imp, floorY);
    case 'wipe': return wipe(sim, run, imp);
    case 'vacuum': case 'vacuum-crevice': return vacuum(sim, run, imp, floorY);
    case 'drop': return drop(sim, run, plan, imp);
    case 'spill': return spill(sim, run, plan, imp);
    case 'water': return water(sim, run, plan, imp);
    case 'scoop': return scoop(sim, run, imp);
    case 'bait': placeBaitStation(sim, imp.fp); return;
    default: return;
  }
}

function footfall(sim: Sim, run: HumanEventRun, imp: Impact, floorY: number): void {
  const fp = imp.fp, plane = contactPlane(sim, fp, floorY), bu = sim.world.bu;
  crushAnts(sim, run, fp, plane, imp.contact as 'adult-shoe' | 'child-shoe' | 'paw', CRUSH_STUN_S, floorY);
  disturbItems(sim, run, fp, plane, FOOT_ITEM_BU, FOOT_ITEM_REMOVE_P, [FOOT_ITEM_SCATTER_BU[0] * bu, FOOT_ITEM_SCATTER_BU[1] * bu], 'footsteps');
  wipeFootprint(sim, fp, plane, 'footsteps');
  g.x = fp.x; g.y = plane; g.z = fp.z;
  const cls = surfaceClass(sim, g);
  const soil = cls === 'sand' || cls === 'soft';
  footprintOnSoil(sim, fp, cls === 'sand' ? FOOT_PRINT_SAND_MM : FOOT_PRINT_MM, soil && Number.isNaN(floorY));
}

function tyre(sim: Sim, run: HumanEventRun, imp: Impact): void {
  const fp = imp.fp, plane = contactPlane(sim, fp);
  crushAnts(sim, run, fp, plane, 'tyre');
  disturbItems(sim, run, fp, plane, CAR_ITEM_BU, CAR_ITEM_REMOVE_P, null, 'car');
  wipeFootprint(sim, fp, plane, 'car');
}

function mowerDeck(sim: Sim, run: HumanEventRun, imp: Impact): void {
  const fp = imp.fp, plane = contactPlane(sim, fp), rng = humanRng(sim), bu = sim.world.bu;
  // wheel tracks along both sides of the deck; above the cut height the blades; the rest may be tumbled
  const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
  const wheelBand = fp.hz - MOW_WHEEL_W_MM;
  const wheels = { ...fp, hz: MOW_WHEEL_W_MM / 2 };
  for (const side of [-1, 1]) {
    const off = side * (fp.hz - MOW_WHEEL_W_MM / 2);
    crushAnts(sim, run, { ...wheels, x: fp.x - s * off, z: fp.z + c * off }, plane, 'mower-wheel');
  }
  for (const ant of antsIn(sim, fp, plane, MOW_REACH_ABOVE_MM)) {
    if (!ant.alive || shelteredBelow(sim, ant, plane)) continue;
    const v = -(ant.pos.x - fp.x) * s + (ant.pos.z - fp.z) * c;
    if (Math.abs(v) > wheelBand) continue;
    const h = antGround(ant, g).y - surfaceY(sim, ant.pos.x, ant.pos.z);
    if (h > MOW_CUT_MM) lethalHit(sim, run, ant, lethalP(sim, MOW_ABOVE_CUT_P), CRUSH_STUN_S);
    else if (rngChance(rng, MOW_TUMBLE_P) && !isGripping(sim, ant)) {
      const sh = randomShove(rng, MOW_TUMBLE_BU[0] * bu, MOW_TUMBLE_BU[1] * bu);
      displaceAnt(sim, run, ant, sh.dx, sh.dz);
      stunAnt(sim, ant, TUMBLE_STUN_S);
    }
  }
  mowGrass(sim, run, fp, plane);
  wipeFootprint(sim, fp, plane, 'mowing');
}

function broom(sim: Sim, run: HumanEventRun, imp: Impact, floorY: number): void {
  const fp = imp.fp, plane = contactPlane(sim, fp, floorY), rng = humanRng(sim);
  const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
  for (const ant of antsIn(sim, fp, plane, 3 * sim.world.bu)) {
    if (shelteredBelow(sim, ant, plane, floorY)) continue;
    if (lethalHit(sim, run, ant, lethalP(sim, BROOM_DEATH_P), BROOM_TUMBLE_S)) continue;
    const d = rngRange(rng, BROOM_DISPLACE_MM[0], BROOM_DISPLACE_MM[1]);
    displaceAnt(sim, run, ant, c * d, s * d);
  }
  const moved = disturbItems(sim, run, fp, plane, BROOM_ITEM_BU, 0, BROOM_PUSH_MM, 'sweeping', fp.yaw);
  run.touched = [...(run.touched ?? []), ...moved.filter((id) => !(run.touched ?? []).includes(id))];
  removeSources(sim, run, fp, BROOM_COLLECT_P, 'swept', isPickSource);
  wipeFootprint(sim, fp, plane, 'broom');
}

function wipe(sim: Sim, run: HumanEventRun, imp: Impact): void {
  const fp = imp.fp, plane = fp.y, rng = humanRng(sim), bu = sim.world.bu;
  for (const ant of antsIn(sim, fp, plane, 2 * bu)) {
    if (antGround(ant, g).y < plane - bu) continue;
    if (lethalHit(sim, run, ant, lethalP(sim, WIPE_REMOVE_P), WIPE_STUN_S)) continue;
    const sh = randomShove(rng, WIPE_SHOVE_MM[0], WIPE_SHOVE_MM[1]);
    displaceAnt(sim, run, ant, sh.dx, sh.dz);
  }
  disturbItems(sim, run, fp, plane, WIPE_ITEM_BU, WIPE_FOOD_P, null, 'wiped');
  removeSources(sim, run, fp, WIPE_FOOD_P, 'wiped', () => true);
  wipeFootprint(sim, fp, plane, 'wipe');
}

/**
 * The nozzle cannot reach the ant: something solid within VACUUM_HEAD_CLEAR_MM above it (under an appliance), or a
 * solid between the nozzle and the ant at floor level (a plinth closing a kick-space void, a wall).
 */
function outOfReach(sim: Sim, fp: Footprint, plane: number, x: number, y: number, z: number): boolean {
  g.x = x; g.y = y + 2; g.z = z;
  if (sim.field.sphereTrace(g, UP, VACUUM_HEAD_CLEAR_MM, 0) < VACUUM_HEAD_CLEAR_MM) return true;
  nozzle.x = fp.x; nozzle.y = plane + VACUUM_REACH_PROBE_MM; nozzle.z = fp.z;
  g.y = y + VACUUM_REACH_PROBE_MM * 0.5;
  return sim.field.sample(nozzle) > 0 && !sim.field.segmentFree(nozzle, g, 0.5);
}

function vacuum(sim: Sim, run: HumanEventRun, imp: Impact, floorY: number): void {
  const fp = imp.fp, bu = sim.world.bu;
  const plane = Number.isFinite(floorY) ? floorY : fp.y;
  const crevice = imp.contact === 'vacuum-crevice';
  const mouths = crevice ? sim.world.micro.filter((m) => m.kind === 'skirting-gap').flatMap((m) => [m.posA, m.posB]) : [];
  for (const ant of antsIn(sim, fp, plane, 3 * bu)) {
    if (shelteredBelow(sim, ant, plane, floorY)) continue;
    const gp = antGround(ant, g);
    if (gp.y > plane + VACUUM_WALL_BU * bu) continue; // on a wall or a cabinet front
    const nearMouth = mouths.some((m) => Math.hypot(m.x - ant.pos.x, m.z - ant.pos.z) <= bu * VACUUM_MOUTH_REACH_BU);
    if (outOfReach(sim, fp, plane, ant.pos.x, gp.y, ant.pos.z) && !nearMouth) continue;
    lethalHit(sim, run, ant, lethalP(sim, nearMouth ? VACUUM_CREVICE_P : VACUUM_REMOVE_P), VACUUM_STUN_S);
  }
  disturbItems(sim, run, fp, plane, VACUUM_ITEM_BU, 1, null, 'vacuumed');
  removeSources(sim, run, fp, 1, 'vacuumed', (s) => isPickSource(s) && Math.abs(s.pos.y - plane) < 2 * bu);
  wipeFootprint(sim, { ...fp, y: plane }, plane, 'vacuum');
}

function drop(sim: Sim, run: HumanEventRun, plan: HumanPlan, imp: Impact): void {
  const fp = imp.fp, bu = sim.world.bu;
  const sizeMm = plan.actors[imp.actor]?.scale ?? 3;
  for (const ant of antsIn(sim, { ...fp, hx: Math.max(fp.hx, sizeMm), hz: Math.max(fp.hz, sizeMm) }, fp.y, 2 * bu)) {
    if (sizeMm > DROP_BIG_BU * bu && lethalHit(sim, run, ant, lethalP(sim, DROP_KILL_P), DROP_STUN_S)) continue;
    stunAnt(sim, ant, DROP_STUN_S);
  }
  if (imp.value <= 0) return;
  const pos = { x: fp.x, y: fp.y, z: fp.z };
  const v = plan.variant;
  if (v === 'pet-feed') {
    createSource(sim, { variant: 'kibble', pos, tier: 2 });
    refillWater(sim, fp.x, fp.z, PET_BOWL_REFILL_MM);
  } else if (v === 'sweets' || plan.kind === 'children') spawnHumanFood(sim, 'children', pos); // a session's sweets drop
  else spawnHumanFood(sim, 'food-drop', pos);
}

function refillWater(sim: Sim, x: number, z: number, r: number): void {
  const levels = sim.state.worldDelta.waterLevels;
  sim.world.waterBodies.forEach((w, i) => {
    if (Math.hypot(w.pos.x - x, w.pos.z - z) <= r + w.radius) levels[i] = w.capMm;
  });
}

function spill(sim: Sim, run: HumanEventRun, plan: HumanPlan, imp: Impact): void {
  const fp = imp.fp, rng = humanRng(sim), bu = sim.world.bu;
  for (const ant of antsIn(sim, fp, fp.y, 2 * bu)) {
    if (shelteredBelow(sim, ant, fp.y)) continue;
    // afloat (GDD 04 §13.3): the ant is held in the film; locomotion's afloat drift is not reachable from here
    stunAnt(sim, ant, rngChance(rng, SPILL_AFLOAT_P) ? SPILL_STUN_S.afloat : SPILL_STUN_S.splashed);
  }
  const pos = { x: fp.x, y: fp.y, z: fp.z };
  if (plan.variant === 'water') createSource(sim, { variant: 'water', pos, tier: 2 });
  else createSource(sim, { variant: 'sugary-spill', pos, tier: 2, spillMm: imp.value });
  wipeFootprint(sim, fp, fp.y, 'spill');
}

function water(sim: Sim, run: HumanEventRun, plan: HumanPlan, imp: Impact): void {
  const fp = imp.fp, bu = sim.world.bu, rng = humanRng(sim);
  if (imp.value === 1) {
    // the whole wetted area: pheromones washed, saucers / bowls / buckets inside filled
    wipeFootprint(sim, fp, fp.y, 'watering');
    refillWater(sim, fp.x, fp.z, footprintRadius(fp));
    return;
  }
  const variant = (plan.variant ?? 'sprinkler') as keyof typeof WATER_DROP_MULT;
  const rate = WATER_DROPS_M2_S * WATER_DROP_MULT[variant];
  const area = (WATER_ANT_AREA_BU2 * bu * bu) / 1e6;
  const pHit = 1 - Math.exp(-rate * area * WATER_FRONT_EVERY_S); // drops landing on the ant during one front step
  for (const ant of antsIn(sim, fp, fp.y, WATER_REACH_ABOVE_MM)) {
    if (shelteredBelow(sim, ant, fp.y) || isGripping(sim, ant)) continue;
    const gp = antGround(ant, g);
    if (gp.y - surfaceY(sim, gp.x, gp.z) < WATER_STEM_MIN_BU * bu) continue; // only ants on stems and leaves are knocked off
    if (rngChance(rng, pHit) && rngChance(rng, WATER_DISLODGE_P)) {
      const sh = randomShove(rng, bu, 3 * bu);
      displaceAnt(sim, run, ant, sh.dx, sh.dz);
      stunAnt(sim, ant, TUMBLE_STUN_S);
    }
  }
}

function scoop(sim: Sim, run: HumanEventRun, imp: Impact): void {
  const fp = imp.fp, rng = humanRng(sim), bu = sim.world.bu;
  const a = rngRange(rng, 0, Math.PI * 2), throwMm = imp.value;
  for (const ant of antsIn(sim, fp, fp.y, 3 * bu)) {
    if (ant.nestId >= 0) continue;
    if (lethalHit(sim, run, ant, lethalP(sim, 1 - CHILD_SCOOP_ALIVE_P), CHILD_SCOOP_STUN_S)) continue;
    displaceAnt(sim, run, ant, Math.cos(a) * throwMm, Math.sin(a) * throwMm);
  }
  const r = fp.hx;
  const sand = addWithin(CHILD_SAND_DELTA_MM);
  deformDisc(sim, fp.x, fp.z, r, (d) => -CHILD_SAND_DELTA_MM * CHILD_CRATER_SHARE * (1 - d * d), 'children', sand);
  deformDisc(sim, fp.x + Math.cos(a) * throwMm, fp.z + Math.sin(a) * throwMm, r * CHILD_HEAP_R_MULT,
    (d) => CHILD_SAND_DELTA_MM * CHILD_HEAP_SHARE * (1 - d * d), 'children', sand);
  // nest chambers under the dug sand may cave in (the nest module resolves world.cave-in)
  const near = sim.state.nests.some((n) => n.chambers.some((c) => Math.hypot(c.center.x - fp.x, c.center.z - fp.z) <= CHILD_CAVE_IN_BU * bu + r));
  if (near && rngChance(rng, CHILD_CAVE_IN_P)) sim.emit({ type: 'world.cave-in', center: { x: fp.x, y: fp.y, z: fp.z }, radiusBu: CHILD_CAVE_IN_BU, cause: 'children' });
}

