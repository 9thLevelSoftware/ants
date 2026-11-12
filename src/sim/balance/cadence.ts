// How often periodic systems run, ticks (10 ticks = 1 game s). Values from the owning GDD chapters.

/** Allocation re-evaluation (GDD 02 ALLOC_PERIOD 10 s). */
export const ALLOC_EVERY = 100;
/** Pheromone decay step (GDD 02: every 10 ticks). */
export const PHERO_DECAY_EVERY = 10;
/** Hourly ecology, rivals and statistics cadence (GDD 05 ECO_HOURLY_EVERY, GDD 02 STATS_SAMPLE_TICKS). */
export const HOURLY_EVERY = 250;
/** Creature director (GDD 05: every 50 ticks). */
export const CREATURE_DIRECTOR_EVERY = 50;
/** Weather and fast environment updates (GDD 06 ENV_FAST_EVERY). */
export const ENV_FAST_EVERY = 25;
/** Soil moisture and flooding inputs (GDD 06 ENV_MOISTURE_EVERY). */
export const ENV_MOISTURE_EVERY = 50;
/** Diagnostics refresh (GDD 02/06: every 250 ticks). */
export const DIAGNOSTICS_EVERY = 250;
/** Nest architect evaluation (GDD 03 ARCH_PERIOD_S 60 s). */
export const ARCHITECT_EVERY = 600;

// Stagger offsets (System.offset, ticks): periodic systems of 50 ticks or more never share a tick, so their
// cost spreads over the period instead of spiking together. The 25- and 10-tick systems are left aligned.
/** Hourly systems, spread 50 ticks apart within the hour. */
export const SOURCES_OFFSET = 5;
export const PLANTS_OFFSET = 55;
export const COLONY_STATS_OFFSET = 105;
export const RIVALS_OFFSET = 155;
export const DIAGNOSTICS_OFFSET = 205;
export const ALLOC_OFFSET = 15;
export const CREATURE_DIRECTOR_OFFSET = 40;
export const ENV_MOISTURE_OFFSET = 30;
export const ARCHITECT_OFFSET = 320;
