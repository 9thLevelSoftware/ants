// Every function of another module that an action primitive calls for its real effect, in one place.
// Primitives call `ports.x(...)`, never the modules directly, so the dependency list is explicit and tests can
// replace a port with a fake (vi.spyOn(ports, 'feedBrood')). The defaults are the owning modules' exports.
//
// Each port looks its function up when it is CALLED, not when this file is evaluated: colony/founding imports this
// module, and the colony index imports founding, so with some import orders `colony.canLay` was still undefined
// when the port table was built (`ports.canLay is not a function`). A late lookup cannot see a half-built module.

import * as colony from '@/sim/colony';
import * as combat from '@/sim/combat';
import * as ecology from '@/sim/ecology';
import * as environment from '@/sim/environment';
import * as locomotion from '@/sim/locomotion';
import * as nest from '@/sim/nest';
import * as pheromones from '@/sim/pheromones';
import * as progression from '@/sim/progression';

/** A port that resolves the owning module's function at call time (see the header). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function late<F extends (...args: any[]) => any>(get: () => F): F {
  return ((...args: Parameters<F>) => get()(...args)) as F;
}

export const ports = {
  // nest (nestops): digging, pellets, plugs, chambers, entrances
  canDigAt: late(() => nest.canDigAt),
  digBite: late(() => nest.digBite),
  /** Dig speed at a point inside the solid (moisture, loose fill, crusts; GDD 03 §2.1-2.2). */
  nestDigSpeedAt: late(() => nest.digSpeedAt),
  dumpPellet: late(() => nest.dumpPellet),
  sealEntrance: late(() => nest.sealEntrance),
  unsealEntrance: late(() => nest.unsealEntrance),
  findChamberAt: late(() => nest.findChamberAt),
  bestBroodChamber: late(() => nest.bestBroodChamber),
  nearestEntrance: late(() => nest.nearestEntrance),
  // colony (colony-core): ledger, brood feeding, eggs, allocation
  depositFood: late(() => colony.depositFood),
  withdrawFood: late(() => colony.withdrawFood),
  feedBrood: late(() => colony.feedBrood),
  layEgg: late(() => colony.layEgg),
  canLay: late(() => colony.canLay),
  colonyDemand: late(() => colony.colonyDemand),
  broodDevRate: late(() => colony.devRate),
  broodStageDu: late(() => colony.stageDu),
  // colony: the care primitives (load-crop, feed-queen, assist-eclosion, cannibalise, groom on a pile)
  nurseLoadMix: late(() => colony.nurseLoadMix),
  queenRationMix: late(() => colony.queenRationMix),
  feedQueenFromReserve: late(() => colony.feedQueenFromReserve),
  ecloseBrood: late(() => colony.ecloseBrood),
  cannibaliseBrood: late(() => colony.cannibaliseBrood),
  tendBroodAt: late(() => colony.tendBroodAt),
  // combat (combat task): the rules behind the bite / spray / dodge / sting shells (GDD 05 §4)
  combatMayBite: late(() => combat.mayBite),
  combatStats: late(() => combat.combatStats),
  combatSprayDisabled: late(() => combat.sprayDisabled),
  combatDodgeRefusal: late(() => combat.dodgeRefusal),
  combatStartDodge: late(() => combat.startDodge),
  combatStingRefusal: late(() => combat.stingRefusal),
  combatStingContact: late(() => combat.stingContact),
  combatStingHit: late(() => combat.stingHit),
  // ecology (sources-core): harvesting. takeFromSource puts the food into the crop (liquids, `amount` = game s of
  // drinking) or an item into the mandibles (pick: whole units; tear: one piece).
  takeFromSource: late(() => ecology.takeFromSource),
  harvestForm: late(() => ecology.harvestForm),
  sourceFootprintMm: late(() => ecology.footprintMm),
  nearestSource: late(() => ecology.nearestSource),
  discoverSource: late(() => ecology.discoverSource),
  // pheromones (phero)
  deposit: late(() => pheromones.deposit),
  sample: late(() => pheromones.sample),
  // combat (Tier 2 owner)
  applyDamage: late(() => combat.applyDamage),
  beginGrapple: late(() => combat.beginGrapple),
  releaseGrapple: late(() => combat.releaseGrapple),
  raiseAlarm: late(() => combat.raiseAlarm),
  // environment (env-core): temperature factor of work and movement
  speedMult: late(() => environment.speedMult),
  surfaceTemp: late(() => environment.surfaceTemp),
  soilTemp: late(() => environment.soilTemp),
  chamberTemp: late(() => environment.chamberTemp),
  relHumidity: late(() => environment.relHumidity),
  // progression: the possession diagnostics of GDD 01 App. D
  publishDiagnostic: late(() => progression.publishDiagnostic),
  // locomotion (loco): the auto-advance step of dig-bite and stopping
  navTo: late(() => locomotion.navTo),
  navStop: late(() => locomotion.navStop),
};

export type Ports = typeof ports;
