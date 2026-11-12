// Giant human sounds (GDD 08 §13.6): a diegetic warning that starts with the sim's telegraph, the main sound while
// the event runs (loops for mower / vacuum / hose, repeats for broom / car / play thumps), thuds on footstep
// impacts, and thunder. All on the `giants` bus with long attenuation distances; while any runs, ambience and
// music duck (§13.2).
import type { Vec3 } from '@/core/math/vec3';
import type { HumanEventKind } from '@/sim/types/ids';
import { BED_FILES, SFX, type AudioFileId } from './assetIds';
import { GIANT_ONESHOTS, THUNDER, type CueSound } from './cueTable';
import { gainToDb, inverseDistanceGain } from './mix';
import type { Listener } from './listener';
import { RECIPES } from './synth/recipes';
import { DISTANCE, GIANT, GIANT_WARNING } from './tuning';
import type { BufferBank } from './engine/buffers';
import type { CuePlayer } from './engine/cuePlayer';
import type { CueLog } from './engine/cueLog';
import type { MixGraph } from './engine/graph';
import { LoopPlayer } from './engine/loopPlayer';
import { PositionalLoop, type SynthLoop } from './engine/positionalLoop';
import type { SynthKit } from './synth/kit';

interface Run {
  kind: HumanEventKind;
  variant: string | null;
  pos: Vec3 | null;
  loop: PositionalLoop | null;
  /** Synth id of the running loop's source (tells whether the main sound needs another source than the warning). */
  loopSynth: string | null;
  nextRepeat: number;
  started: boolean;
  endsAt: number;
}

const TREMOR: CueSound = { ...GIANT_ONESHOTS.footsteps, files: [], synth: 'sub-tremor', mode: 'synth', gainDb: -6, note: 'warning tremor' };
// The tyre roll shares the car's voice key (cue log 'giant.car') with cap 2: one pass plus its tyre layer (§13.6).
const TYRE: CueSound = { ...GIANT_ONESHOTS.car, files: [], synth: 'tyre-roll', mode: 'synth', gainDb: GIANT.tyreGainDb, cap: 2 };
const RUMBLE_SWELL: CueSound = { ...GIANT_ONESHOTS.footsteps, files: [], synth: 'low-rumble', mode: 'synth', gainDb: -10 };
const SPLASH: CueSound = { ...GIANT_ONESHOTS.watering, synth: 'splat', mode: 'file', fileGainDb: 0 };

/** File (if any) and synth fallback of a giant loop. */
function loopSource(kind: HumanEventKind, variant: string | null): { file: AudioFileId | null; synthId: keyof typeof RECIPES } {
  const reel = kind === 'mowing' && variant === 'reel';
  const file = kind === 'mowing' ? (reel ? SFX.lawnmower_push_loop : SFX.lawnmower_loop) : kind === 'watering' ? BED_FILES.rain_light : null;
  const synthId = kind === 'vacuum' ? 'vacuum' : kind === 'watering' ? 'hose-hiss' : reel ? 'reel-whirr' : 'engine';
  return { file, synthId };
}

export class GiantDirector {
  private runs = new Map<number, Run>();
  private tremorUntil = 0;

  constructor(private readonly kit: SynthKit, private readonly bank: BufferBank, private readonly graph: MixGraph, private readonly cues: CuePlayer,
    private readonly listener: () => Listener, private readonly log: CueLog) {}

  private get now(): number { return this.kit.ctx.currentTime; }

  private run(instId: number, kind: HumanEventKind): Run {
    let r = this.runs.get(instId);
    if (!r) {
      r = { kind, variant: null, pos: null, loop: null, loopSynth: null, nextRepeat: Infinity, started: false, endsAt: Infinity };
      this.runs.set(instId, r);
    }
    return r;
  }

  /** Plays a giant one-shot at a position (flat at an assumed distance when unknown). */
  private shot(sound: CueSound, key: string, pos: Vec3 | null, durS?: number, gainDb = 0): void {
    if (pos) { this.cues.play({ key, sound, pos, strength: 1, semis: 0, fileSemis: null, files: null, durS, gainDb }); return; }
    const far = gainToDb(inverseDistanceGain(GIANT.unknownDistanceBu, DISTANCE.giant));
    this.cues.play({ key, sound: { ...sound, space: 'flat' }, pos: null, strength: 1, semis: 0, fileSemis: null, files: null, durS, gainDb: gainDb + far });
  }

  /** Sim `human.telegraph`: the warning phase. `toImpactS` real seconds until the impact. */
  telegraph(instId: number, kind: HumanEventKind, origin: Vec3, toImpactS: number): void {
    const r = this.run(instId, kind);
    r.pos = { ...origin };
    const t = Math.min(GIANT.tremorMaxS, Math.max(GIANT.tremorMinS, toImpactS));
    switch (kind) {
      case 'footsteps':
        this.shot(TREMOR, 'giant.tremor', r.pos, t);
        this.tremorUntil = Math.max(this.tremorUntil, this.now + t);
        break;
      case 'mowing': case 'vacuum': case 'watering':
        if (!r.loop) {
          r.loop = this.startLoop(r, GIANT_WARNING.gainDb, Math.max(1, t));
          r.loop.setTone(GIANT_WARNING.lowpassHz, 0.01);
        }
        break;
      case 'sweeping': this.shot(GIANT_ONESHOTS.sweeping, 'giant.sweeping', r.pos, undefined, -12); break;
      // own key: the pass at human.start must not steal (cut off) the approach roll
      case 'car': this.shot(TYRE, 'giant.car.approach', r.pos, Math.max(GIANT.tyreApproachMinS, t)); break;
      default: break;
    }
  }

