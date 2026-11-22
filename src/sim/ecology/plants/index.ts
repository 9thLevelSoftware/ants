// Plants (task ecology-plants, GDD 05 §1.2 nectar rows and §1.4 honeydew herds, GDD 07 §6.1 tender rules):
// host plant states, aphid herds and their seasonal cycle, tending and honeydew production, the herd's source and
// film, nectar rhythm, the tend-aphid droplet, diagnostics inputs. Other modules import from '@/sim/ecology'.
//
// How it fits together:
//   init.ts         New Game: plant states, starting herds (Tier 2)            hosts.ts  host sites, found / drop herds
//   system.ts       hourly plants step, per-second tending, tend-demand adapter growth.ts hourly herd model
//   tending.ts      tenders, claims, tend, production, discovery               links.ts  herd point, herd source, film
//   droplet.ts      tend-aphid effect                                          nectar.ts flowers and nectaries
//   disturb.ts      herdDamage, cull, mowing, host destroyed, rain on films    demand.ts tenders wanted, tend demand
//   diagnostics.ts  diag-herds inputs                                          commands.ts cheats

export { plantsSystem, herdTendingSystem, tendDemandSystem, plantSystems, runPlantsHour, runTendingStep } from './system';
export { initPlants, pregrownHerd } from './init';
export { herdDamage, cullAphid, mowHerdsInArea, destroyHost, rainOnFilms } from './disturb';
export { herdPoint, herdSourceOf, herdOfSource, isHerdSource, ensureLinks } from './links';
export { foundHerd, dropHerd, freeSite, freeSitesNear, herdSites, isAphidHost, plantOfObject } from './hosts';
export { kEff, poolCap, tendSlots, tendersNeeded, productionPerGd } from './herdMath';
export { tendersPresent, isTenderOf } from './tending';
export { herdTendDemand, tendersWanted, herdWorkable, herdMarked } from './demand';
export { releaseDroplet } from './droplet';
export { herdDiagInputs, herdDiagnostic, type HerdDiagInputs } from './diagnostics';
export { yieldToday } from './yield';
export { growthRate, tempFactor, inDays, isDormantSeason } from './season';
export { plantCommandHandlers } from './commands';
export { ports as plantPorts } from './ports';
