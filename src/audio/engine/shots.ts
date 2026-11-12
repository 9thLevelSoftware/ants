// Plays one CueSound: a file layer (round-robin file, random pitch in range, optional slice) and/or a synth layer.
// A file that is not decoded yet is requested for next time and the synth fallback plays now (§13.1: loading
// never blocks; missing files fall back to synthesis).
import type { CueSound } from '../cueTable';
import { dbToGain, semis } from '../mix';
import { RECIPES } from '../synth/recipes';
import type { SynthKit } from '../synth/kit';
import type { BufferBank } from './buffers';
import type { AudioFileId } from '../assetIds';

export interface ShotEnv {
  kit: SynthKit;
  bank: BufferBank;
}

export interface ShotOptions {
  /** Extra pitch for both layers, semitones. */
  semis: number;
  /** Fixed file pitch (overrides the random range), semitones; null = random in the sound's range. */
  fileSemis: number | null;
  strength: number;
  files: AudioFileId[] | null;
  /** Duration for sustained synth shots. */
  durS?: number;
}

export interface ShotResult {
  durationS: number;
  usedFile: AudioFileId | null;
  usedSynth: boolean;
}

const EDGE_S = 0.004;

/** Plays `sound` into `out` at time t with linear gain `gain`. */
export function playShot(env: ShotEnv, sound: CueSound, t: number, gain: number, out: AudioNode, o: ShotOptions): ShotResult {
  const { kit, bank } = env;
  const rng = kit.rng;
  const files = o.files ?? sound.files;
  let usedFile: AudioFileId | null = null;
  let dur = 0;
  let buf: AudioBuffer | null = null;
  if (files.length > 0 && sound.mode !== 'synth') {
    const id = files[rng.int(0, files.length - 1)];
    buf = bank.get(id);
    if (!buf && !bank.isMissing(id)) void bank.load(id);
    if (buf) usedFile = id;
  }
  if (buf && usedFile) {
    const st = o.fileSemis ?? rng.range(sound.fileSemis[0], sound.fileSemis[1]);
    const rate = semis(st + o.semis);
    const src = kit.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = kit.ctx.createGain();
    const peak = gain * dbToGain(sound.fileGainDb);
    let len: number, offset = 0;
    if (sound.slice) {
      len = Math.min(buf.duration, rng.range(sound.slice[0], sound.slice[1]) * rate);
      offset = rng.range(0, Math.max(0, buf.duration - len));
    } else len = buf.duration;
    const realLen = len / rate;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + EDGE_S);
    g.gain.setValueAtTime(peak, t + Math.max(EDGE_S, realLen - EDGE_S));
    g.gain.linearRampToValueAtTime(0, t + realLen);
    src.connect(g).connect(out);
    src.start(t, offset, len);
    src.onended = () => { try { g.disconnect(); } catch { /* ignore */ } };
    dur = realLen;
  }
  const synthWanted = sound.synth !== null && (sound.mode !== 'file' || !usedFile);
  if (synthWanted && sound.synth) {
    const r = RECIPES[sound.synth];
    const rate = semis(rng.range(sound.synthSemis[0], sound.synthSemis[1]) + o.semis);
    if (r) dur = Math.max(dur, r(kit, out, t, { gain, rate, strength: o.strength, durS: o.durS }));
  }
  return { durationS: dur, usedFile, usedSynth: synthWanted };
}
