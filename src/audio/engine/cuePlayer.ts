// Positional effects (GDD 08 §13.3, §13.5): cue -> sound, distance and occlusion, voice limiting with priorities,
// pitch / file round-robin variation, and the crowd texture that replaces single footsteps in a crowd.
// Voice graph: shot layers -> voice gain -> occlusion low-pass -> stereo pan -> bus.
import type { Vec3 } from '@/core/math/vec3';
import { raindropSemis, resolveCue, type CueSound } from '../cueTable';
import { dbToGain, gainToDb } from '../mix';
import { distBu, type Listener } from '../listener';
import { newSpatial, spatialize, TraceBudget, type Spatial } from '../spatial';
import { RECIPES } from '../synth/recipes';
import { ALARM_PLUME_BU, AUDIO_MAX_VOICES, CREATURE_NEAR_BU, CROWD, POSSESSED_RADIUS_BU, PRIORITY, WEATHER_NEAR_BU } from '../tuning';
import { CrowdMeter, VoiceTable, type Admission } from '../voices';
import type { CueLog } from './cueLog';
import type { MixGraph } from './graph';
import { playShot, type ShotEnv, type ShotOptions } from './shots';
import type { AudioFileId } from '../assetIds';

interface LiveVoice {
  id: number;
  gain: GainNode;
  filter: BiquadFilterNode | null;
  pan: StereoPannerNode | null;
  endTime: number;
}

export interface PlayRequest {
  key: string;
  sound: CueSound;
  pos: Vec3 | null;
  strength: number;
  semis: number;
  fileSemis: number | null;
  files: AudioFileId[] | null;
  durS?: number;
  /** Extra gain, dB. */
  gainDb?: number;
}

export class CuePlayer {
  readonly voices = new VoiceTable(AUDIO_MAX_VOICES);
  private live = new Map<number, LiveVoice>();
  private readonly budget = new TraceBudget();
  private readonly sp: Spatial = newSpatial();
  private readonly adm: Admission = { ok: false, steal: -1 };
  private readonly steps = new CrowdMeter(CROWD.windowS, CROWD.singleVoiceMaxRate);
  private patterNext = 0;
  /** Set by the owner when audio must stay silent (no context, muted world). */
  enabled = true;

  constructor(private readonly env: ShotEnv, private readonly graph: MixGraph, private readonly log: CueLog, private readonly listener: () => Listener) {}

  private get ctx(): BaseAudioContext { return this.env.kit.ctx; }

  /** A simulation cue event. */
  cue(cue: string, pos: Vec3 | null, strength: number, material: string | null = null): void {
    const now = this.ctx.currentTime;
    const r = resolveCue(cue, strength, material);
    if (!r) {
      if (this.log.firstUnknown(cue)) this.log.push({ t: now, cue, bus: '-', gainDb: -Infinity, source: 'unknown', distBu: 0 });
      return;
    }
    const s = r.sound;
    if (s.silent) { this.log.push({ t: now, cue, bus: '-', gainDb: -Infinity, source: 'silent', distBu: 0 }); return; }
    const l = this.listener();
    if (s.plumeOnly && (!l.possessedPos || !pos || distBu(l.possessedPos, pos, l.bu) > ALARM_PLUME_BU)) return;
    if (r.key === 'step' && !this.steps.note(now)) return; // the crowd texture takes over (update())
    const semisOff = r.semis;
    let fileSemis: number | null = null, space = s.space;
    if (cue === 'raindrop-hit') {
      fileSemis = raindropSemis(strength);
      if (pos && distBu(l.pos, pos, l.bu) < WEATHER_NEAR_BU) space = 'flat';
    }
    let sound = space === s.space ? s : { ...s, space };
    if (cue === 'bite' && strength <= 0.5) sound = { ...sound, mode: 'synth' }; // crunch layer only for hard prey
    this.play({ key: r.key, sound, pos, strength, semis: semisOff, fileSemis, files: r.files });
  }

