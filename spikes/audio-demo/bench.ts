// CPU check (task AC4): main-thread time per frame of the audio engine with 32 simultaneous positional voices plus
// a full ambience (layers + rain grains + crowd texture). Runs on the live AudioContext so time advances; each
// "frame" = keep 32 voices alive (triggering replacements) + move the listener + runtime.update().
import { AudioRuntime, type RuntimeFrame } from '@/audio';
import { CUE_SOUNDS } from '@/audio/cueTable';
import type { AudioBytesSource } from '@/audio/engine/buffers';
import { ambienceInput, MIX } from './offline';

const KINDS = ['wing-buzz', 'flood', 'prey-struggle', 'stridulate', 'leaf-cut', 'wood-chew', 'grapple', 'water-trickle', 'collapse', 'drum', 'bird-strike', 'antlion-flick'] as const;

export interface BenchResult {
  frames: number; voicesMin: number; voicesAvg: number;
  /** Whole frame (voice starts + update). */
  msMin: number; msMedian: number; msP95: number;
  /** runtime.update() alone (32 voices sounding + ambience), the steady per-frame cost. */
  updateMedian: number; updateP95: number;
  /** Average main-thread cost of starting one voice, ms, and starts per frame. */
  startMs: number; startsPerFrame: number;
  ctxState: string;
}

export async function bench(ctx: AudioContext, bytes: AudioBytesSource | null, frames = 240, voices = 32): Promise<BenchResult> {
  const rt = new AudioRuntime(ctx, { bytes, seed: 3, maxVoices: voices });
  rt.applySettings({ ...MIX, master: 0.0001 }); // inaudible in a browser that can play
  await rt.preloadEffects();
  rt.listener.bu = 4;
  const f: RuntimeFrame = { ambience: ambienceInput({ group: 'woodland', hour: 13, weather: 'rain' }), paused: false, criticalActive: false, calmS: 0, season: 'summer', combat: false, musicMode: 'off' };
  const times: number[] = [], upd: number[] = [];
  let vSum = 0, vMin = Infinity, n = 0, startMs = 0;
  for (let i = 0; i < frames; i++) {
    await new Promise((r) => setTimeout(r, 16));
    const t0 = performance.now();
    while (rt.cues.voices.active < voices) {
      const k = KINDS[n % KINDS.length];
      const s = CUE_SOUNDS[k];
      const a = (n * 2.39996) % (Math.PI * 2);
      rt.cues.play({ key: `bench-${n % voices}`, sound: { ...s, cap: 99 }, pos: { x: Math.cos(a) * 30, y: 1, z: Math.sin(a) * 30 }, strength: 1, semis: 0, fileSemis: null, files: null });
      n++;
      if (n > voices * 1000) break;
    }
    if (i % 3 === 0) rt.cues.cue('step', { x: 1, y: 0, z: 1 }, 1, 'loam'); // feed the crowd texture
    const t1 = performance.now();
    startMs += t1 - t0;
    rt.listener.pos.x = Math.sin(i / 30) * 8;
    rt.update(0.016, f);
    const t2 = performance.now();
    upd.push(t2 - t1);
    times.push(t2 - t0);
    const v = rt.cues.voices.active;
    vSum += v; vMin = Math.min(vMin, v);
  }
  rt.stopAll();
  const s = [...times].sort((a, b) => a - b), u = [...upd].sort((a, b) => a - b);
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return {
    frames, voicesMin: vMin, voicesAvg: r(vSum / frames), msMin: r(s[0]), msMedian: r(s[Math.floor(s.length / 2)]),
    msP95: r(s[Math.floor(s.length * 0.95)]), updateMedian: r(u[Math.floor(u.length / 2)]), updateP95: r(u[Math.floor(u.length * 0.95)]),
    startMs: r(startMs / Math.max(1, n)), startsPerFrame: r(n / frames), ctxState: ctx.state,
  };
}
