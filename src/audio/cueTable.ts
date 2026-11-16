// Cue -> sound mapping (GDD 08 §13.5 foley, §13.6 giant one-shots, GDD 03 nest cues). Every cue id in the
// contracts' CUE_IDS has an entry here, either a sound or a deliberate `silent` entry (tested). Namespaced cues
// (`dig-bite.<material>`, `giant.<kind>`, `ambient.<kind>`) resolve through resolveCue().
import { CUE_IDS } from '@/sim/types/ids/progression';
import { HUMAN_EVENT_KINDS } from '@/sim/types/ids';
import { SFX, type AudioFileId } from './assetIds';
import type { SynthOneShot } from './synth/ids';
import { DEFAULT_CUE_CAP, PRIORITY } from './tuning';

export type SpaceClass = 'foley' | 'creature' | 'giant' | 'flat';
export type CueBus = 'ambience' | 'effects' | 'giants' | 'ui';

export interface CueSound {
  bus: CueBus;
  /** Distance class (tuning DISTANCE) or `flat` = non-positional. */
  space: SpaceClass;
  /** Voice gain at the reference distance, dB relative to the bus. */
  gainDb: number;
  /** Files used round-robin. */
  files: AudioFileId[];
  /** Random pitch range for the file layer, semitones. */
  fileSemis: [number, number];
  /** Play only a slice of [min, max] seconds from a random offset; null = whole file. */
  slice: [number, number] | null;
  /** Gain of the file layer relative to gainDb. */
  fileGainDb: number;
  synth: SynthOneShot | null;
  /** Random pitch range for the synth layer, semitones. */
  synthSemis: [number, number];
  /** `file`: file, synth only as its fallback; `synth`: synth only; `both`: synth plus a file layer. */
  mode: 'file' | 'synth' | 'both';
  /** Concurrent voices of this cue (per-cue cap, §13.3). */
  cap: number;
  /** Base voice priority (raised for the possessed ant / creatures near the listener at play time). */
  priority: number;
  /** Deliberately no sound (the reason is documented in `note`). */
  silent?: boolean;
  /** Plays on the UI bus only when the possessed ant is within the alarm plume. */
  plumeOnly?: boolean;
  note?: string;
}

const base: CueSound = {
  bus: 'effects', space: 'foley', gainDb: -18, files: [], fileSemis: [0, 0], slice: null, fileGainDb: 0, synth: null,
  synthSemis: [-1, 1], mode: 'synth', cap: DEFAULT_CUE_CAP, priority: PRIORITY.other,
};
const S = (p: Partial<CueSound>): CueSound => ({ ...base, ...p });
const silent = (note: string): CueSound => S({ silent: true, note });

