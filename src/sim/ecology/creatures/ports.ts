// Every function of another module the creature code calls for a real effect, in one place (same pattern as
// src/sim/ants/actions/ports.ts). Tests replace a port with a fake (`Object.assign(ports, fake)`) and restore it.
// Each port resolves the owning module's export when CALLED (import cycles: ecology <-> combat / ants / nest).
//
// Relied-on signatures (report): combat.applyDamage(sim, kind, id, dmg, cause) -> dealt, combat.releaseGrapple,
// combat.raiseAlarm(sim, colony, pos, strength); progression.raiseAlert; locomotion nav*, placeOnSurface,
// registerSpeedFactor, registerMovementOverride; environment airTemp / isRaining; entities kill/spawn helpers.

import * as combat from '@/sim/combat';
import * as progression from '@/sim/progression';
import * as locomotion from '@/sim/locomotion';
import * as environment from '@/sim/environment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function late<F extends (...args: any[]) => any>(get: () => F): F {
  return ((...args: Parameters<F>) => get()(...args)) as F;
}

export const ports = {
  // combat (Tier 2 owner): damage with armour / multipliers and the death (cause 'predation', 'bird', 'antlion')
  applyDamage: late(() => combat.applyDamage),
  releaseGrapple: late(() => combat.releaseGrapple),
  raiseAlarm: late(() => combat.raiseAlarm),
  // progression: alerts (predator-near, nest-attacked)
  raiseAlert: late(() => progression.raiseAlert),
  // locomotion
  navTo: late(() => locomotion.navTo),
  navToTarget: late(() => locomotion.navToTarget),
  navWander: late(() => locomotion.navWander),
  navStop: late(() => locomotion.navStop),
  placeOnSurface: late(() => locomotion.placeOnSurface),
  registerSpeedFactor: late(() => locomotion.registerSpeedFactor),
  registerMovementOverride: late(() => locomotion.registerMovementOverride),
  // environment
  airTemp: late(() => environment.airTemp),
  isRaining: late(() => environment.isRaining),
};

export type CreaturePorts = typeof ports;
