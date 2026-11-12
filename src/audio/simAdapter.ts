// Reads what the audio needs from the running simulation (read only, architecture §2): the listener (possessed ant's
// head or the camera), depth below ground, line-of-sight through solid, and the ambience inputs (habitat around the
// listener, time of day, weather, nest murmur density, chamber humidity, wood nests).
import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import { zoneAt } from '@/sim/world';
import { calendarNow } from '@/sim/environment/calendar';
import type { ZoneType } from '@/sim/types/ids';
import { groupWeights, type AmbienceInput } from './ambience/matrix';
import type { Listener } from './listener';
import { AMBIENCE, LOS_OCCLUSION } from './tuning';

export interface CameraLike {
  position: { x: number; y: number; z: number };
  matrixWorld: { elements: ArrayLike<number> };
}

export interface ListenerFrame {
  camera: CameraLike;
  /** Camera focus point (observer / colony views), null = camera position. */
  focus: Vec3 | null;
  /** Possessed ant id and whether the possession view is active. */
  possessedId: number;
  possessView: boolean;
  /** The game's camera-underground flag. */
  underground: boolean;
}

/** Fills `l` from the sim and the camera. */
export function updateListener(sim: Sim, f: ListenerFrame, l: Listener): void {
  const bu = sim.world.bu;
  l.bu = bu;
  const e = f.camera.matrixWorld.elements;
  const rl = Math.hypot(e[0], e[1], e[2]) || 1;
  l.right.x = e[0] / rl; l.right.y = e[1] / rl; l.right.z = e[2] / rl;
  const ant = f.possessedId >= 0 ? sim.stores.ants.get(f.possessedId) : undefined;
  if (ant) {
    l.possessedPos = l.possessedPos ?? { x: 0, y: 0, z: 0 };
    l.possessedPos.x = ant.pos.x; l.possessedPos.y = ant.pos.y; l.possessedPos.z = ant.pos.z;
  } else l.possessedPos = null;
  if (ant && f.possessView) {
    // the ant's head: half a body length forward, a little above the body
    l.pos.x = ant.pos.x + ant.fwd.x * 0.5 * bu + ant.up.x * 0.3 * bu;
    l.pos.y = ant.pos.y + ant.fwd.y * 0.5 * bu + ant.up.y * 0.3 * bu;
    l.pos.z = ant.pos.z + ant.fwd.z * 0.5 * bu + ant.up.z * 0.3 * bu;
    l.hear.x = l.pos.x; l.hear.y = l.pos.y; l.hear.z = l.pos.z;
  } else {
    const c = f.camera.position;
    l.pos.x = c.x; l.pos.y = c.y; l.pos.z = c.z;
    const h = f.focus ?? c;
    l.hear.x = h.x; l.hear.y = h.y; l.hear.z = h.z;
  }
  const ground = sim.field.height(l.pos.x, l.pos.z);
  const depth = Math.max(0, (ground - l.pos.y) / bu);
  l.underground = f.underground || (!!ant && f.possessView && depth > 0.5);
  l.depthBu = l.underground ? depth : 0;
  l.groundAt ??= (x, z) => sim.field.height(x, z);
  l.solidBetween ??= (a, b) => solidBetween(sim, a, b);
}

/** True when any interior sample of the segment a-b lies inside solid (f < 0). */
export function solidBetween(sim: Sim, a: Vec3, b: Vec3): boolean {
  const n = LOS_OCCLUSION.samples;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (sim.field.sampleXYZ(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t) < 0) return true;
  }
  return false;
}

const ZONES: ZoneType[] = new Array(9);
const WEIGHTS = [1, 2, 1, 2, 4, 2, 1, 2, 1];
const scratch: number[] = [];

export function newAmbienceInput(): AmbienceInput {
  return {
    groups: { 'woodland': 0, 'open-green': 1, 'hard': 0, 'play': 0, 'interior': 0 }, hour: 12, sunrise: 6, sunset: 20,
    weather: 'clear', precip: 0, underground: false, depthBu: 0, nearAnts: 0, humidity: null, woodNest: false, colonyAnts: 0,
    childrenActive: false, voicesAllowed: false,
  };
}

/** Fills the ambience inputs (call a few times per second). */
export function updateAmbienceInput(sim: Sim, l: Listener, voicesAllowed: boolean, possessedChamber: number, out: AmbienceInput): AmbienceInput {
  const half = (AMBIENCE.zoneCrossfadeBu / 2) * l.bu;
  let k = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ZONES[k++] = zoneAt(sim.world, l.pos.x + dx * half, l.pos.z + dz * half);
  groupWeights(ZONES, WEIGHTS, out.groups);
  const cal = calendarNow(sim);
  out.hour = cal.hour;
  out.sunrise = cal.sunrise;
  out.sunset = cal.sunset;
  const w = sim.state.env.weather;
  out.weather = w.state;
  out.precip = w.precip;
  out.underground = l.underground;
  out.depthBu = l.depthBu;
  out.nearAnts = l.underground ? sim.index.queryAnts(l.pos, AMBIENCE.nestMurmurRadiusBu * l.bu, scratch).length : 0;
  out.humidity = null;
  if (l.underground && possessedChamber >= 0) {
    for (const n of sim.state.nests) {
      const c = n.chambers.find((ch) => ch.id === possessedChamber);
      if (c) { out.humidity = c.humidity; break; }
    }
  }
  const player = sim.state.colonies[0];
  out.woodNest = l.underground && !!player && player.species === 'camponotus-pennsylvanicus';
  out.colonyAnts = out.woodNest ? countAnts(sim, player.id) : 0;
  out.childrenActive = false;
  out.voicesAllowed = voicesAllowed;
  return out;
}

function countAnts(sim: Sim, colony: number): number {
  let n = 0;
  for (const a of sim.state.ants) if (a.alive && a.colony === colony) n++;
  return n;
}
