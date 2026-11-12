// Navigation memory capacities (GDD 02 §9). These size the typed arrays inside each Ant.

/** Breadcrumb ring capacity (points). */
export const CRUMB_CAP = 96;
/** Learned route slots per ant and waypoints per route. */
export const ROUTE_SLOTS = 2;
export const ROUTE_WAYPOINTS_MAX = 32;
/** Depleted-source memory slots. */
export const DEPLETED_SLOTS = 4;
/** Decision log length for the inspect card. */
export const DECISION_LOG = 5;
