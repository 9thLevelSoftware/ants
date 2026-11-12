// The implemented primitive catalogue (GDD 01 §7.3: Tier 1 plus the Tier 2 shells). Primitives without a
// definition here (fly, sting, cut-leaf ...) are refused with `conditions` until their tier lands.

import type { ActionId } from '@/sim/types';
import type { ActionDef } from '../types';
import { drag, drop, grip, letGo, move, pickUp, putDown } from './carrying';
import { antennateDef, feedLarvaDef, groomDef, layEggDef, sniffDef } from './care';
import { biteDef, biteHoldDef, releaseAlarmDef, sprayAcidDef, tendAphidDef } from './combat';
import { digBiteDef, sealEntranceDef, unsealEntranceDef } from './dig';
import { harvestLiquidDef, harvestSolidDef, layTrailDef, trophGiveDef, trophReceiveDef } from './food';
import { assistEclosionDef, cannibaliseDef, feedQueenDef, loadCropDef, unloadCropDef } from './nestCare';

const LIST: readonly ActionDef[] = [
  move, letGo, grip, pickUp, putDown, drop, drag,
  digBiteDef, sealEntranceDef, unsealEntranceDef,
  layEggDef, feedLarvaDef, groomDef, antennateDef, sniffDef,
  harvestLiquidDef, harvestSolidDef, trophGiveDef, trophReceiveDef, layTrailDef,
  biteDef, biteHoldDef, sprayAcidDef, releaseAlarmDef, tendAphidDef,
  loadCropDef, unloadCropDef, feedQueenDef, assistEclosionDef, cannibaliseDef,
];

export const ACTION_DEFS: Partial<Record<ActionId, ActionDef>> = Object.fromEntries(LIST.map((d) => [d.id, d]));

export function actionDef(id: ActionId): ActionDef | undefined {
  return ACTION_DEFS[id];
}

export { setTrailFlag } from './food';
export { inLayingPlace } from './care';
export { digContact, digPower, entranceAtThroat } from './dig';
export { floorAhead } from './carrying';
export { acidRegenTicks } from './combat';
