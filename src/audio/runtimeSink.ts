// The event router's view of the audio runtime (eventRouter.ts AudioSink): cues through the cue player, giant events
// through the giant director, interface sounds through the UI player.
import type { Vec3 } from '@/core/math/vec3';
import type { HumanEventKind } from '@/sim/types/ids';
import type { AudioSink, CueExtra } from './eventRouter';
import { surfaceOcclusion } from './mix';
import type { MusicTrigger } from './music/compose';
import type { AudioRuntime } from './runtime';
import type { UiSoundId } from './uiSounds';

export class RuntimeSink implements AudioSink {
  constructor(private readonly rt: AudioRuntime) {}

  cue(cue: string, pos: Vec3 | null, strength: number, material: string | null = null, extra?: CueExtra): void {
    this.rt.cues.cue(cue, pos, strength, material, extra);
  }
  ui(id: UiSoundId, extraDb = 0): void { this.rt.ui.play(id, extraDb); }
  giantTelegraph(instId: number, kind: HumanEventKind, origin: Vec3, toImpactS: number): void { this.rt.giants.telegraph(instId, kind, origin, toImpactS); }
  giantStart(instId: number, kind: HumanEventKind, variant: string | null): void { this.rt.giants.start(instId, kind, variant); }
  giantImpact(instId: number, kind: HumanEventKind, footprint: Vec3, contact: string): void { this.rt.giants.impact(instId, kind, footprint, contact); }
  giantEnd(instId: number): void { this.rt.giants.end(instId); }
  thunder(delayS: number, intensity: number): void { this.rt.giants.thunder(delayS, intensity); }
  musicTrigger(kind: MusicTrigger): void { this.rt.musicTrigger(kind); }
  surfaceDb(): number {
    const l = this.rt.listener;
    return surfaceOcclusion(l.depthBu, l.underground).gainDb;
  }
}
