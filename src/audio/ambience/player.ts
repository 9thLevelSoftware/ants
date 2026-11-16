// Ambience on Web Audio (GDD 08 §13.4): one channel per layer (crossfading file loop, or a synth bed when the file
// is missing / the layer is synthetic), gains glide to the matrix targets, surface layers pass through the
// underground occlusion filter, and granular grains (droplets, ticks, nest murmur, drips, creaks) are scheduled
// ahead. Channels are created when a layer becomes audible and released after a long silence.
import { dbToGain } from '../mix';
import { BEDS, type BedHandle } from '../synth/beds';
import { RECIPES } from '../synth/recipes';
import type { SynthKit } from '../synth/kit';
import { AMBIENCE, LAYER_TRIM_DB, OPEN_CUTOFF_HZ } from '../tuning';
import type { BufferBank } from '../engine/buffers';
import { LoopPlayer } from '../engine/loopPlayer';
import { playShot } from '../engine/shots';
import { CUE_SOUNDS, AMBIENT_ONESHOTS } from '../cueTable';
import { LAYER_IDS, LAYERS, type LayerId } from './layers';
import type { AmbienceTarget } from './matrix';

const AUDIBLE = 1e-3;
/** Linear per-layer trims (tuning LAYER_TRIM_DB). */
const TRIM: Partial<Record<string, number>> = Object.fromEntries(Object.entries(LAYER_TRIM_DB).map(([k, v]) => [k, dbToGain(v ?? 0)]));

interface Channel {
  id: LayerId;
  gain: GainNode;
  source: { kind: 'file'; loop: LoopPlayer; file: string } | { kind: 'synth'; bed: BedHandle } | { kind: 'loading' };
  silentSince: number;
}

type GrainKey = 'droplets' | 'heatTicks' | 'iceTicks' | 'nestTicks' | 'drips' | 'crackle';
const GRAIN_RECIPE: Record<Exclude<GrainKey, 'drips'>, keyof typeof RECIPES> = {
  droplets: 'droplet', heatTicks: 'heat-tick', iceTicks: 'ice-tick', nestTicks: 'nest-tick', crackle: 'crackle',
};
const GRAIN_GAIN_DB: Record<GrainKey, number> = { ...AMBIENCE.grainGainDb, crackle: AMBIENCE.crackleGainDb };

export class AmbiencePlayer {
  private channels = new Map<LayerId, Channel>();
  private readonly surface: GainNode;
  private readonly surfaceLp: BiquadFilterNode;
  private readonly under: GainNode;
  private nextGrain: Record<GrainKey, number> = { droplets: 0, heatTicks: 0, iceTicks: 0, nestTicks: 0, drips: 0, crackle: 0 };
  private nextCreak = Infinity;
  /** Last target applied (debug read-out). */
  last: AmbienceTarget | null = null;

  constructor(private readonly kit: SynthKit, private readonly bank: BufferBank, out: AudioNode) {
    const ctx = kit.ctx;
    this.surface = ctx.createGain();
    this.surfaceLp = ctx.createBiquadFilter();
    this.surfaceLp.type = 'lowpass';
    this.surfaceLp.frequency.value = OPEN_CUTOFF_HZ;
    this.surface.connect(this.surfaceLp).connect(out);
    this.under = ctx.createGain();
    this.under.connect(out);
  }

  /** Apply a matrix target; schedule loops and grains until now + horizonS. */
  update(target: AmbienceTarget, horizonS: number, smoothS = AMBIENCE.smoothS): void {
    const now = this.kit.ctx.currentTime;
    this.last = target;
    const tau = smoothS / 3;
    this.surfaceLp.frequency.setTargetAtTime(target.surface.cutoffHz, now, tau);
    this.surface.gain.setTargetAtTime(dbToGain(target.surface.gainDb), now, tau);
    for (const id of LAYER_IDS) {
      const want = target.layers[id];
      let ch = this.channels.get(id);
      if (!ch && want > AUDIBLE) ch = this.open(id);
      if (!ch) continue;
      ch.gain.gain.setTargetAtTime(want * (TRIM[id] ?? 1), now, tau);
      if (want > AUDIBLE) ch.silentSince = Infinity;
      else if (ch.silentSince === Infinity) ch.silentSince = now;
      else if (now - ch.silentSince > AMBIENCE.releaseAfterSilentS) { this.close(ch, now); continue; }
      if (ch.source.kind === 'file') ch.source.loop.pump(now + horizonS);
    }
    this.scheduleGrains(target, now, horizonS);
    const inUse = new Set<string>();
    for (const ch of this.channels.values()) if (ch.source.kind === 'file') inUse.add(ch.source.file);
    this.bank.trimBeds(inUse);
  }

