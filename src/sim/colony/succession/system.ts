// Queen death, the orphaned colony and the end of a colony (GDD 06 §13). The queen's death (any cause, from the
// `ant-died` event) orphans the colony when no other queen lives: no more eggs (the dead queen lays none), brood
// already present develops normally, `alateRearing` ends, `queen.died` and `colony.orphaned` are emitted and the
// diagnostic chain of the moment is kept for the epitaph. When no ant of the player colony lives (queen, workers,
// gynes, males; brood alone does not count) for EXTINCTION_GRACE_GD, the colony is extinct: the clock stops and
// `colony.extinct` and `epitaph.ready` follow. `retireColony` ends it at once with cause `retired`.

import type { Colony, CommandHandlerMap, Sim, System } from '@/sim/types';
import { worstCauseChain } from '@/sim/progression/diagnostics';
import { currentYear, daysToTicks } from '@/sim/time';
import { EXTINCTION_GRACE_GD } from '@/sim/balance/lifecycle';
import { isWorkerCaste } from '../census';
import { lifecycleOf, openingOver, playerCol, stampNow } from './lifecycleState';
import { trackDailySamples } from './sampleDays';

const CHECK_EVERY = 5;
const watched = new WeakSet<Sim>();

function isPlayer(sim: Sim, colonyId: number): boolean {
  return playerCol(sim)?.id === colonyId;
}

function livingQueen(sim: Sim, col: Colony): number {
  for (const q of col.queens) {
    const a = sim.stores.ants.get(q.antId);
    if (a && a.alive && a.caste === 'queen') return a.id;
  }
  const a = sim.stores.ants.get(col.queenId);
  return a && a.alive && a.caste === 'queen' ? a.id : -1;
}

/** Last ant death cause of the player colony (the epitaph's "how it ended"). */
const lastCause = new WeakMap<Sim, string>();

function watch(sim: Sim): void {
  if (watched.has(sim)) return;
  watched.add(sim);
  sim.events.on('ant-died', (e) => {
    if (!isPlayer(sim, e.colonyId)) return;
    const col = playerCol(sim)!;
    const life = lifecycleOf(col);
    if (e.cause !== 'dispersed') lastCause.set(sim, e.cause);
    life.succession.extinctCause = e.cause === 'dispersed' ? life.succession.extinctCause : e.cause;
    if (e.caste !== 'queen') return;
    const next = livingQueen(sim, col);
    if (next >= 0) { col.queenId = next; return; }
    const s = life.succession;
    if (s.queenDiedTick >= 0) return;
    s.queenDiedTick = sim.state.tick;
    s.queenDied = stampNow(sim);
    s.queenCause = e.cause;
    s.queenChain = worstCauseChain(sim);
    col.queenId = -1;
    if (col.orphanedAtTick < 0) col.orphanedAtTick = sim.state.tick;
    col.repro.alateRearing = 0;
    sim.emit({ type: 'queen.died', queenId: e.antId, colonyId: col.id, cause: e.cause });
    sim.emit({ type: 'colony.orphaned', colonyId: col.id });
  });
  sim.events.on('ant-eclosed', (e) => {
    if (isPlayer(sim, e.colonyId)) lifecycleOf(playerCol(sim)!).succession.born++;
  });
  sim.events.on('delivery', (e) => {
    if (!isPlayer(sim, e.colonyId)) return;
    const s = lifecycleOf(playerCol(sim)!).succession;
    s.foodC += e.c;
    s.foodP += e.p;
  });
}

/** The chain of causes for the epitaph: queen's death, the last death, the worst diagnostic chain. */
function chainOf(sim: Sim, col: Colony, cause: string): string[] {
  const s = lifecycleOf(col).succession;
  const out: string[] = [cause];
  if (s.queenCause && cause !== 'retired') out.push(`queen:${s.queenCause}`);
  for (const c of s.queenChain.length > 0 ? s.queenChain : worstCauseChain(sim)) if (!out.includes(c)) out.push(c);
  return out;
}

/** Ends the colony now (extinction or retirement): the clock stops, then the events. */
export function endColony(sim: Sim, col: Colony, cause: string): void {
  const s = lifecycleOf(col).succession;
  if (s.extinct) return;
  s.extinct = true;
  s.extinctTick = sim.state.tick;
  s.extinctCause = cause;
  s.causeChain = chainOf(sim, col, cause);
  const time = sim.state.env.time;
  const from = time.paused ? 0 : time.speed;
  time.paused = true;
  time.skipUntil = -1;
  if (from !== 0) sim.emit({ type: 'time.speed-changed', from, to: 0, reason: 'extinct' });
  sim.emit({ type: 'colony.extinct', colonyId: col.id, cause, causeChain: [...s.causeChain] });
  sim.emit({ type: 'epitaph.ready', snapshotId: sim.state.tick });
}

/** Peaks the epitaph shows (workers, nest volume, chambers), sampled while the colony lives. */
function samplePeaks(sim: Sim, col: Colony): void {
  const s = lifecycleOf(col).succession;
  let w = 0;
  for (const a of sim.state.ants) if (a.alive && a.colony === col.id && isWorkerCaste(a.caste)) w++;
  if (w > s.peakWorkers) { s.peakWorkers = w; s.peakYear = currentYear(sim.state); }
  let vol = 0, ch = 0;
  for (const n of sim.state.nests) {
    if (!n.alive || n.colony !== col.id) continue;
    vol += n.chambers.reduce((a, c) => a + c.volume, 0);
    ch += n.chambers.length;
  }
  if (vol > s.peakVolume) s.peakVolume = vol;
  if (ch > s.peakChambers) s.peakChambers = ch;
  lifecycleOf(col).founded ??= stampNow(sim);
}

export const successionSystem: System = {
  name: 'succession', phase: 'lifecycle',
  run: (sim) => {
    watch(sim);
    const col = playerCol(sim);
    if (!col) return;
    const s = lifecycleOf(col).succession;
    if (s.extinct) return;
    trackDailySamples(sim, col); // every tick: time jumps can file a day sample on consecutive ticks
    if (sim.state.tick % CHECK_EVERY !== 0) return;
    if (!openingOver(sim)) return; // the opening's failure has its own epitaph path (founding)
    let living = 0;
    for (const a of sim.state.ants) if (a.alive && a.colony === col.id) living++;
    if (living > 0) {
      s.emptySinceTick = -1;
      s.lastAnts = living <= 3;
      samplePeaks(sim, col);
      return;
    }
    if (s.emptySinceTick < 0) s.emptySinceTick = sim.state.tick;
    if (!sim.state.config.rules.extinctionEndsGame) return;
    if (sim.state.tick - s.emptySinceTick >= daysToTicks(EXTINCTION_GRACE_GD)) endColony(sim, col, lastCause.get(sim) ?? (s.extinctCause || 'unknown'));
  },
};

export const successionCommandHandlers: Partial<CommandHandlerMap> = {
  retireColony: (sim) => {
    const col = playerCol(sim);
    if (!col) return;
    lifecycleOf(col).succession.retired = true;
    endColony(sim, col, 'retired');
  },
};
