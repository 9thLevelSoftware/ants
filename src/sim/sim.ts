// createSim(state, world?): the runtime around a SimState. tick() runs the ordered systems (honouring
// `every`/`offset`), sweeps dead entities, advances the tick counter and flushes queued events.
//
// Determinism: everything the systems read comes from state + world + the command stream. Services are derived
// caches rebuilt here; RNG state lives in state.rng / state.rngStreams.

import { EventBus } from '@/core/events';
import { rngFork, type RngState } from '@/core/rng';
import type {
  Behaviour, Command, PlayerIntent, RngStreamName, Sim, SimEvent, SimEventMap, SimState, System, WorldData,
} from '@/sim/types';
import { applyCommand } from '@/sim/commands';
import { clonePlain } from '@/sim/entities';
import { integratePossessed as integratePossessedAnt } from '@/sim/locomotion';
import { getSpecies, requireSpecies } from '@/sim/species';
import { createServices } from '@/sim/services';
import { BEHAVIOURS, createBehaviourTable, SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { installRuntimeHooks } from '@/sim/wiring';

export interface CreateSimOptions {
  /** Replaces the default system list (module tests run only the systems they need). */
  systems?: readonly System[];
  /** Replaces the default behaviour list (module tests). */
  behaviours?: readonly Behaviour[];
}

/** True if system `s` runs on tick `t`. */
export function systemDue(s: System, t: number): boolean {
  const every = s.every ?? 1;
  return every <= 1 || (t + (s.offset ?? 0)) % every === 0;
}

/** Named RNG sub-stream stored in state.rngStreams, forked from the world seed on first use. */
export function rngStream(state: SimState, name: RngStreamName): RngState {
  let s = state.rngStreams[name];
  if (!s) {
    s = rngFork(state.config.world.seed, name);
    state.rngStreams[name] = s;
  }
  return s;
}

export function createSim(state: SimState, world?: WorldData, opts: CreateSimOptions = {}): Sim {
  const w = world ?? generateWorld(state.config.world);
  const svc = createServices(state, w);
  const events = new EventBus<SimEventMap>();
  const pending: Command[] = [];
  const systems = opts.systems ?? SYSTEMS;
  /** True while tick() runs: commands applied by the commands system leave their events to the tick's own flush. */
  let inTick = false;

  const sim: Sim = {
    state,
    world: w,
    ...svc,
    species: requireSpecies(state.config.species),
    getSpecies,
    events,
    systems,
    behaviours: createBehaviourTable(opts.behaviours ?? BEHAVIOURS),
    tick() {
      svc.index.refresh(); // refreshed again after the commands system if any command was applied
      const t = state.tick;
      inTick = true;
      try {
        for (let i = 0; i < systems.length; i++) {
          const s = systems[i];
          if (systemDue(s, t)) s.run(sim);
        }
        sweep(sim);
        state.tick = t + 1;
      } finally {
        inTick = false;
      }
      events.flush();
    },
    enqueue(cmd) {
      pending.push(clonePlain(cmd));
    },
    applyPendingCommands() {
      // Take each batch out of the queue BEFORE applying it, so a command that fails can never stay queued and
      // block later ticks. Commands queued by handlers form the next batch of the same pass, in order.
      let applied = 0;
      while (pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        for (let i = 0; i < batch.length; i++) applyCommand(sim, batch[i]);
        applied += batch.length;
      }
      // Entities created or killed by commands must be visible to this tick's queries.
      if (applied > 0) svc.index.refresh();
      // Applied outside a tick (paused, frozen, step 0): deliver their events now, as a tick would, so a save taken
      // before the next tick has seen them (GDD 06 §15 rule 4: a save made while paused is the same game).
      if (!inTick) events.flush();
    },
    setPlayerIntent(intent: PlayerIntent) {
      const next = clonePlain(intent);
      // a non-finite direction (bad input mapping) would reach the walker as NaN: treat it as "no input"
      const d = next.dir;
      if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isFinite(d.z)) next.dir = { x: 0, y: 0, z: 0 };
      state.player.intent = next;
    },
    integratePossessed(dtSeconds: number) {
      const ant = svc.stores.ants.get(state.player.possessedAntId);
      if (ant) integratePossessedAnt(sim, ant, dtSeconds);
    },
    emit(ev: SimEvent) {
      events.queue(ev.type, ev as SimEventMap[typeof ev.type]);
    },
    stream: (name) => rngStream(state, name),
  };
  installRuntimeHooks(sim);
  return sim;
}

/** Swap-removes dead entities from every store except colonies (colonies[0] must stay the player's). */
function sweep(sim: Sim): void {
  const s = sim.stores;
  s.ants.sweep();
  s.brood.sweep();
  s.items.sweep();
  s.sources.sweep();
  s.plants.sweep();
  s.creatures.sweep();
  s.nests.sweep();
  s.markers.sweep();
  s.herds.sweep();
}
