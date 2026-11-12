// Refusals the sim raises while a command is applied (`command-rejected`, `possess-rejected`), captured by a
// listener for the duration of the call. Unlike reading the capped event log, this cannot lose events however
// long the game runs or however many events the command itself produces.
import type { Sim, SimEvent } from '@/sim/types';

export type Rejection = Extract<SimEvent, { type: 'command-rejected' | 'possess-rejected' }>;

export function collectRefusals(sim: Sim, apply: () => void): Rejection[] {
  const out: Rejection[] = [];
  const offs = [sim.events.on('command-rejected', (e) => out.push(e)), sim.events.on('possess-rejected', (e) => out.push(e))];
  try {
    apply();
  } finally {
    for (const off of offs) off();
  }
  return out;
}
