// Sound-cue indicators (GDD 08 §3.4 edge pips, §12 accessibility): the information-bearing sounds (tremor warning,
// alarm, drumming, nest crackle, rain onset) get a visual equivalent, an edge pip in the direction of the source, when
// Settings > Accessibility > Sound-cue indicators is on. Driven by the sim's events, not by the audio engine, so the
// pips show with the sound muted or blocked. Real-time presentation only: nothing is saved.
import type { Vec3 } from '@/core';
import type { Sim, SimEvent, WeatherState } from '@/sim/types';
import type { UiSoundCue, UiSoundCueKind } from '@/ui/api';

/** Real seconds a pip stays on screen after its cue. */
export const SOUND_CUE_SHOW_S = 4;
/** At most this many pips at once (newest kept). */
export const SOUND_CUE_MAX = 5;

const RAIN: ReadonlySet<WeatherState> = new Set<WeatherState>(['rain', 'storm']);

/** The cue a sim event is, for the player's colony (null: not an information-bearing sound). */
export function cueOf(ev: SimEvent, playerColony: number): { kind: UiSoundCueKind; pos: Vec3 | null } | null {
  switch (ev.type) {
    case 'human.telegraph': return { kind: 'tremor', pos: ev.origin };
    case 'alarm-raised': return ev.colonyId === playerColony ? { kind: 'alarm', pos: ev.pos } : null;
    case 'drum': return { kind: 'drum', pos: ev.pos };
    case 'collapse-warning': return { kind: 'crackle', pos: ev.center };
    case 'weather.changed': return RAIN.has(ev.to) && !RAIN.has(ev.from) ? { kind: 'rain', pos: null } : null;
    default: return null;
  }
}

interface Live { id: number; kind: UiSoundCueKind; pos: Vec3 | null; untilS: number }

export interface CameraView { pos: Vec3; forward: Vec3; up: Vec3; fovDeg: number; aspect: number }

/**
 * Screen direction of a world point from the camera: the angle of the pip on the screen edge (0 = right, 90 = up,
 * degrees) and whether the point is inside the view. A point behind the camera points the way to turn.
 */
export function cueDirection(p: Vec3, cam: CameraView): { angleDeg: number; onScreen: boolean } {
  const f = cam.forward, u = cam.up;
  // right = forward x up
  const r = { x: f.y * u.z - f.z * u.y, y: f.z * u.x - f.x * u.z, z: f.x * u.y - f.y * u.x };
  const d = { x: p.x - cam.pos.x, y: p.y - cam.pos.y, z: p.z - cam.pos.z };
  const x = d.x * r.x + d.y * r.y + d.z * r.z, y = d.x * u.x + d.y * u.y + d.z * u.z, z = d.x * f.x + d.y * f.y + d.z * f.z;
  const t = Math.tan((cam.fovDeg * Math.PI) / 360);
  const onScreen = z > 0 && Math.abs(y / z) <= t && Math.abs(x / z) <= t * cam.aspect;
  const angleDeg = (Math.atan2(y, x || 1e-9) * 180) / Math.PI;
  return { angleDeg, onScreen };
}

/** Follows one sim's events; `list` gives the pips to draw now. */
export class SoundCueTracker {
  private live: Live[] = [];
  private nextId = 1;
  private off: (() => void) | null = null;

  attach(sim: Sim, nowS: () => number): void {
    this.detach();
    const offs = ['human.telegraph', 'alarm-raised', 'drum', 'collapse-warning', 'weather.changed'].map((type) =>
      sim.events.on(type as never, (ev: SimEvent) => this.note(ev, sim.state.colonies[0]?.id ?? -1, nowS())));
    this.off = () => offs.forEach((o) => o());
  }

  detach(): void {
    this.off?.();
    this.off = null;
    this.live = [];
  }

  /** Records a cue; a cue of a kind already showing replaces it (one pip per kind). */
  note(ev: SimEvent, playerColony: number, nowS: number): void {
    const c = cueOf(ev, playerColony);
    if (!c) return;
    this.live = this.live.filter((l) => l.kind !== c.kind);
    this.live.push({ id: this.nextId++, kind: c.kind, pos: c.pos ? { ...c.pos } : null, untilS: nowS + SOUND_CUE_SHOW_S });
    if (this.live.length > SOUND_CUE_MAX) this.live.splice(0, this.live.length - SOUND_CUE_MAX);
  }

  /** Pips to draw at `nowS` for this camera (expired cues are dropped). */
  list(nowS: number, cam: CameraView): UiSoundCue[] {
    this.live = this.live.filter((l) => l.untilS > nowS);
    return this.live.map((l) => {
      if (!l.pos) return { id: l.id, kind: l.kind, angleDeg: null, onScreen: false };
      const d = cueDirection(l.pos, cam);
      return { id: l.id, kind: l.kind, angleDeg: Math.round(d.angleDeg), onScreen: d.onScreen };
    });
  }
}
