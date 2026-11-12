// Action primitives: the only code that changes the world on behalf of an ant (contracts guidance §5).
// Behaviours and the possessed ant use canDo / begin / cancel / stopAction.

export { actionSystem, layTrail } from './system';
export {
  availableActions, begin, cancel, canDo, interruptible, resolveTarget, stepAction, stopAction, type BeginOptions,
} from './runner';
export { ACTION_DEFS, actionDef, digContact, digPower, entranceAtThroat, floorAhead, setTrailFlag } from './defs';
export { broodCarriedBy, carriedBrood, carriedItem, handsFree, releaseCarried } from './carry';
export {
  antLengthMm, bearingDeg, contactDistance, entityTarget, findEntrance, inReach, mandiblePoint, placeOf, reachMm,
  selfTarget, type TargetPlace,
} from './geometry';
export { ports, type Ports } from './ports';
export { isFoodItem, isLiquidSource, isPickableSource, isTearSource } from './sourceKinds';
export type { ActionDef, ActionKind, TickOutcome } from './types';
export { healthFactor, isGripping, isPossessed, speciesIdOf, tempFactor, workRate } from './workRate';
