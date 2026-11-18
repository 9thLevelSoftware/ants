// The minimap's data (GDD 08 3.4 row "Minimap"): a 256 x 256 BU window round the camera target, north up (north is -Z,
// the sun rises in +X). Pure reads of the sim into a reused plain object; the HUD paints it on a canvas a few times a
// second and never keeps it. The zone plate (flat tints) comes from the static zone map, which never changes in a game.
import type { ByteMap, Marker, MarkerKind, Sim } from '@/sim/types';
import { MINIMAP_MAX_FOOD, MINIMAP_MAX_TRAIL_CELLS, MINIMAP_TRAIL_FULL_PH, MINIMAP_WINDOW_BU } from './balance';

export interface MinimapEntrance { x: number; z: number; open: boolean }
export interface MinimapMarker { x: number; z: number; kind: MarkerKind }
export interface MinimapAnt { x: number; z: number; /** Heading on the map, radians; 0 = north (up), clockwise. */ yaw: number | null }
export interface MinimapTrailCell { x: number; z: number; /** 0..1 */ v: number }
export interface MinimapFood { x: number; z: number }
/** A built thing's footprint on the ground: centre, half extents and heading about Y, mm and radians. */
export interface MinimapRect { x: number; z: number; hx: number; hz: number; yaw: number }
/** A water body's footprint, mm. */
export interface MinimapDisc { x: number; z: number; r: number; id: number }

/** What the HUD draws: world mm in, nothing else. Arrays are reused between calls (read them at once). */
export interface MinimapFrame {
  /** Window centre, mm. */
  cx: number;
  cz: number;
  /** Window edge, mm (256 BU). */
  windowMm: number;
  entrances: MinimapEntrance[];
  markers: MinimapMarker[];
  ant: MinimapAnt | null;
  trail: MinimapTrailCell[];
  /** Food sources this colony has found (a source nobody found yet stays off the map), in the window. */
  food: MinimapFood[];
}

/** The zone plate: the zone byte map and the zone type of each byte value. */
export interface MinimapPlate {
  map: ByteMap;
  /** Zone type per byte value (ZoneDef.id), '' where no zone has that id. */
  typeById: string[];
  /** World edge, mm. */
  size: number;
  /** Footprints of the static structures (fences, walls, kerbs, sheds, equipment, cars) and the water bodies: they never change in a game. */
  structures: MinimapRect[];
  water: MinimapDisc[];
}

/** Most structure footprints kept (a locality holds a few hundred pieces at most). */
const MAX_STRUCTURES = 1200;

export function newMinimapFrame(): MinimapFrame {
  return { cx: 0, cz: 0, windowMm: 0, entrances: [], markers: [], ant: null, trail: [], food: [] };
}

export function minimapPlate(sim: Sim): MinimapPlate {
  const typeById: string[] = [];
  for (const z of sim.world.zones) typeById[z.id] = z.type;
  const structures: MinimapRect[] = [];
  for (const o of sim.world.objects) {
    if (!o.tags.includes('structure')) continue;
    for (let i = o.primStart; i < o.primStart + o.primCount && structures.length < MAX_STRUCTURES; i++) {
      const p = sim.world.prims[i];
      if (!p) continue;
      // half extents in the prim's own frame; a cylinder has its radius in x. Heading about Y from the quaternion.
      const round = p.shape === 'cylinder' || p.shape === 'capsule', hx = p.size.x, hz = round ? p.size.x : p.size.z;
      if (Math.max(hx, hz) < sim.world.bu * 0.5) continue;
      structures.push({ x: p.pos.x, z: p.pos.z, hx, hz, yaw: 2 * Math.atan2(p.rot.y, p.rot.w) });
    }
  }
  const water = sim.world.waterBodies.map((w) => ({ x: w.pos.x, z: w.pos.z, r: w.radius, id: w.id }));
  return { map: sim.world.maps.zone, typeById, size: sim.world.size, structures, water };
}

/** Heading of a forward vector on the map (0 = north = -Z, clockwise); null when it points (almost) straight up or down. */
export function mapYaw(fwdX: number, fwdZ: number): number | null {
  if (Math.hypot(fwdX, fwdZ) < 0.15) return null;
  return Math.atan2(fwdX, -fwdZ);
}

const PLAYER_MARKERS = (m: Marker, colony: number): boolean => m.alive && m.colony === colony;

/**
 * Fills `out` from the sim. `focus` is the camera target (mm), `possessedId` -1 when no ant is possessed, `trails` is
 * the scent view being on (the player colony's trail layer is then drawn).
 */
export function buildMinimapFrame(sim: Sim, focus: { x: number; z: number }, possessedId: number, trails: boolean, out: MinimapFrame): MinimapFrame {
  const bu = sim.world.bu;
  const win = MINIMAP_WINDOW_BU * bu, half = win / 2;
  out.cx = focus.x; out.cz = focus.z; out.windowMm = win;
  const playerColony = sim.state.colonies.find((c) => c.isPlayer)?.id ?? -1;

  // Entrances and markers a little outside the window still draw (their icon straddles the edge); the canvas clips.
  const margin = half + 6 * bu;
  const inside = (x: number, z: number): boolean => Math.abs(x - focus.x) <= margin && Math.abs(z - focus.z) <= margin;
  out.entrances.length = 0;
  for (const n of sim.state.nests) {
    if (n.colony !== playerColony) continue;
    for (const e of n.entrances) if (inside(e.pos.x, e.pos.z)) out.entrances.push({ x: e.pos.x, z: e.pos.z, open: e.status === 'open' || e.status === 'reopening' });
  }
  out.markers.length = 0;
  for (const m of sim.state.markers) if (PLAYER_MARKERS(m, playerColony) && inside(m.pos.x, m.pos.z)) out.markers.push({ x: m.pos.x, z: m.pos.z, kind: m.kind });

  const a = possessedId >= 0 ? sim.stores.ants.get(possessedId) : undefined;
  out.ant = a && a.alive ? { x: a.pos.x, z: a.pos.z, yaw: mapYaw(a.fwd.x, a.fwd.z) } : null;

  out.trail.length = 0;
  if (trails && playerColony >= 0 && sim.phero.forEachActiveCell) {
    sim.phero.forEachActiveCell(playerColony, 'trail', (x, _y, z, value) => {
      if (out.trail.length >= MINIMAP_MAX_TRAIL_CELLS || Math.abs(x - focus.x) > half || Math.abs(z - focus.z) > half) return;
      out.trail.push({ x, z, v: Math.min(1, value / MINIMAP_TRAIL_FULL_PH) });
    });
  }

  out.food.length = 0;
  const slot = sim.stores.colonies.get(playerColony)?.rival?.territorySlot ?? 0;
  for (const f of sim.stores.sources.list) {
    if (!f.alive || (f.discoveredBy & (1 << slot)) === 0 || Math.abs(f.pos.x - focus.x) > margin || Math.abs(f.pos.z - focus.z) > margin) continue;
    if (out.food.length < MINIMAP_MAX_FOOD) out.food.push({ x: f.pos.x, z: f.pos.z });
  }
  return out;
}
