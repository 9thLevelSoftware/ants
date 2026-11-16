// Reproduction (GDD 06 §11-§12; task overwinter-repro): alate gate, quota and cost, rearing, the flight day, the
// launch and its aggregate resolution, the possessed flight, flight and daughter records. Registered through
// src/sim/colony/index.ts.
export { reproductionSystem, reproductionCommandHandlers } from './system';
export { alateCost, alateTarget, failingGates, gateFacts, GATE_IDS, type AlateTarget, type GateFacts, type GateId } from './gate';
export { launchChance, type FlightWeather, type LaunchChance } from './flightDay';
export { askOpen, daughterSeed, flightDayValid, flightOdds, flightWeather, launchFlight, openRecord } from './launch';
export { activeFlight, lekPoint, startPossessedFlight } from './possessed';
export { glideStep, type GlideInput, type GlideState } from './glide';
export { waitingAlates } from './rearing';
