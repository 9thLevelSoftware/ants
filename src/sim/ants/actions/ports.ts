// Every function of another module that an action primitive calls for its real effect, in one place.
// Primitives call `ports.x(...)`, never the modules directly, so the dependency list is explicit and tests can
// replace a port with a fake (vi.spyOn(ports, 'feedBrood')). The defaults are the owning modules' exports.

import * as colony from '@/sim/colony';
import * as combat from '@/sim/combat';
import * as ecology from '@/sim/ecology';
import * as environment from '@/sim/environment';
import * as locomotion from '@/sim/locomotion';
import * as nest from '@/sim/nest';
import * as pheromones from '@/sim/pheromones';
import * as progression from '@/sim/progression';

export const ports = {
  // nest (nestops): digging, pellets, plugs, chambers, entrances
  canDigAt: nest.canDigAt,
  digBite: nest.digBite,
  /** Dig speed at a point inside the solid (moisture, loose fill, crusts; GDD 03 §2.1-2.2). */
  nestDigSpeedAt: nest.digSpeedAt,
  dumpPellet: nest.dumpPellet,
  sealEntrance: nest.sealEntrance,
  unsealEntrance: nest.unsealEntrance,
  findChamberAt: nest.findChamberAt,
  bestBroodChamber: nest.bestBroodChamber,
  nearestEntrance: nest.nearestEntrance,
  // colony (colony-core): ledger, brood feeding, eggs, allocation
  depositFood: colony.depositFood,
  withdrawFood: colony.withdrawFood,
  feedBrood: colony.feedBrood,
  layEgg: colony.layEgg,
  canLay: colony.canLay,
  colonyDemand: colony.colonyDemand,
  broodDevRate: colony.devRate,
  broodStageDu: colony.stageDu,
  // ecology (sources-core): harvesting. takeFromSource puts the food into the crop (liquids, `amount` = game s of
  // drinking) or an item into the mandibles (pick: whole units; tear: one piece).
  takeFromSource: ecology.takeFromSource,
  harvestForm: ecology.harvestForm,
  sourceFootprintMm: ecology.footprintMm,
  nearestSource: ecology.nearestSource,
  discoverSource: ecology.discoverSource,
  // pheromones (phero)
  deposit: pheromones.deposit,
  sample: pheromones.sample,
  // combat (Tier 2 owner)
  applyDamage: combat.applyDamage,
  beginGrapple: combat.beginGrapple,
  releaseGrapple: combat.releaseGrapple,
  raiseAlarm: combat.raiseAlarm,
  // environment (env-core): temperature factor of work and movement
  speedMult: environment.speedMult,
  surfaceTemp: environment.surfaceTemp,
  soilTemp: environment.soilTemp,
  chamberTemp: environment.chamberTemp,
  relHumidity: environment.relHumidity,
  // progression: the possession diagnostics of GDD 01 App. D
  publishDiagnostic: progression.publishDiagnostic,
  // locomotion (loco): the auto-advance step of dig-bite and stopping
  navTo: locomotion.navTo,
  navStop: locomotion.navStop,
};

export type Ports = typeof ports;