/** The fixed cue ids (contracts CUE_IDS). */
export const CUE_SOUNDS: Record<(typeof CUE_IDS)[number], CueSound> = {
  'step': S({ synth: 'step-click', gainDb: -18, synthSemis: [-2, 2], cap: 4, note: '2-4 ms click 3-8 kHz; gravel uses grit slices (resolveStep)' }),
  'dig-bite': S({
    files: [SFX.soil_scrape_01, SFX.soil_scrape_02], fileSemis: [12, 19], slice: [0.12, 0.3], synth: 'soil-scrape', mode: 'file',
    gainDb: -14, cap: 3,
  }),
  'wood-chew': S({ synth: 'wood-gnaw', files: [SFX.wood_rasp_01, SFX.wood_rasp_02], fileSemis: [5, 9], slice: [0.15, 0.35], fileGainDb: -6, mode: 'both', gainDb: -16, cap: 3 }),
  'pellet-drop': S({ synth: 'grain-trickle', gainDb: -24, cap: 3 }),
  'frass-drop': S({ synth: 'grain-trickle', gainDb: -24, synthSemis: [2, 5], cap: 3 }),
  'pick-up': S({ synth: 'mandible-click', gainDb: -11, cap: 3 }),
  'drop': S({ synth: 'mandible-click', gainDb: -11, synthSemis: [-3, -1], cap: 3 }),
  'bite': S({ synth: 'bite-click', files: [SFX.crunch_01, SFX.crunch_02], fileSemis: [3, 7], slice: [0.06, 0.15], fileGainDb: -8, mode: 'both', gainDb: -16, cap: 4, note: 'crunch layer: hard prey (strength > 0.5)' }),
  'grapple': S({ synth: 'scuffle', gainDb: -20, cap: 3 }),
  'acid-spray': S({ synth: 'acid-hiss', gainDb: -18, cap: 3 }),
  'trophallaxis': S({ synth: 'liquid-tick', gainDb: -26, cap: 3 }),
  'antennate': S({ synth: 'antenna-brush', gainDb: -32, cap: 3 }),
  'lay-egg': S({ synth: 'membrane-pop', gainDb: -30, cap: 2 }),
  'eclosion': S({ synth: 'membrane-pop', gainDb: -30, synthSemis: [-4, -2], cap: 2 }),
  'alarm-burst': S({ bus: 'ui', space: 'flat', synth: 'alarm-shimmer', gainDb: -12, plumeOnly: true, cap: 1, note: 'chemical: no literal sound; UI shimmer only inside the plume' }),
  'drum': S({ synth: 'wood-drum', files: [SFX.wood_creak_01, SFX.wood_creak_02], fileSemis: [0, 3], slice: [0.3, 0.6], fileGainDb: -12, mode: 'both', gainDb: -14, cap: 3 }),
  'stridulate': S({ synth: 'stridulation-rasp', files: [SFX.stridulation_grasshopper_01], fileSemis: [7, 7], slice: [0.4, 0.9], fileGainDb: 0, mode: 'both', gainDb: -12, cap: 3 }),
  'leaf-cut': S({ synth: 'leaf-tear', gainDb: -18, cap: 3, note: 'stridulate layer is the sim\'s separate stridulate cue' }),
  'seed-crack': S({ files: [SFX.crunch_01, SFX.crunch_02, SFX.crunch_03], fileSemis: [5, 5], slice: [0.08, 0.2], synth: 'crunch', mode: 'file', gainDb: -16, cap: 3 }),
  'death': silent('no death sound for ants (§13.5)'),
  'prey-struggle': S({ synth: 'prey-flutter', space: 'creature', gainDb: -16, cap: 3 }),
  'creature-step': S({ synth: 'creature-tap', space: 'creature', gainDb: -20, cap: 4, note: 'same sound in every spider comfort mode' }),
  'wing-buzz': S({ synth: 'fly-buzz', files: [SFX.insect_wing_buzz_01, SFX.insect_wing_buzz_02], mode: 'synth', space: 'creature', gainDb: -18, cap: 3, note: 'swarms (strength > 0.6) use the files (resolveCue)' }),
  'bird-strike': S({ synth: 'wing-whoosh', space: 'creature', files: [], gainDb: -10, cap: 2, priority: PRIORITY.creatureNear, note: 'landing (strength 1) = whoosh + thud, otherwise a peck (resolveCue)' }),
  'antlion-flick': S({ synth: 'sand-spray', space: 'creature', gainDb: -18, cap: 3 }),
  'raindrop-hit': S({ files: [SFX.wet_splat_01, SFX.wet_splat_02], fileSemis: [-5, 12], synth: 'splat', mode: 'file', gainDb: -8, cap: 6, note: 'a heavy discrete impact at ant scale; pitch by drop size: strength 0 = drizzle (+12), 1 = downpour (-5)' }),
  'drip': S({ files: [SFX.water_drip_01, SFX.water_drip_02], synth: 'drip', mode: 'file', gainDb: -20, cap: 3 }),
  'flood': S({ synth: 'gurgle', files: [SFX.wet_splat_01], fileSemis: [-7, -3], fileGainDb: -10, mode: 'both', gainDb: -12, cap: 2 }),
  'collapse': S({ synth: 'grain-slide', gainDb: -12, cap: 2 }),
  'cricket-call': S({ files: [SFX.cricket_chirp_01, SFX.cricket_chirp_02], synth: 'chirp', mode: 'file', space: 'creature', gainDb: -16, cap: 2 }),
  // GDD 03 nest cues
  'seal-tamp': S({ synth: 'soil-tamp', gainDb: -22, cap: 3 }),
  'collapse-rumble': S({ synth: 'low-rumble', gainDb: -10, cap: 2 }),
  'water-trickle': S({ synth: 'trickle', files: [SFX.water_drip_01, SFX.water_drip_02], fileSemis: [3, 7], fileGainDb: -10, mode: 'both', gainDb: -20, cap: 2 }),
  'mound-slump': S({ synth: 'grain-slide', synthSemis: [3, 6], gainDb: -18, cap: 2 }),
  'garden-tend': S({ synth: 'soft-brush', gainDb: -30, cap: 3 }),
};

