// The founding module's registration objects (its system and command handlers), bound late.
// Why: the colony index builds its `systems` array and spreads the handlers when it is evaluated. Importing this
// folder FIRST (a test or a UI module that only wants the pure helpers) walks system.ts's imports into
// envAdapter -> environment -> human events -> action library -> colony index, which then reads the founding
// exports while they are still undefined (int-1B-sim L12: rules.verify failed to load). This file has no
// runtime imports, so the objects exist before that walk starts; system.ts and commands.ts bind the real code.

import type { CommandHandlerMap, CommandOf, CommandType, Sim, System } from '@/sim/types';

type AnyHandler = (sim: Sim, cmd: never) => void;

let runImpl: ((sim: Sim) => void) | null = null;
const handlerImpl: Partial<Record<CommandType, AnyHandler>> = {};

/** Founding sequence (opening phases, founding model, time-lapse). Owner: founding (src/sim/colony/founding). */
export const foundingSystem: System = { name: 'founding', phase: 'queen', run: (sim) => runImpl?.(sim) };

/** Called once by system.ts. */
export function bindFoundingSystem(run: (sim: Sim) => void): void {
  runImpl = run;
}

/** The command types the opening handles (the keys must be known before commands.ts is evaluated). */
const FOUNDING_COMMANDS = [
  'openingSkipIntro', 'openingBeginTimelapse', 'skipTimelapse', 'timelapseRespond', 'openingUndo',
  'cheat.completeFounding', 'cheat.setFoundingState',
] as const satisfies readonly CommandType[];

type FoundingCommand = (typeof FOUNDING_COMMANDS)[number];

function delegate<K extends FoundingCommand>(k: K) {
  return (sim: Sim, cmd: CommandOf<K>): void => {
    const h = handlerImpl[k] as ((s: Sim, c: CommandOf<K>) => void) | undefined;
    h?.(sim, cmd);
  };
}

export const foundingCommandHandlers: Partial<CommandHandlerMap> = Object.fromEntries(
  FOUNDING_COMMANDS.map((k) => [k, delegate(k)]),
) as Partial<CommandHandlerMap>;

/** Called once by commands.ts with the real handlers (one per FOUNDING_COMMANDS entry). */
export function bindFoundingCommands(map: { [K in FoundingCommand]: (sim: Sim, cmd: CommandOf<K>) => void }): void {
  for (const k of FOUNDING_COMMANDS) handlerImpl[k] = map[k] as AnyHandler;
}
