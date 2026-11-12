// Interface and alert sounds (GDD 08 §13.8) on the `ui` bus: button clicks, hover (-10 dB, at most one per 80 ms),
// toggles, page turns, the three alert tones and the milestone motif (in the season's scale, even with music off).
import { SFX } from './assetIds';
import { type CueSound } from './cueTable';
import { dbToGain, gainToDb } from './mix';
import { midiToHz, milestoneMotif } from './music/compose';
import type { Season } from '@/sim/types/ids';
import { PRIORITY, UI_SOUND } from './tuning';
import { playShot, type ShotEnv } from './engine/shots';
import { RECIPES } from './synth/recipes';
import type { CueLog } from './engine/cueLog';

export const UI_SOUND_IDS = [
  'click', 'click-secondary', 'tab', 'hover', 'toggle', 'page', 'alert-notice', 'alert-warning', 'alert-critical', 'milestone',
] as const;
export type UiSoundId = (typeof UI_SOUND_IDS)[number];

const U = (p: Partial<CueSound>): CueSound => ({
  bus: 'ui', space: 'flat', gainDb: 0, files: [], fileSemis: [0, 0], slice: null, fileGainDb: 0, synth: null, synthSemis: [0, 0],
  mode: 'file', cap: 4, priority: PRIORITY.ui, ...p,
});

export const UI_SOUNDS: Record<UiSoundId, CueSound> = {
  'click': U({ files: [SFX.ui_click_01], synth: 'ui-click' }),
  'click-secondary': U({ files: [SFX.ui_click_02], synth: 'ui-click', synthSemis: [-3, -3] }),
  'tab': U({ files: [SFX.ui_click_03], synth: 'ui-click', synthSemis: [3, 3] }),
  'hover': U({ files: [SFX.ui_hover_01], synth: 'ui-hover', gainDb: UI_SOUND.hoverRelDb }),
  'toggle': U({ files: [SFX.ui_switch_01], synth: 'ui-switch' }),
  'page': U({ synth: 'page-turn', mode: 'synth' }),
  'alert-notice': U({ synth: 'alert-notice', mode: 'synth', gainDb: -4 }),
  'alert-warning': U({ synth: 'alert-warning', mode: 'synth', gainDb: -4 }),
  'alert-critical': U({ synth: 'alert-critical', mode: 'synth', gainDb: -2 }),
  'milestone': U({ synth: 'milestone-motif', mode: 'synth', gainDb: -6 }),
};

export class UiSounds {
  private lastHover = -Infinity;
  /** Season of the milestone motif's scale. */
  season: Season = 'spring';
  enabled = true;

  constructor(private readonly env: ShotEnv, private readonly bus: AudioNode, private readonly log: CueLog) {}

  /** Plays a UI sound now (or `delayS` later). Returns false when throttled or disabled. */
  play(id: UiSoundId, extraDb = 0, delayS = 0): boolean {
    if (!this.enabled) return false;
    const s = UI_SOUNDS[id];
    if (!s) return false;
    const now = this.env.kit.ctx.currentTime;
    if (id === 'hover') {
      if (now - this.lastHover < UI_SOUND.hoverMinIntervalS) return false;
      this.lastHover = now;
    }
    const g = dbToGain(s.gainDb + extraDb);
    const t = now + delayS;
    let src: string;
    if (id === 'milestone') {
      const freqs = milestoneMotif(this.season).map((n) => midiToHz(n.midi));
      RECIPES['milestone-motif'](this.env.kit, this.bus, t, { gain: g, rate: 1, strength: 1, freqs });
      src = 'synth:milestone-motif';
    } else {
      const res = playShot(this.env, s, t, g, this.bus, { semis: 0, fileSemis: null, strength: 1, files: null });
      src = res.usedFile ? `file:${res.usedFile}` : `synth:${s.synth}`;
    }
    this.log.push({ t: now, cue: `ui.${id}`, bus: 'ui', gainDb: gainToDb(g), source: src, distBu: 0 });
    return true;
  }
}