/** Giant one-shots for the `giant.<kind>` cues and human-event impacts (§13.6). */
export const GIANT_ONESHOTS: Record<(typeof HUMAN_EVENT_KINDS)[number], CueSound> = {
  'footsteps': S({ bus: 'giants', space: 'giant', files: [SFX.thud_giant_step_01, SFX.thud_giant_step_02], fileSemis: [-3, 0], synth: 'sub-thump', mode: 'both', gainDb: -2, cap: 2, priority: PRIORITY.giant }),
  'mowing': S({ bus: 'giants', space: 'giant', synth: 'engine', mode: 'synth', gainDb: -8, cap: 1, priority: PRIORITY.giant, note: 'the loop is driven by human.start/end' }),
  'sweeping': S({ bus: 'giants', space: 'giant', files: [SFX.broom_sweep_01, SFX.broom_sweep_02], synth: 'broom-swish', mode: 'file', gainDb: -6, cap: 2, priority: PRIORITY.giant }),
  'vacuum': S({ bus: 'giants', space: 'giant', synth: 'vacuum', gainDb: -8, cap: 1, priority: PRIORITY.giant }),
  'car': S({ bus: 'giants', space: 'giant', files: [SFX.car_pass_01, SFX.car_pass_02], synth: 'car-pass', mode: 'file', gainDb: -4, cap: 1, priority: PRIORITY.giant }),
  'watering': S({ bus: 'giants', space: 'giant', synth: 'hose-hiss', files: [SFX.wet_splat_01, SFX.wet_splat_02], fileSemis: [-6, -2], fileGainDb: -6, mode: 'both', gainDb: -8, cap: 2, priority: PRIORITY.giant }),
  'children': S({ bus: 'giants', space: 'giant', synth: 'sand-thump', gainDb: -10, cap: 2, priority: PRIORITY.giant, note: 'voices only as the ambience murmur (13.7)' }),
  'food-drop': S({ bus: 'giants', space: 'giant', synth: 'sub-thump', files: [SFX.crunch_01, SFX.crunch_02, SFX.crunch_03], fileSemis: [-12, -12], fileGainDb: -4, mode: 'both', gainDb: -6, cap: 2, priority: PRIORITY.giant }),
  'spill': S({ bus: 'giants', space: 'giant', synth: 'glug', files: [SFX.wet_splat_02], fileSemis: [-10, -10], mode: 'both', gainDb: -6, cap: 2, priority: PRIORITY.giant }),
  'bait-station': S({ bus: 'giants', space: 'giant', synth: 'plastic-clack', gainDb: -8, cap: 2, priority: PRIORITY.giant }),
};

/**
 * Sounds the audio derives from simulation EVENTS (eventRouter.ts), as `ev.<id>` cues: the sim emits no cue for them.
 * Gains are relative to the bus like every other cue.
 */
export const EVENT_SOUNDS: Record<string, CueSound> = {
  'strike': S({ synth: 'strike-snap', space: 'creature', gainDb: -10, cap: 3, priority: PRIORITY.creatureNear, note: 'predator strike (spider lunge, centipede snap)' }),
  'bird-whoosh': S({ synth: 'bird-whoosh', space: 'creature', gainDb: -10, cap: 2, priority: PRIORITY.creatureNear, note: 'bird approach and take-off' }),
  'gust': S({ bus: 'ambience', space: 'flat', synth: 'gust', gainDb: -4, cap: 2, note: 'wind gust swell on the ambience bus' }),
};

const BIRD_LANDING = S({ ...CUE_SOUNDS['bird-strike'], synth: 'bird-landing', note: 'whoosh + landing thud' });
const BIRD_PECK = S({ ...CUE_SOUNDS['bird-strike'], synth: 'peck', gainDb: -8, cap: 3 });

/** Sounds that resolveCue swaps in for a base cue (variants), listed so the file audit sees every file they use. */
export const CUE_VARIANTS_FOR_AUDIT = (): CueSound[] => [GRAVEL_STEP, SWARM, BIRD_LANDING, BIRD_PECK];

/** Thunder (weather) on the giants bus. */
export const THUNDER: CueSound = S({ bus: 'giants', space: 'flat', synth: 'thunder', gainDb: -4, cap: 2, priority: PRIORITY.giant });

