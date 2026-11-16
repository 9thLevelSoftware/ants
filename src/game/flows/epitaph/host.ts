// What the lifecycle flows (winter, flight, epitaph, lineage) need from the Game (implemented by src/game/Game.ts).
import type { Command, PossessRole, SpeedLevel } from '@/sim/types';
import type { GameSession } from '../../session';
import type { GameMode } from '../../time/speedRules';
import type { NewGameOptions } from '../../newGame/options';

export interface LifecycleHost {
  readonly session: GameSession | null;
  readonly realtime: boolean;
  readonly mode: GameMode;
  readonly opts: { testMode: boolean };
  readonly settings: { get(): { camera: { reducedMotion: boolean } } };
  command(cmd: Command): unknown;
  possess(target: number | PossessRole): unknown;
  setSpeed(level: SpeedLevel): void;
  newGame(options?: NewGameOptions): Promise<unknown>;
  quitToTitle(): void;
  load(slot: string): Promise<unknown>;
  refreshUi(): void;
}
