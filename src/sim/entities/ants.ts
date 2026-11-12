// Ant creation and death. spawnAnt is the only way ants come into existence.

import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngGauss } from '@/core/rng';
import { clamp } from '@/core/math/scalar';
import type { AgeBand, Ant, Caste, CasteDef, DeathCause, QueenState, Task } from '@/sim/types';
import { AntFlag, TASK_COUNT, TASKS } from '@/sim/types';
import {
  AGE_MID_MAX_GD, AGE_YOUNG_MAX_GD, CALLOW_GD, DEFAULT_ARRIVE_BU, DEFAULT_LIFESPAN_GD, FECUNDITY_MAX,
  FECUNDITY_MEAN, FECUNDITY_MIN, FECUNDITY_SD, FOOT_OFFSET_BU, LIFESPAN_MAX_FRAC, LIFESPAN_MIN_FRAC,
  RESERVE_CAP_BY_BAND, SPAWN_TB_C, THETA_BASE, THETA_NEVER, WALKER_RADIUS_PER_LENGTH,
} from '@/sim/balance';
import { getSpecies } from '@/sim/species';
import { daysPerYear } from '@/sim/time';
import { casteDef, getAntStats } from './antStats';
import { allocId, worldBu, type EntityCtx } from './context';
import { newAntMemory, newWalker } from './walker';
import { copyV, v3 } from './util';

export interface SpawnAntOptions {
  colony: number;
  caste: Caste;
  /** On the surface (or cavity wall), mm. The walker is lifted by its foot offset along `up`. */
  pos: Vec3;
  up?: Vec3;
  fwd?: Vec3;
  task?: Task;
  /** Body length in the species' own BU; drawn from the caste's triangular distribution when omitted. */
  lengthBu?: number;
  /** Physiological age at spawn, game days (0 = just eclosed). */
  ageGd?: number;
  nestId?: number;
  chamberId?: number;
  /** Extra AntFlag bits. */
  flags?: number;
  /** Founding queen (claustral reserves, FOUNDING flag). */
  founding?: boolean;
}

