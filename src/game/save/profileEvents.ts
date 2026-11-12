// Fills the device profile from sim events (GDD 06 §15 rule 9, GDD 08 §7.3: "written on their own events").
// Only what an event alone can supply is wired here: a codex unlock (id + the moment, read from the state).
// Lineage records (colony / flight / daughter rows) and the hint mirror need the progression module's data, which
// the events do not carry: they are listed as needs for the integrator and plug into ProfileStore.upsert* /
// recordHintUse when that module exists.
import { currentDayOfYear, currentYear } from '@/sim/time';
import type { Sim } from '@/sim/types';
import type { ProfileStore } from '../profile/profile';

/** Subscribes the profile to `sim`'s events; returns the unsubscribers. */
export function attachProfileEvents(sim: Sim, profile: ProfileStore): (() => void)[] {
  return [
    sim.events.on('codex.unlocked', (e) => {
      const s = sim.state;
      profile.unlockCodex(e.id, { tick: s.tick, doy: currentDayOfYear(s), year: currentYear(s), species: s.config.species });
    }),
  ];
}
