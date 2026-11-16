// The reproduction system and its commands (GDD 06 §11, App. B): daily gate and quota, designation of sexual eggs,
// demotion at pupation, alate maturation and eviction, the flight-day roll and launch, take-off, the possessed flight.

import type { Colony, CommandHandlerMap, Sim, SpeciesDef, System } from '@/sim/types';
import { lifecycleOf, playerCol } from '../succession/lifecycleState';
import { designateEggs, checkDemotion, evaluateRearing, expireAlates, matureAlates, onAlateEclosed } from './rearing';
import { askOpen, endFlight, launchFlight, openRecord, rollFlightDay, takeOff, updateFlightOffers } from './launch';
import {
  activeFlight, ensureFlightOverride, flightPossessRefusal, landNow, startPossessedFlight, updatePossessedFlight, witnessedOf,
} from './possessed';

/** Slow work (gate, designation, maturation, roll) runs every this many ticks; the flight every tick. */
const SLOW_EVERY = 10;

const watched = new WeakSet<Sim>();

function watch(sim: Sim): void {
  if (watched.has(sim)) return;
  watched.add(sim);
  ensureFlightOverride(sim);
  sim.events.on('brood-stage', (e) => {
    if (e.from !== 'larva' || e.to !== 'pupa') return;
    const b = sim.stores.brood.get(e.broodId);
    if (b) checkDemotion(sim, b);
  });
  sim.events.on('ant-eclosed', (e) => {
    if (e.caste !== 'gyne' && e.caste !== 'male') return;
    const a = sim.stores.ants.get(e.antId);
    if (a) onAlateEclosed(sim, a);
  });
}

function playerDef(sim: Sim): { col: Colony; def: SpeciesDef } | null {
  const col = playerCol(sim);
  const def = col && col.alive ? sim.getSpecies(col.species) : undefined;
  return col && def ? { col, def } : null;
}

/** Take-off once the assembly time is over: the others resolve, and the flight closes unless she still flies. */
function maybeTakeOff(sim: Sim, col: Colony, def: SpeciesDef): void {
  const life = lifecycleOf(col);
  const book = life.repro;
  if (book.assemblyUntil < 0 || sim.state.tick < book.assemblyUntil) return;
  const af = activeFlight(sim);
  takeOff(sim, col, def, af ? af.f.gyneId : -1);
  if (af) return; // she is still in the air: her end closes the flight
  const f = life.flight && life.flight.flightId === book.openFlightId ? life.flight : null;
  endFlight(sim, col, def, witnessedOf(f));
}

export const reproductionSystem: System = {
  name: 'reproduction', phase: 'colony-economy',
  run: (sim) => {
    watch(sim);
    const pd = playerDef(sim);
    if (!pd) return;
    const { col, def } = pd;
    updatePossessedFlight(sim, def);
    maybeTakeOff(sim, col, def);
    if (sim.state.tick % SLOW_EVERY !== 0) return;
    evaluateRearing(sim, col, def);
    designateEggs(sim, col, def);
    matureAlates(sim, col);
    rollFlightDay(sim, col, def);
    updateFlightOffers(sim, col, def);
    expireAlates(sim, col, def);
  },
};

function reject(sim: Sim, commandType: string, reason: string, detail = ''): void {
  sim.emit({ type: 'command-rejected', commandType, reason, detail });
}

export const reproductionCommandHandlers: Partial<CommandHandlerMap> = {
  /** Answer to the `ask` prompt: launch now, only while today's offer is open (valid hour, window and weather). */
  flightRelease: (sim) => {
    const pd = playerDef(sim);
    if (!pd) return reject(sim, 'flightRelease', 'no-colony');
    const book = lifecycleOf(pd.col).repro;
    if (book.openFlightId !== '') return reject(sim, 'flightRelease', 'busy');
    if (!askOpen(sim, pd.col, pd.def)) {
      book.askTick = -1;
      return reject(sim, 'flightRelease', 'no-offer');
    }
    if (!launchFlight(sim, pd.col)) reject(sim, 'flightRelease', 'no-alates');
  },
  flightPossess: (sim, c) => {
    const why = flightPossessRefusal(sim, c.gyneId);
    if (why) return reject(sim, 'flightPossess', why, String(c.gyneId));
    startPossessedFlight(sim, c.gyneId);
  },
  flightLand: (sim) => {
    const pd = playerDef(sim);
    if (!pd || !landNow(sim, pd.def)) reject(sim, 'flightLand', 'not-flying');
  },
  /** Debug: callow alates count as matured and the flight launches now, whatever the day and weather. */
  'cheat.forceFlight': (sim) => {
    const pd = playerDef(sim);
    if (!pd) return;
    if (openRecord(pd.col)) return;
    for (const a of sim.state.ants) if (a.alive && a.colony === pd.col.id && a.alate?.state === 'callow-alate') a.alate.state = 'waiting';
    if (!launchFlight(sim, pd.col)) reject(sim, 'cheat.forceFlight', 'no-alates');
  },
};