/** Triangular distribution sample from a uniform u in [0, 1). */
function triangular(min: number, mode: number, max: number, u: number): number {
  if (max <= min) return mode;
  const f = (mode - min) / (max - min);
  return u < f ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/** Piecewise-linear lookup in [x, y] pairs, clamped at both ends. */
function curveAt(curve: [number, number][], x: number): number {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Lifespan draw in game days: normal around the (colony-size dependent) mean, clamped. */
function drawLifespanGd(ctx: EntityCtx, cd: CasteDef | undefined, colonySize: number): number {
  if (!cd) return DEFAULT_LIFESPAN_GD;
  const mean = cd.lifespanBySize.length > 0 ? curveAt(cd.lifespanBySize, colonySize) : cd.lifespanGd.mean;
  return clamp(rngGauss(ctx.state.rng, mean, cd.lifespanGd.sd), mean * LIFESPAN_MIN_FRAC, mean * LIFESPAN_MAX_FRAC);
}

/** Age band of a physiological age (GDD 02 §1.3). */
export function ageBandOf(physioAgeGd: number): AgeBand {
  if (physioAgeGd < CALLOW_GD) return 'callow';
  if (physioAgeGd < AGE_YOUNG_MAX_GD) return 'young';
  return physioAgeGd < AGE_MID_MAX_GD ? 'mid' : 'old';
}

/**
 * Queen extras. A founding queen holds everything in the single reserve pool R0 (GDD 06 model, E-19); `reserve`
 * and `reserveP` start empty and are filled by the hand-over split (E-21).
 */
function newQueenState(ctx: EntityCtx, founding: boolean, R0: number): QueenState {
  const rng = ctx.state.rng;
  return {
    mode: founding ? 'founding' : 'established', gut: { c: 0, p: 0 }, reserve: 0, reserveP: 0,
    fecundity: clamp(rngGauss(rng, FECUNDITY_MEAN, FECUNDITY_SD), FECUNDITY_MIN, FECUNDITY_MAX),
    eggBudget: 0, layingLog: new Int16Array(daysPerYear(ctx.state.config)), clutchLaid: 0,
    founding: founding ? { reserveLoads: R0, R0, desiccation: 0, wings: true, eggsLaid: 0 } : null, // dealation is an opening phase
  };
}

export function spawnAnt(ctx: EntityCtx, o: SpawnAntOptions): Ant {
  const { state } = ctx;
  const colony = ctx.stores.colonies.get(o.colony);
  const def = colony ? getSpecies(colony.species) : undefined;
  const cd = casteDef(def, o.caste);
  const bu = worldBu(ctx);
  const rng = state.rng;
  const founding = o.founding === true;
  const ownLength = o.lengthBu ?? (cd ? triangular(cd.lengthBu.min, cd.lengthBu.mean, cd.lengthBu.max, rngFloat(rng)) : undefined);
  const stats = colony ? getAntStats(ctx, colony.species, o.caste, ownLength, founding) : getAntStats(ctx, state.config.species, o.caste, ownLength, founding);
  const lengthBu = stats.lengthBu;
  const lifespanGd = drawLifespanGd(ctx, cd, colony ? colony.livingAnts : 0);
  const ageGd = o.ageGd ?? 0;
  const up = o.up ?? v3(0, 1, 0);
  const fwd = o.fwd ?? v3(1, 0, 0);
  const foot = FOOT_OFFSET_BU * bu;
  const pos = { x: o.pos.x + up.x * foot, y: o.pos.y + up.y * foot, z: o.pos.z + up.z * foot };
  const thresholds = new Float32Array(TASK_COUNT);
  for (let i = 0; i < TASK_COUNT; i++) {
    const w = cd?.taskWeights[TASKS[i]];
    thresholds[i] = w === 0 ? THETA_NEVER : THETA_BASE;
  }
  let flags = o.flags ?? 0;
  if (founding) flags |= AntFlag.FOUNDING;
  if (o.caste === 'gyne' || o.caste === 'male') flags |= AntFlag.WINGED;
  const walker = newWalker(pos, up, fwd, foot, WALKER_RADIUS_PER_LENGTH * lengthBu * bu, DEFAULT_ARRIVE_BU * bu);
  const ant: Ant = {
    ...walker,
    id: allocId(state), alive: true, colony: o.colony, caste: o.caste,
    bornTick: state.tick, lifespanGd, physioAgeGd: ageGd,
    hp: stats.maxHp, maxHp: stats.maxHp, cropC: 0, cropP: 0, cropCap: stats.cropCap, carryCap: stats.carryCap,
    energy: RESERVE_CAP_BY_BAND[ageBandOf(ageGd)], fatigue: 0, lengthBu, massMg: stats.massMg, sizeClass: null,
    carry: { kind: 'none', id: -1 }, task: o.task ?? 'idle', taskTick: state.tick, suspendedTask: null,
    state: 'idle', stateTick: state.tick, target: { kind: 'none', id: -1, pos: copyV(pos) }, action: null,
    mem: newAntMemory(), nestId: o.nestId ?? -1, chamberId: o.chamberId ?? -1, combat: null, flags, pose: 0,
    thinkTick: state.tick, bb: {}, thresholds, activation: 0, tb: SPAWN_TB_C, heatLoad: 0, coldLoad: 0,
    thermalState: 'normal', acid: def?.combat.acid?.max ?? 0, acidRegenTick: 0, layCooldownUntilTick: 0, injuries: 0,
    alarmLevel: 0, dirt: 0,
    queen: o.caste === 'queen' ? newQueenState(ctx, founding, def ? def.opening.R0 : 0) : null,
    alate: o.caste === 'gyne' || o.caste === 'male' ? { state: 'callow-alate', flightPhase: null, flightEnergy: 1, mating: 0 } : null,
  };
  ctx.stores.ants.add(ant);
  if (colony) colony.livingAnts++;
  ctx.emit({ type: 'entity-created', entity: 'ant', id: ant.id });
  return ant;
}

/**
 * Kills an ant: drops what it carries where it stands, ends possession, flags it dead (swept at the end of the
 * tick) and queues `ant-died`. Corpse items and colony bookkeeping belong to the lifecycle/colony modules.
 * Returns false if the ant was already dead or unknown.
 */
export function killAnt(ctx: EntityCtx, id: number, cause: DeathCause): boolean {
  const ant = ctx.stores.ants.get(id);
  if (!ant) return false;
  if (ant.carry.kind === 'item') {
    const it = ctx.stores.items.get(ant.carry.id);
    if (it) {
      it.carrierIds = it.carrierIds.filter((c) => c !== id);
      it.pos = copyV(ant.pos);
    }
  } else if (ant.carry.kind === 'brood') {
    const b = ctx.stores.brood.get(ant.carry.id);
    if (b) {
      b.carriedBy = -1;
      b.pos = copyV(ant.pos);
    }
  }
  ant.carry = { kind: 'none', id: -1 };
  const player = ctx.state.player;
  if (player.possessedAntId === id) {
    player.possessedAntId = -1;
    player.previousAntId = id;
    ctx.emit({ type: 'possessed-ant-died', antId: id, cause });
    ctx.emit({ type: 'possession-ended', antId: id, reason: 'death', resumedTask: null });
  }
  ctx.stores.ants.markDead(id);
  const colony = ctx.stores.colonies.get(ant.colony);
  if (colony) colony.livingAnts = Math.max(0, colony.livingAnts - 1);
  ctx.emit({ type: 'ant-died', antId: id, colonyId: ant.colony, cause, pos: copyV(ant.pos), task: ant.task, caste: ant.caste });
  ctx.emit({ type: 'entity-removed', entity: 'ant', id, cause });
  return true;
}
