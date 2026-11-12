// Walking speed composition. Locomotion does not compute physiology: it reads the inputs other modules own
// (body temperature -> environment's speedMult, health, carried load, callow flag, caste speeds from species data)
// and multiplies them as GDD 02 §1.6 (AI) and GDD 01 §4.2 (possessed ant) prescribe. Modules with their own
// spatial multipliers (nest crowding and squeezes, wet films, sticky food) register a factor with
// registerSpeedFactor instead of being imported here.

import type { Ant, ColonySpeciesId, Sim, Walker } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { HEALTH_FACTOR_BASE } from '@/sim/balance/actions';
import { speedMult as speedMultImp } from '@/sim/environment/thermalResponse';
import { getRivalSpecies, getSpecies } from '@/sim/species';
import { locoParams, type LocoParams } from './params';
import type { NavScratch } from './scratch';

const speedMult = speedMultImp;

/** Extra speed multiplier for a walker (1 = none); registered per sim by other modules. */
export type SpeedFactor = (sim: Sim, w: Walker) => number;

const factors = new WeakMap<Sim, SpeedFactor[]>();

/** Registers a speed factor for this sim (e.g. the nest module's crowding and squeeze multipliers, GDD 03 §5, §10). */
export function registerSpeedFactor(sim: Sim, f: SpeedFactor): () => void {
  let list = factors.get(sim);
  if (!list) { list = []; factors.set(sim, list); }
  list.push(f);
  return () => { const l = factors.get(sim); if (l) l.splice(l.indexOf(f) >>> 0, 1); };
}

function hookFactor(sim: Sim, w: Walker): number {
  const list = factors.get(sim);
  if (!list) return 1;
  let m = 1;
  for (let i = 0; i < list.length; i++) m *= list[i](sim, w);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

interface CasteSpeeds { cruise: number; sprint: number; load: number }
const casteCache = new Map<string, CasteSpeeds>();

/**
 * Cruise, sprint (mm/s, world) and loaded multiplier of a species' caste (cached; species data are static). The
 * queen caste's data are the established queen's (QUEEN_SPEED is in its cruiseMult); a founding dealate walks
 * like a worker (00-index E-12: cruise 6, hurry 9.6 BU/s for Lasius), so `founding` reads the worker caste.
 */
export function casteSpeeds(species: ColonySpeciesId, caste: string, worldBu: number, founding = false): CasteSpeeds {
  const key = `${species}|${caste}|${worldBu}|${founding ? 1 : 0}`;
  const hit = casteCache.get(key);
  if (hit) return hit;
  const def = getSpecies(species);
  let out: CasteSpeeds;
  if (def) {
    const look = founding && caste === 'queen' ? 'worker' : caste;
    const cd = def.castes.find((c) => c.caste === look) ?? def.castes.find((c) => c.caste === caste);
    const bu = def.buMm;
    out = { cruise: def.cruiseBuS * (cd ? cd.cruiseMult : 1) * bu, sprint: (cd ? cd.sprintBuS : 0) * bu, load: def.loadSpeedMult };
  } else {
    const r = getRivalSpecies(species);
    const cruise = r ? r.cruiseMmS : locoParams(worldBu).creature;
    out = { cruise, sprint: 2 * cruise, load: 1 };
  }
  if (!(out.sprint > 0)) out.sprint = locoParams(worldBu).run;
  casteCache.set(key, out);
  return out;
}

function speciesOf(sim: Sim, ant: Ant): ColonySpeciesId {
  const c = sim.stores.colonies.get(ant.colony);
  return c ? c.species : sim.species.id;
}

/** Health factor of movement (GDD 02 §1.5): 0.5 + 0.5 health below full health. */
export function healthSpeedFactor(ant: Ant): number {
  const h = ant.maxHp > 0 ? ant.hp / ant.maxHp : 1;
  return h >= 1 ? 1 : HEALTH_FACTOR_BASE + (1 - HEALTH_FACTOR_BASE) * Math.max(0, h);
}

/** Temperature factor (GDD 06 §2.6 speedMult(Tb) = GDD 01 tempFactor). */
export function tempSpeedFactor(sim: Sim, ant: Ant): number {
  return speedMult(sim, ant.tb, speciesOf(sim, ant));
}

function isAnt(w: Walker): w is Ant {
  return typeof (w as Ant).caste === 'string';
}

/** AI walking speed this tick, mm/s (GDD 02 §1.6). */
export function aiSpeed(sim: Sim, w: Walker, s: NavScratch, P: LocoParams): number {
  if (s.speedKind === 'fixed') return Math.max(0, s.speedFixed);
  if (!isAnt(w)) return P.creature * s.speedMult * hookFactor(sim, w);
  const cs = casteSpeeds(speciesOf(sim, w), w.caste, P.bu, (w.flags & AntFlag.FOUNDING) !== 0);
  let v = (s.speedKind === 'run' ? cs.sprint : cs.cruise) * s.speedMult;
  v *= tempSpeedFactor(sim, w) * healthSpeedFactor(w);
  if (w.carry.kind !== 'none') v *= cs.load;
  if ((w.flags & AntFlag.CALLOW) !== 0) v *= P.callow;
  return v * hookFactor(sim, w);
}

/**
 * Possessed ant speed, mm/s (GDD 01 §4.2): cruise x tempFactor' x health x load, x hurry (never above the
 * caste's sprint), x grip. tempFactor' = max(PLAYER_TEMP_FLOOR, tempFactor) while tempFactor > 0; at 0 the ant
 * crawls at 0.25 x cruise.
 */
export function playerSpeed(sim: Sim, ant: Ant, hurry: boolean, gripping: boolean, P: LocoParams): number {
  const cs = casteSpeeds(speciesOf(sim, ant), ant.caste, P.bu, (ant.flags & AntFlag.FOUNDING) !== 0);
  const t = tempSpeedFactor(sim, ant);
  if (!(t > 0)) return cs.cruise * P.coldCrawl;
  const floor = sim.state.config.difficulty.params.playerTempFloor;
  let v = cs.cruise * Math.max(floor, t) * healthSpeedFactor(ant);
  if (ant.carry.kind !== 'none') v *= cs.load;
  if (hurry) v = Math.min(v * P.hurryMult, Math.max(cs.sprint, v));
  if (gripping) v *= P.gripSpeedMult;
  return v * hookFactor(sim, ant);
}
