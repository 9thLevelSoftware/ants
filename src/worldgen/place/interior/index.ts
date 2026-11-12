// worldgen-interior: the building and its kitchen slice (GDD 04 §5.7, §6.2, §10). Replaces the built-in
// 'default/building-shell' placer (same id) in the structures step, and adds the exterior climb routes in the
// props step, after the outdoor paving exists (their base nodes, and the outside mouths of the building's
// micro-connections, rest on whatever the garden surface is).
//
// Not declared: `provides: ['micro']`. The map-wide micro-connection minimum (v-micro) is worldgen-life's
// guarantee; declaring it here would make v-micro fail on maps without the outdoor connections.

import { walkerParamsForBU } from '@/sim/locomotion/walkerParams';
import { addDownpipe, placeExterior } from './exterior';
import type { WorldgenModule, GenContext } from '../../kit';
import { placeFurniture } from './furnish';
import { placeBuildingMicro, placeSkirting } from './micro';
import { planKitchen } from './plan';
import { makeRoom } from './room';
import { placeRuns } from './runPlace';
import { placeShell } from './shellPlace';
import { setInteriorState } from './state';

export function placeInterior(ctx: GenContext): void {
  const house = ctx.layout.house;
  if (!house) return;
  const rng = (part: string) => ctx.rng(`wg/structures/interior/${part}`);
  const room = makeRoom(ctx, house, rng('room'));
  const plan = room.slice && house.door ? planKitchen(room, rng('plan')) : null;
  const shell = placeShell(ctx, room, plan, rng('shell'));
  addDownpipe(ctx, room);
  const outsideMouths = placeBuildingMicro(ctx, room, plan, shell.vents);
  setInteriorState(ctx, { room, plan, shell, outsideMouths });
  if (!plan) return;
  const foot = walkerParamsForBU(ctx.dims.bu).footOffset;
  const runs = placeRuns(ctx, room, plan, rng('runs'), foot);
  placeFurniture(ctx, room, plan, runs, rng('furniture'), foot);
  placeSkirting(ctx, room, plan, runs, rng('skirting'));
}

export const worldgen: WorldgenModule = {
  placers: [
    { id: 'default/building-shell', step: 'structures', order: -100, run: placeInterior },
    { id: 'interior/exterior-routes', step: 'props', order: 900, run: placeExterior },
  ],
};

// Adapters for other modules (no contract field exists for these yet; see README.md)
export { interiorFoodSpots, type InteriorFoodSpot } from './food';
export { interiorHumanAreas, HUMAN_GRID, type InteriorHumanAreas, type HumanNodeKind } from './lanes';
