// Every audio file the code can ask for, collected from the tables that ask (cue table, event sounds, giant one-shots
// and loops, UI sounds, ambience layers). The packaging test compares this with what the portable build ships.
import { HUMAN_EVENT_KINDS } from '@/sim/types/ids';
import { LAYERS } from './ambience/layers';
import { AMBIENT_ONESHOTS, CUE_SOUNDS, CUE_VARIANTS_FOR_AUDIT, EVENT_SOUNDS, GIANT_ONESHOTS, THUNDER, type CueSound } from './cueTable';
import { loopSource } from './giants';
import { UI_SOUNDS } from './uiSounds';

/** Manifest ids of every file some sound, loop or layer can play, sorted. */
export function requestedAudioFiles(): string[] {
  const ids = new Set<string>();
  const add = (s: CueSound) => { for (const f of s.files) ids.add(f); };
  for (const t of [CUE_SOUNDS, GIANT_ONESHOTS, AMBIENT_ONESHOTS, EVENT_SOUNDS, UI_SOUNDS] as Record<string, CueSound>[]) Object.values(t).forEach(add);
  add(THUNDER);
  CUE_VARIANTS_FOR_AUDIT().forEach(add);
  for (const l of Object.values(LAYERS)) if (l.file) ids.add(l.file);
  for (const kind of HUMAN_EVENT_KINDS) for (const variant of [null, 'motor', 'reel']) {
    const f = loopSource(kind, variant).file;
    if (f) ids.add(f);
  }
  return [...ids].sort();
}
