// The codex entries observed in this game (`progression.codexSeen`: id -> tick), each with its date line. The device-wide
// unlocks (the profile) are added by the game when it exposes them (`UiCodexSeen.device`).
import type { Sim } from '@/sim/types';
import type { UiCodexSeen } from '@/ui/api';
import { dateOf } from './dates';

export function codexOf(sim: Sim): UiCodexSeen {
  const seen: UiCodexSeen['seen'] = {};
  const src = sim.state.progression.codexSeen;
  for (const id of Object.keys(src)) seen[id] = { tick: src[id], label: dateOf(sim, src[id]) };
  return { seen };
}
