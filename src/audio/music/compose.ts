// Generative music, pure part (GDD 08 §13.9): modes by season, sparse phrases of 3-9 notes at 54-66 bpm, the
// milestone motif, and the director deciding when a phrase may start. No recorded music ships.
import type { Season } from '@/sim/types/ids';
import type { AudioRng } from '../rng';
import { MUSIC } from '../tuning';

export interface Mode { root: number; steps: readonly number[]; halfDensity: boolean }

/** Spring D Dorian, summer F Lydian, autumn A Aeolian, winter E Phrygian at half density. Roots are MIDI notes. */
export const SEASON_MODES: Record<Season, Mode> = {
  spring: { root: 62, steps: [0, 2, 3, 5, 7, 9, 10], halfDensity: false },
  summer: { root: 65, steps: [0, 2, 4, 6, 7, 9, 11], halfDensity: false },
  autumn: { root: 57, steps: [0, 2, 3, 5, 7, 8, 10], halfDensity: false },
  winter: { root: 64, steps: [0, 1, 3, 5, 7, 8, 10], halfDensity: true },
};

export type MusicVoice = 'bell' | 'pad' | 'pulse';
export interface Note { t: number; midi: number; dur: number; voice: MusicVoice; vel: number }
export interface Phrase { notes: Note[]; lengthS: number; bpm: number }

/** MIDI note of a scale degree (may be negative or beyond 7: octaves wrap). */
export function degreeToMidi(m: Mode, degree: number): number {
  const n = m.steps.length;
  const oct = Math.floor(degree / n);
  const i = ((degree % n) + n) % n;
  return m.root + 12 * oct + m.steps[i];
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function composePhrase(season: Season, rng: AudioRng): Phrase {
  const m = SEASON_MODES[season];
  const bpm = rng.range(MUSIC.tempoMinBpm, MUSIC.tempoMaxBpm);
  const beat = 60 / bpm;
  const n = rng.int(MUSIC.phraseMinNotes, MUSIC.phraseMaxNotes);
  const notes: Note[] = [];
  let degree = rng.int(0, 4);
  let t = 0;
  // low wooden pulse and a bowed pad on the tonic under the start of the phrase
  notes.push({ t: 0, midi: degreeToMidi(m, 0) - 24, dur: beat * 0.5, voice: 'pulse', vel: 0.5 });
  for (let i = 0; i < n; i++) {
    const beats = rng.pick([1, 1, 2, 2, 3]) * (m.halfDensity ? 2 : 1);
    notes.push({ t, midi: degreeToMidi(m, degree), dur: beat * beats * 0.9, voice: 'bell', vel: rng.range(0.45, 0.8) });
    t += beat * beats;
    degree += rng.pick([-2, -1, -1, 1, 1, 2, 3]);
    degree = Math.max(-3, Math.min(9, degree));
  }
  const total = t + beat * 2;
  notes.push({ t: 0, midi: degreeToMidi(m, 0) - 12, dur: total, voice: 'pad', vel: 0.35 });
  notes.push({ t: beat * 0.5, midi: degreeToMidi(m, 4) - 12, dur: total - beat * 0.5, voice: 'pad', vel: 0.25 });
  return { notes, lengthS: total, bpm };
}

/** Milestone motif: three rising notes (degrees 0, 2, 4) of the season's scale, 0.18 s apart. */
export function milestoneMotif(season: Season): Note[] {
  const m = SEASON_MODES[season];
  return [0, 2, 4].map((d, i) => ({ t: i * 0.18, midi: degreeToMidi(m, d) + 12, dur: 0.5, voice: 'bell' as const, vel: 0.7 }));
}

export type MusicTrigger = 'dawn' | 'dusk' | 'colony-view' | 'milestone' | 'timelapse-end';
export const TRIGGER_TTL_S = 30;

export interface DirectorInput {
  mode: 'off' | 'sparse' | 'frequent';
  /** Giant event running or the possessed ant in combat: music never plays. */
  blocked: boolean;
  /** Seconds since the last warning / critical alert. */
  calmS: number;
}

/**
 * Decides when a phrase starts: only after the gap since the previous phrase (90-360 s, halved for `frequent`)
 * and only on a trigger (a recent event trigger or 2 real minutes of calm).
 */
export class MusicDirector {
  private lastEnd = -Infinity;
  private gapS = 0;
  private trigger: { kind: MusicTrigger; at: number } | null = null;

  constructor(private readonly rng: AudioRng) {
    this.gapS = this.drawGap('sparse') * 0.5; // the first phrase may come a little sooner
  }

  private drawGap(mode: DirectorInput['mode']): number {
    const g = this.rng.range(MUSIC.gapMinS, MUSIC.gapMaxS);
    return mode === 'frequent' ? g / 2 : g;
  }

  note(kind: MusicTrigger, now: number): void {
    this.trigger = { kind, at: now };
  }

  /** Returns the trigger that starts a phrase now, or null. */
  update(now: number, inp: DirectorInput): MusicTrigger | 'calm' | null {
    if (this.trigger && now - this.trigger.at > TRIGGER_TTL_S) this.trigger = null;
    if (inp.mode === 'off' || inp.blocked) return null;
    if (now - this.lastEnd < this.gapS) return null;
    const why = this.trigger?.kind ?? (inp.calmS >= MUSIC.calmTriggerS ? 'calm' : null);
    return why;
  }

  /** A phrase of `lengthS` started at `now`. */
  started(now: number, lengthS: number, mode: DirectorInput['mode']): void {
    this.lastEnd = now + lengthS;
    this.gapS = this.drawGap(mode);
    this.trigger = null;
  }
}