/** `ambient.<kind>` one-shots (GDD 06/07 ambience cues). Unknown kinds are ignored (logged once). */
export const AMBIENT_ONESHOTS: Record<string, CueSound> = {
  'cricket': CUE_SOUNDS['cricket-call'],
  'drip': CUE_SOUNDS.drip,
  'bird': S({ space: 'flat', synth: 'bird-call', gainDb: -22, cap: 2 }),
  'wood-creak': S({ files: [SFX.wood_creak_01, SFX.wood_creak_02, SFX.wood_creak_03], synth: 'wood-creak', mode: 'file', gainDb: -22, cap: 2 }),
};

/** Material groups for `dig-bite.<material>` and steps (§13.5: pitch by substrate; wood -> wood-chew). */
const WOOD = new Set(['wood-sound', 'wood-decayed', 'bark']);
const MATERIAL_SEMIS: Record<string, number> = { sand: 3, humus: -1, clay: -3, loam: 0, gravel: 1, insulation: 4, plaster: 2, mortar: 2 };

export interface ResolvedCue {
  /** Cap / log key: the base cue id. */
  key: string;
  sound: CueSound;
  /** Extra pitch shift for both layers, semitones. */
  semis: number;
  /** Files override (e.g. gravel steps). */
  files: AudioFileId[] | null;
}

const _res: ResolvedCue = { key: '', sound: base, semis: 0, files: null };
const GRAVEL_FILES: AudioFileId[] = [SFX.gravel_grit_01, SFX.gravel_grit_02, SFX.gravel_grit_03];
const SWARM_FILES: AudioFileId[] = [SFX.insect_wing_buzz_01, SFX.insect_wing_buzz_02];
const GRAVEL_STEP = S({ ...CUE_SOUNDS.step, mode: 'file', files: GRAVEL_FILES, slice: [0.03, 0.08], gainDb: -24, synth: 'step-click' });
const SWARM = S({ ...CUE_SOUNDS['wing-buzz'], mode: 'file', files: SWARM_FILES, synth: 'swarm-buzz' });

/**
 * Sound for a cue id (fixed or namespaced). `material` refines steps; `strength` picks variants (swarm, hard
 * prey). Returns null for unknown ids. The result object is reused: copy what you keep.
 */
export function resolveCue(cue: string, strength = 1, material: string | null = null): ResolvedCue | null {
  _res.semis = 0;
  _res.files = null;
  const dot = cue.indexOf('.');
  if (dot > 0) {
    const ns = cue.slice(0, dot), arg = cue.slice(dot + 1);
    if (ns === 'dig-bite') {
      const wood = WOOD.has(arg);
      _res.key = wood ? 'wood-chew' : 'dig-bite';
      _res.sound = wood ? CUE_SOUNDS['wood-chew'] : CUE_SOUNDS['dig-bite'];
      _res.semis = MATERIAL_SEMIS[arg] ?? 0;
      return _res;
    }
    if (ns === 'giant') {
      const g = (GIANT_ONESHOTS as Record<string, CueSound>)[arg];
      if (!g) return null;
      _res.key = cue;
      _res.sound = g;
      return _res;
    }
    if (ns === 'ev') {
      const ev = EVENT_SOUNDS[arg];
      if (!ev) return null;
      _res.key = cue;
      _res.sound = ev;
      return _res;
    }
    if (ns === 'ambient') {
      const a = AMBIENT_ONESHOTS[arg];
      if (!a) return null;
      _res.key = cue;
      _res.sound = a;
      return _res;
    }
    return null;
  }
  const s = (CUE_SOUNDS as Record<string, CueSound>)[cue];
  if (!s) return null;
  _res.key = cue;
  _res.sound = s;
  if (cue === 'step' && material) {
    if (material === 'gravel') _res.sound = GRAVEL_STEP;
    _res.semis = MATERIAL_SEMIS[material] ?? (WOOD.has(material) ? -4 : 0);
  }
  if (cue === 'wing-buzz' && strength > 0.6) _res.sound = SWARM;
  if (cue === 'bird-strike') _res.sound = strength >= 0.95 ? BIRD_LANDING : BIRD_PECK;
  if (cue === 'raindrop-hit') _res.semis = 0; // pitch comes from fileSemis by strength (playback)
  return _res;
}

/** Pitch for a raindrop by strength (0 drizzle .. 1 downpour): +12 .. -5 semitones (§13.5). */
export function raindropSemis(strength: number): number {
  const s = Math.min(1, Math.max(0, strength));
  return 12 - 17 * s;
}
