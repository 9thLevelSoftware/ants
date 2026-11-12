// Per-frame player intent for the possessed ant: keyboard/pad input mapped camera-relative (or a debug-API
// override), sent with sim.setPlayerIntent; action presses become queued commands. Outside possession the intent
// is reset to idle once.
import type { InputState } from '@/input';
import type { PlayerIntent } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import type { GameSession } from '../session';
import { readPossessionInput, type CameraBasis, type PossessionInputResult } from './possessionInput';

export function applyIntent(s: GameSession, input: InputState, cam: CameraBasis, active: boolean, buf: PossessionInputResult,
  override: PlayerIntent | null): void {
  const sim = s.sim;
  const ant = s.possessedAnt();
  if (override) { if (ant) sim.setPlayerIntent(override); return; }
  const intent = buf.intent;
  if (!ant || !active) {
    if (intent.dir.x !== 0 || intent.dir.y !== 0 || intent.dir.z !== 0 || intent.held.length || intent.hurry || intent.grip) {
      intent.dir.x = 0; intent.dir.y = 0; intent.dir.z = 0;
      intent.held.length = 0; intent.hurry = false; intent.grip = false;
      sim.setPlayerIntent(intent);
    }
    return;
  }
  // the prompt is resolved only on an interact edge (it scans nearby targets)
  const wantsPrompt = input.tap('interact') || input.holdStart('interact');
  const prompt = wantsPrompt ? s.promptTargets(ant) : null;
  readPossessionInput(input, cam, {
    up: ant.up, carrying: ant.carry.kind !== 'none', trailOn: (ant.flags & AntFlag.TRAIL_ON) !== 0,
    primary: prompt?.primary ?? null, secondary: prompt?.secondary ?? null,
  }, buf);
  sim.setPlayerIntent(intent);
  for (const c of buf.commands) s.driver.enqueue(c);
}
