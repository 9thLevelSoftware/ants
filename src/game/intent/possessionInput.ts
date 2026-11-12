// Possession input (GDD 01 §5.2) -> PlayerIntent (held levels, sent every frame) plus action commands (press
// edges). The world-space move direction comes from cameraRelativeDir. Reads an InputLike so tests can feed it
// without the DOM input layer.
import type { Vec3 } from '@/core';
import type { ActionId, Command, PlayerIntent, TargetRef } from '@/sim/types';
import { cameraRelativeDir } from './cameraRelative';

/** The subset of InputState this module reads. */
export interface InputLike {
  axis2(axisId: string): { x: number; y: number };
  active(id: string): boolean;
  pressed(id: string): boolean;
  tap(id: string): boolean;
  holdStart(id: string): boolean;
}

/** What the game knows about the possessed ant this frame. */
export interface PossessedContext {
  up: Vec3;
  carrying: boolean;
  trailOn: boolean;
  /** The prompt's primary / secondary action and target (sim `promptView`). */
  primary: { actionId: ActionId; target: TargetRef | null } | null;
  secondary: { actionId: ActionId; target: TargetRef | null } | null;
}

export interface CameraBasis {
  fwd: Vec3;
  up: Vec3;
}

export interface PossessionInputResult {
  intent: PlayerIntent;
  commands: Command[];
}

function startAction(actionId: ActionId, target: TargetRef | null, secondary = false): Command {
  return target ? { type: 'action', actionId, target, secondary, phase: 'start' } : { type: 'action', actionId, secondary, phase: 'start' };
}

/** Reuses `out.intent` (no allocation of the direction vector per frame). */
export function readPossessionInput(input: InputLike, cam: CameraBasis, ant: PossessedContext, out: PossessionInputResult): PossessionInputResult {
  const m = input.axis2('move');
  const intent = out.intent;
  cameraRelativeDir(intent.dir, m.x, m.y, cam.fwd, cam.up, ant.up);
  intent.hurry = input.active('hurry');
  intent.grip = input.active('foot'); // foot hold = grip (GDD 01 §4.3)
  intent.flight = null;
  intent.held.length = 0;
  if (input.active('dig')) intent.held.push('dig-bite');
  if (input.active('bite')) intent.held.push('bite-hold');
  out.commands.length = 0;
  const cmds = out.commands;
  if (input.tap('interact') && ant.primary) cmds.push(startAction(ant.primary.actionId, ant.primary.target));
  if (input.holdStart('interact') && ant.secondary) cmds.push(startAction(ant.secondary.actionId, ant.secondary.target, true));
  if (input.tap('bite')) cmds.push(startAction('bite', null));
  if (input.tap('foot')) cmds.push(startAction(ant.carrying ? 'drop' : 'let-go', null));
  if (input.pressed('trail-toggle')) cmds.push({ type: 'setTrail', on: !ant.trailOn });
  if (input.pressed('share-food')) cmds.push(startAction('trophallaxis-give', null));
  if (input.tap('inspect')) cmds.push(startAction('antennate', null));
  if (input.holdStart('inspect')) cmds.push(startAction('sniff', null));
  if (input.pressed('release')) cmds.push({ type: 'release', reason: 'player' });
  return out;
}

export function newPossessionInputResult(): PossessionInputResult {
  return { intent: { dir: { x: 0, y: 0, z: 0 }, hurry: false, grip: false, held: [], flight: null }, commands: [] };
}
