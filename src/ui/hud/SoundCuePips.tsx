// Sound-cue indicators (GDD 08 §3.4 edge pips, §12): a pip with a word at the screen edge, in the direction of an
// information-bearing sound, while Settings > Accessibility > Sound-cue indicators is on (the game lists the pips
// only then). Rain has no direction: its pip sits at the top centre.
import { SOUND_CUE_WORD } from '@/content/text/soundCues';
import type { UiSoundCue } from '../api';
import { snapshot } from '../store';

/** Where a pip goes, in % of the HUD box: on a rectangle inset from the edges, along the cue's direction. */
export function pipPlace(angleDeg: number | null): { left: number; top: number } {
  if (angleDeg === null) return { left: 50, top: 14 };
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = -Math.sin(a);
  const s = Math.min(0.5 / Math.max(1e-6, Math.abs(dx)), 0.5 / Math.max(1e-6, Math.abs(dy))) * 0.88;
  return { left: 50 + dx * s * 100, top: 50 + dy * s * 100 };
}

function Pip({ cue }: { cue: UiSoundCue }) {
  const p = pipPlace(cue.angleDeg);
  return (
    <div class={`fd-cuepip fd-chip${cue.onScreen ? ' is-onscreen' : ''}`} data-testid={`cuepip-${cue.kind}`} role="status"
      style={{ left: `${p.left}%`, top: `${p.top}%` }}>
      {SOUND_CUE_WORD[cue.kind]}
    </div>
  );
}

export function SoundCuePips() {
  const cues = snapshot.value.soundCues ?? [];
  if (cues.length === 0) return null;
  return <div class="fd-cuepips" aria-label="Sounds">{cues.map((c) => <Pip key={c.id} cue={c} />)}</div>;
}