  /** Sim `human.start`: the main sound. */
  start(instId: number, kind: HumanEventKind, variant: string | null): void {
    const r = this.run(instId, kind);
    r.variant = variant;
    r.started = true;
    const now = this.now;
    switch (kind) {
      case 'mowing': case 'vacuum': case 'watering':
        // the warning started before the variant was known (telegraph has none): a reel mower swaps the engine out
        if (r.loop && r.loopSynth !== loopSource(kind, variant).synthId) { r.loop.stop(GIANT.loopSwapFadeS); r.loop = null; }
        if (!r.loop) r.loop = this.startLoop(r, 0, 1.5);
        else { r.loop.setLevel(0, 2); r.loop.setTone(20000, 2); }
        if (kind === 'watering') r.nextRepeat = now + GIANT.splashFirstS;
        break;
      case 'sweeping': case 'car': case 'children': r.nextRepeat = now; break;
      case 'food-drop': case 'spill': case 'bait-station': this.shot(GIANT_ONESHOTS[kind], `giant.${kind}`, r.pos); break;
      default: break;
    }
  }

  /** Sim `human.impact`: footfalls thud with a sub sweep and an underground swell. */
  impact(instId: number, kind: HumanEventKind, footprint: Vec3): void {
    const r = this.run(instId, kind);
    r.pos = { ...footprint };
    if (kind === 'footsteps') {
      this.shot(GIANT_ONESHOTS.footsteps, 'giant.footsteps', r.pos);
      this.shot(RUMBLE_SWELL, 'giant.rumble', r.pos);
    }
  }

  end(instId: number): void {
    const r = this.runs.get(instId);
    if (!r) return;
    r.loop?.stop(GIANT.loopFadeOutS);
    this.runs.delete(instId);
  }

  /** `weather.thunder`: a rumble `delayS` after the lightning (clamped to the design's 1-6 s window). */
  thunder(delayS: number, intensity: number): void {
    const d = Math.min(GIANT.thunderDelayMaxS, Math.max(0, delayS));
    this.cues.play({ key: 'thunder', sound: THUNDER, pos: null, strength: intensity, semis: 0, fileSemis: null, files: null, delayS: d });
    this.tremorUntil = Math.max(this.tremorUntil, this.now + d + 3);
  }

  private startLoop(r: Run, gainDb: number, fadeInS: number): PositionalLoop {
    const pos = r.pos ?? this.offsetFromListener();
    const { file, synthId } = loopSource(r.kind, r.variant);
    r.loopSynth = synthId;
    const synth: SynthLoop = { recipe: RECIPES[synthId], pieceS: 8, overlapS: 1.2, rate: 1 };
    const buf = file ? this.bank.get(file) : null;
    if (file && !buf && !this.bank.isMissing(file)) void this.bank.load(file);
    const loop = buf ? new LoopPlayer(this.kit.ctx, buf, this.now, this.kit.rng.next(), 0.05) : null;
    const band: [number, number] | null = r.kind === 'watering' ? [1000, 6000] : null;
    const base = r.kind === 'watering' ? GIANT.hoseLoopDb : GIANT.engineLoopDb;
    this.log.push({ t: this.now, cue: `giant.${r.kind}.loop`, bus: 'giants', gainDb: base + gainDb, source: loop ? `file:${file}` : `synth:${synthId}`, distBu: 0 });
    return new PositionalLoop(this.kit, this.graph.buses.giants, loop, loop ? null : synth, pos, 'giant', base + gainDb, fadeInS, band);
  }

  private offsetFromListener(): Vec3 {
    const l = this.listener();
    const d = GIANT.unknownDistanceBu * l.bu;
    return { x: l.pos.x + l.right.x * d * 0.3, y: l.pos.y, z: l.pos.z + d };
  }

  /** Per frame: follow the listener, feed loops, fire repeats. */
  update(horizonS: number): void {
    const now = this.now;
    const l = this.listener();
    const rng = this.kit.rng;
    for (const r of this.runs.values()) {
      r.loop?.update(l, this.cues.budget, horizonS);
      if (!r.started || r.nextRepeat > now) continue;
      switch (r.kind) {
        case 'sweeping':
          this.shot(GIANT_ONESHOTS.sweeping, 'giant.sweeping', r.pos);
          r.nextRepeat = now + rng.range(GIANT.broomRepeatMinS, GIANT.broomRepeatMaxS);
          break;
        case 'car':
          this.shot(GIANT_ONESHOTS.car, 'giant.car', r.pos);
          this.shot(TYRE, 'giant.car', r.pos, GIANT.tyreUnderPassS);
          r.nextRepeat = now + rng.range(GIANT.carRepeatMinS, GIANT.carRepeatMaxS);
          break;
        case 'children':
          this.shot(GIANT_ONESHOTS.children, 'giant.children', r.pos);
          r.nextRepeat = now + rng.range(GIANT.sandThumpMinS, GIANT.sandThumpMaxS);
          break;
        case 'watering':
          this.shot(SPLASH, 'giant.watering', r.pos, undefined, GIANT.splashGainDb);
          r.nextRepeat = now + rng.range(GIANT.splashRepeatMinS, GIANT.splashRepeatMaxS);
          break;
        default: r.nextRepeat = Infinity;
      }
    }
  }

  /** A giant event (or its warning, or thunder) is audible: duck ambience and music. */
  get active(): boolean { return this.runs.size > 0 || this.now < this.tremorUntil; }
  /** Kinds running (debug). */
  kinds(): string[] { return [...this.runs.values()].map((r) => r.kind + (r.started ? '' : ' (warning)')); }
  childrenActive(): boolean { for (const r of this.runs.values()) if (r.kind === 'children' && r.started) return true; return false; }

  stopAll(): void {
    for (const id of [...this.runs.keys()]) this.end(id);
    this.tremorUntil = 0;
  }
}

