// Exterior parts placed after the outdoor paving (props step): the window-sill climb route from the garden
// surface (GDD 04 §10 `wall-face`, with a vantage POI on the outside sill), and the downpipe.

import { addClimbRoute, addPoi, placeObject, supportAt, terrainAt, type GenContext } from '../../kit';
import { walkerParamsForBU } from '@/sim/locomotion/walkerParams';
import { downpipeTemplate } from '../../catalog/interior/shell';
import { COUNTER, DOWNPIPE, GLAZING } from '../../catalog/interior/dims';
import type { Room } from './room';
import { wallGeom } from './shellPlace';
import { interiorState } from './state';

export function addDownpipe(ctx: GenContext, room: Room): void {
  if (!room.slice) return;
  const u = room.slice.k1 + DOWNPIPE.fromSlice <= room.L - DOWNPIPE.fromSlice ? room.slice.k1 + DOWNPIPE.fromSlice : room.slice.k0 - DOWNPIPE.fromSlice;
  const g = wallGeom(room);
  const x = room.ext.x(u, -room.T - 60), z = room.ext.z(u, -room.T - 60);
  const b = downpipeTemplate(g, u, terrainAt(ctx, x, z));
  const c = b.centre();
  placeObject(ctx, b.template(c.x, c.z), { x: c.x, z: c.z, y: 0, snap: false, category: 'structures' });
}

/** Garden ground -> brick face -> under the sill nose (inverted) -> nose -> sill top (vantage). */
export function placeExteriorRoutes(ctx: GenContext): void {
  const st = interiorState(ctx);
  if (!st || !st.plan || st.plan.windowU === null || st.shell.glazing < 0) return;
  const room = st.room, f = room.ext, T = room.T, u = st.plan.windowU;
  const o = walkerParamsForBU(ctx.dims.bu).footOffset, e = 0.7 * o;
  const top = room.floorY + COUNTER.top + GLAZING.aboveCounter, under = top - GLAZING.sillThick, nose = -T - GLAZING.sillNose;
  const gx = f.x(u, -T - 40), gz = f.z(u, -T - 40);
  const g = supportAt(ctx, gx, gz, under - 100);
  const pts = [
    f.p(u, g + o, -T - 40), f.p(u, g + 20, -T - o), f.p(u, under - 15, -T - o), f.p(u, under - o, -T - 20),
    f.p(u, under - e, nose - e), f.p(u, (under + top) / 2, nose - o), f.p(u, top + e, nose - e), f.p(u, top + o, nose + 20),
    f.p(u, top + o, -T + 20),
  ];
  const obj = ctx.world.objects.find((ob) => ob.id === st.shell.glazing);
  const rid = addClimbRoute(ctx, st.shell.glazing, 'wall-face', pts);
  const pid = addPoi(ctx, 'vantage', pts[pts.length - 1], st.shell.glazing);
  if (obj) { if (rid >= 0) obj.routeIds.push(rid); obj.poiIds.push(pid); }
}