  /** Plays a resolved sound; returns the voice id (-1 when culled / refused). */
  play(req: PlayRequest): number {
    const now = this.ctx.currentTime;
    const s = req.sound;
    if (!this.enabled) return -1;
    const l = this.listener();
    const sp = spatialize(l, s.space, req.pos, this.budget, this.sp);
    if (!sp.audible) {
      this.log.push({ t: now, cue: req.key, bus: s.bus, gainDb: -Infinity, source: 'culled', distBu: sp.distBu });
      return -1;
    }
    const strengthK = 0.5 + 0.5 * Math.min(1, Math.max(0, req.strength));
    const peak = dbToGain(s.gainDb + (req.gainDb ?? 0)) * strengthK;
    const heard = peak * sp.gain;
    const priority = this.priorityOf(s, req.pos, sp.distBu, l);
    this.voices.admit(req.key, priority, heard, s.cap, now, this.adm);
    if (!this.adm.ok) {
      this.log.push({ t: now, cue: req.key, bus: s.bus, gainDb: gainToDb(heard), source: 'refused', distBu: sp.distBu });
      return -1;
    }
    if (this.adm.steal >= 0) this.steal(this.adm.steal, now);
    const v = this.makeVoice(s.bus, sp, s.space !== 'flat', now);
    v.gain.gain.value = sp.gain;
    const opts: ShotOptions = { semis: req.semis, fileSemis: req.fileSemis, strength: req.strength, files: req.files, durS: req.durS };
    const res = playShot(this.env, s, now, peak, v.gain, opts);
    v.endTime = now + res.durationS + 0.05;
    v.id = this.voices.add(req.key, priority, heard, v.endTime);
    this.live.set(v.id, v);
    const src = [res.usedFile ? `file:${res.usedFile}` : '', res.usedSynth && s.synth ? `synth:${s.synth}` : ''].filter(Boolean).join('+');
    this.log.push({ t: now, cue: req.key, bus: s.bus, gainDb: gainToDb(heard), source: src || 'none', distBu: sp.distBu });
    return v.id;
  }

  private priorityOf(s: CueSound, pos: Vec3 | null, d: number, l: Listener): number {
    if (l.possessedPos && pos && distBu(l.possessedPos, pos, l.bu) <= POSSESSED_RADIUS_BU) return PRIORITY.possessed;
    if (s.bus === 'ui') return PRIORITY.ui;
    if (s.space === 'giant' || s.bus === 'giants') return PRIORITY.giant;
    if (s.space === 'creature' && d <= CREATURE_NEAR_BU) return PRIORITY.creatureNear;
    return s.priority;
  }

  private makeVoice(bus: CueSound['bus'], sp: Spatial, positional: boolean, _now: number): LiveVoice {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    let filter: BiquadFilterNode | null = null, pan: StereoPannerNode | null = null;
    let tail: AudioNode = gain;
    if (positional) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = sp.cutoffHz;
      pan = ctx.createStereoPanner();
      pan.pan.value = sp.pan;
      gain.connect(filter).connect(pan);
      tail = pan;
    }
    tail.connect(this.graph.buses[bus]);
    return { id: -1, gain, filter, pan, endTime: 0 };
  }

  private steal(id: number, now: number): void {
    const v = this.live.get(id);
    this.voices.remove(id, true);
    if (!v) return;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(0, now, 0.01);
    v.endTime = now + 0.06;
  }

  /** Per frame: retire finished voices, run the crowd texture, reset the trace budget. */
  update(horizonS: number): void {
    const now = this.ctx.currentTime;
    this.budget.reset();
    this.voices.purge(now);
    for (const [id, v] of this.live) {
      if (v.endTime > now) continue;
      try { v.gain.disconnect(); v.pan?.disconnect(); } catch { /* ignore */ }
      this.live.delete(id);
    }
    // crowd texture: footsteps beyond the single-voice rate become a soft granular patter
    const excess = Math.min(CROWD.textureMaxRate, Math.max(0, this.steps.rate(now) - CROWD.singleVoiceMaxRate));
    if (excess <= 0 || !this.enabled) { this.patterNext = now; return; }
    if (this.patterNext < now) this.patterNext = now;
    const rng = this.env.kit.rng;
    const g = dbToGain(CROWD.textureGainDb);
    while (this.patterNext < now + horizonS) {
      RECIPES.patter(this.env.kit, this.graph.buses.effects, this.patterNext, { gain: g * rng.range(0.4, 1), rate: 1, strength: 1 });
      this.patterNext += rng.expWait(excess);
    }
  }

  /** Steps per real second in the crowd window (debug). */
  stepRate(): number { return this.steps.rate(this.ctx.currentTime); }

  get liveCount(): number { return this.live.size; }

  stopAll(): void {
    const now = this.ctx.currentTime;
    for (const id of [...this.live.keys()]) this.steal(id, now);
    this.voices.clear();
  }
}
