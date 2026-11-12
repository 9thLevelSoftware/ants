// Places the building shell (GDD 04 §5.7) from the room frame and the kitchen plan: floor slab (walkable ground),
// façade with vents, sealed house blocks, plaster end/back walls, ceiling, back door, window and service pipes.

import { rngChance, rngInt, rngRange, type RngState } from '@/core/rng';
import type { MaterialId } from '@/sim/types';
import { placeObject, type GenContext } from '../../kit';
import type { TemplateBuilder } from '../../catalog/interior/frame';
import type { Span2 } from '../../catalog/interior/partition';
import {
  ceilingTemplate, doorOpening, doorTemplate, facadeTemplate, floorTemplate, glazingOpening, glazingTemplate,
  pipeOpening, pipeTemplate, roomWallsTemplate, sealedTemplate, type RoomShellParams, type WallGeom,
} from '../../catalog/interior/shell';
import { AIR_BRICK, COUNTER, FLOOR, GLAZING, HOUSE_WALL, WEEP_VENT } from '../../catalog/interior/dims';
import { along } from '../../layout/geom';
import { LEVELS } from '../../tuning/terrain';
import { MICRO } from '../../tuning/pipeline';
import { clampGap, type KitchenPlan } from './plan';
import type { Room } from './room';

/** Ids of the shell objects (for later steps and tests). */
export interface ShellIds { door: number; glazing: number; facade: number; vents: { u: number; slot: number }[] }

export function placeBuilder(ctx: GenContext, b: TemplateBuilder, ground = false): number {
  const c = b.centre();
  return placeObject(ctx, b.template(c.x, c.z), { x: c.x, z: c.z, y: 0, snap: false, category: 'structures', ground });
}

export function wallGeom(room: Room): WallGeom {
  return { f: room.ext, length: room.L, T: room.T, cavity: room.cavity, base: LEVELS.slabUnderside, top: HOUSE_WALL.top, floorY: room.floorY };
}

/** Weep vents every 900 along the sealed parts of the façade (never within the slice margin), plus air bricks. */
function vents(ctx: GenContext, room: Room, rng: RngState): { vents: { u: number; slot: number }[]; bricks: { u: number; openings: number; width: number }[] } {
  const parts: [number, number][] = [];
  const m = Math.max(WEEP_VENT.sliceMargin, 4 * ctx.dims.navCell), c = WEEP_VENT.cornerMargin;
  if (room.slice) {
    parts.push([c, room.slice.k0 - m], [room.slice.k1 + m, room.L - c]);
  } else parts.push([c, room.L - c]);
  const min = MICRO.gapMinBu * room.bu;
  const out: { u: number; slot: number }[] = [];
  for (const [a0, a1] of parts) {
    for (let u = a0 + rngRange(rng, 0, WEEP_VENT.spacing / 2); u <= a1; u += WEEP_VENT.spacing) {
      // the first vent of the façade is the guaranteed passable one (clamped to the species where the range allows)
      const slot = out.length === 0 ? clampGap(rng, WEEP_VENT.slot[0], WEEP_VENT.slot[1], min) : rngRange(rng, WEEP_VENT.slot[0], WEEP_VENT.slot[1]);
      out.push({ u, slot });
    }
  }
  const bricks: { u: number; openings: number; width: number }[] = [];
  const n = rngInt(rng, AIR_BRICK.count[0], AIR_BRICK.count[1]);
  for (let i = 0; i < n && out.length >= 2 * (i + 1); i++) {
    const k = rngInt(rng, 0, out.length - 2);
    const a = out[k].u, b = out[k + 1].u;
    if (b - a < WEEP_VENT.spacing * 1.5) continue;
    const u = (a + b) / 2;
    if (bricks.some((x) => Math.abs(x.u - u) < AIR_BRICK.width * 2)) continue;
    bricks.push({ u, openings: rngInt(rng, AIR_BRICK.openings[0], AIR_BRICK.openings[1]), width: rngRange(rng, AIR_BRICK.openingWidth[0], AIR_BRICK.openingWidth[1]) });
  }
  return { vents: out, bricks };
}

/** Sealed rects of the strip as u ranges. */
function sealedSpans(ctx: GenContext, room: Room): [number, number][] {
  const house = ctx.layout.house!;
  return house.sealed.map((r) => {
    const a = along(room.side, r.x0, r.z0), b = along(room.side, r.x1, r.z1);
    return [Math.min(a, b), Math.max(a, b)] as [number, number];
  });
}

export function placeShell(ctx: GenContext, room: Room, plan: KitchenPlan | null, rng: RngState): ShellIds {
  const g = wallGeom(room);
  const openings: Span2[] = [];
  let doorId = -1, glazingId = -1;
  const v = vents(ctx, room, rng);
  if (plan && room.slice) {
    const s = room.slice;
    const sh: RoomShellParams = {
      ...g, k0: s.k0, k1: s.k1, u0: room.u0, u1: room.u1, depth: room.depth,
      floorMaterial: rngChance(rng, FLOOR.vinylP) ? 'plastic' : 'tile', finish: FLOOR.finish,
    };
    placeBuilder(ctx, floorTemplate(sh), true);
    placeBuilder(ctx, roomWallsTemplate(sh));
    placeBuilder(ctx, ceilingTemplate(sh));
    const sillMaterial: MaterialId = rngChance(rng, 0.7) ? 'stone' : 'metal';
    const dp = { ...g, u: plan.door.u, gap: plan.door.gap, sillMaterial, decayedFoot: plan.door.decayedFoot };
    openings.push(doorOpening(dp));
    doorId = placeBuilder(ctx, doorTemplate(dp));
    if (plan.windowU !== null) {
      const gp = {
        ...g, u: plan.windowU, bottom: room.floorY + COUNTER.top + GLAZING.aboveCounter, head: room.floorY + GLAZING.head,
        sillMaterial: (rngChance(rng, GLAZING.decayedSillP) ? 'wood-decayed' : 'wood-sound') as MaterialId,
      };
      openings.push(glazingOpening(gp));
      glazingId = placeBuilder(ctx, glazingTemplate(gp));
    }
    for (const p of plan.pipes) {
      const pp = { ...g, u: p.u, diam: p.diam, annulus: p.annulus };
      openings.push(pipeOpening(pp));
      placeBuilder(ctx, pipeTemplate(pp));
    }
  }
  const facadeId = placeBuilder(ctx, facadeTemplate({
    ...g, innerSpan: room.slice ? [room.slice.k0, room.slice.k1] : null, openings, vents: v.vents, airBricks: v.bricks,
  }));
  for (const [u0, u1] of sealedSpans(ctx, room)) placeBuilder(ctx, sealedTemplate(g, u0, u1, room.D - room.T));
  return { door: doorId, glazing: glazingId, facade: facadeId, vents: v.vents };
}