  private open(id: LayerId): Channel {
    const def = LAYERS[id];
    const ctx = this.kit.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let head: AudioNode = gain;
    if (def.lowpassHz > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = def.lowpassHz;
      gain.connect(lp);
      head = lp;
    }
    head.connect(def.surface ? this.surface : this.under);
    const ch: Channel = { id, gain, source: { kind: 'loading' }, silentSince: Infinity };
    this.channels.set(id, ch);
    const useSynth = () => {
      if (this.channels.get(id) !== ch) return;
      const bed = BEDS[def.synth](this.kit, this.kit.ctx.currentTime);
      bed.output.connect(gain);
      ch.source = { kind: 'synth', bed };
    };
    const useFile = (buf: AudioBuffer) => {
      if (this.channels.get(id) !== ch) return;
      const t = this.kit.ctx.currentTime;
      const loop = new LoopPlayer(ctx, buf, t, this.kit.rng.next(), 0.5);
      loop.output.connect(gain);
      ch.source = { kind: 'file', loop, file: def.file! };
    };
    if (!def.file || this.bank.isMissing(def.file)) useSynth();
    else {
      const buf = this.bank.get(def.file);
      if (buf) useFile(buf);
      else void this.bank.load(def.file).then((b) => (b ? useFile(b) : useSynth()));
    }
    return ch;
  }

  private close(ch: Channel, now: number): void {
    if (ch.source.kind === 'file') ch.source.loop.stop(now, 0.05);
    else if (ch.source.kind === 'synth') ch.source.bed.stop(now + 0.05);
    try { ch.gain.disconnect(); } catch { /* ignore */ }
    this.channels.delete(ch.id);
  }

  private scheduleGrains(target: AmbienceTarget, now: number, horizonS: number): void {
    const rng = this.kit.rng;
    const until = now + horizonS;
    const g = target.grains;
    for (const key of Object.keys(this.nextGrain) as GrainKey[]) {
      const rate = g[key];
      if (!(rate > 0)) { this.nextGrain[key] = 0; continue; }
      if (this.nextGrain[key] < now) this.nextGrain[key] = now + rng.expWait(rate);
      const surfaceGrain = key === 'droplets' || key === 'heatTicks' || key === 'iceTicks';
      const out = surfaceGrain ? this.surface : this.under;
      while (this.nextGrain[key] < until) {
        const t = this.nextGrain[key];
        const gain = dbToGain(GRAIN_GAIN_DB[key]) * rng.range(0.4, 1);
        if (key === 'drips') playShot({ kit: this.kit, bank: this.bank }, CUE_SOUNDS.drip, t, gain, out, { semis: 0, fileSemis: null, strength: 1, files: null });
        else RECIPES[GRAIN_RECIPE[key]](this.kit, out, t, { gain, rate: 1, strength: 1 });
        this.nextGrain[key] += rng.expWait(rate);
      }
    }
    // Camponotus wood nest: a creak every 20-60 real s
    if (g.woodCreakEveryS > 0) {
      if (!Number.isFinite(this.nextCreak)) this.nextCreak = now + rng.range(AMBIENCE.woodCreakMinS, AMBIENCE.woodCreakMaxS) * 0.5;
      while (this.nextCreak < until) {
        playShot({ kit: this.kit, bank: this.bank }, AMBIENT_ONESHOTS['wood-creak'], this.nextCreak, dbToGain(AMBIENCE.woodCreakGainDb), this.under, { semis: 0, fileSemis: null, strength: 1, files: null });
        this.nextCreak += rng.range(AMBIENCE.woodCreakMinS, AMBIENCE.woodCreakMaxS);
      }
    } else this.nextCreak = Infinity;
  }

  /** Layers with an open channel and what feeds them (debug read-out, E28). */
  sources(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [id, ch] of this.channels) {
      out[id] = ch.source.kind === 'file' ? `file:${ch.source.file}` : ch.source.kind === 'synth' ? `synth:${LAYERS[id].synth}` : 'loading';
    }
    return out;
  }

  /** Current surface filter (E16 read-out). */
  surfaceFilter(): { cutoffHz: number; gainDb: number } {
    return this.last ? { ...this.last.surface } : { cutoffHz: OPEN_CUTOFF_HZ, gainDb: 0 };
  }

  stopAll(): void {
    const now = this.kit.ctx.currentTime;
    for (const ch of [...this.channels.values()]) this.close(ch, now);
  }
}

