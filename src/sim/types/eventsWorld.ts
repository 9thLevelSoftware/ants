// Sim events: world generation, world changes, human activity, time and weather (GDD 04 App. C, GDD 06 App. C).

import type { Vec3 } from '@/core/math/vec3';
import type { HumanEventKind, Season, SpeedLevel, WeatherState, ZoneType } from './ids';
import type { AlertKind, AlertLevel, DayPhase, RainClass } from './ids/progression';
import type { HumanCueKind, HumanVariant, MicroKind, WorldgenCheck } from './ids/world';

export type WorldEvent =
  | { type: 'worldgen.progress'; step: string; fraction: number; attempt: number }
  | { type: 'worldgen.retry'; attempt: number; failedChecks: WorldgenCheck[] }
  | { type: 'worldgen.complete'; fingerprint: number; attempts: number; repairs: string[] }
  | { type: 'world.micro-discovered'; microId: number; kind: MicroKind; antId: number; pos: Vec3 }
  | { type: 'world.zone-first-entry'; zoneType: ZoneType; antId: number }
  | { type: 'world.terrain-deformed'; min: Vec3; max: Vec3; cause: string }
  | { type: 'world.cave-in'; center: Vec3; radiusBu: number; cause: string }
  | { type: 'world.dynprim-changed'; id: number; templateId: string; change: 'add' | 'move' | 'remove' }
  | { type: 'world.grass-mown'; cells: number[]; heightMm: number }
  | { type: 'human.scheduled'; day: number; instIds: number[] }
  | {
    type: 'human.telegraph'; instId: number; kind: HumanEventKind; cue: HumanCueKind; origin: Vec3;
    radiusMm: number; intensity: number; impactTick: number;
  }
  | { type: 'human.start'; instId: number; kind: HumanEventKind; variant: HumanVariant | null; region: number }
  | { type: 'human.end'; instId: number; kind: HumanEventKind; variant: HumanVariant | null; region: number }
  | { type: 'human.cancelled'; instId: number; kind: HumanEventKind }
  | { type: 'human.impact'; instId: number; kind: HumanEventKind; contact: string; footprint: Vec3; radiusMm: number }
  | { type: 'human.casualties'; instId: number; killed: number; displaced: number; itemsRemoved: number }
  | { type: 'human.bait-placed'; id: number; pos: Vec3 }
  | { type: 'human.bait-removed'; id: number; pos: Vec3 };

export type TimeWeatherEvent =
  | { type: 'time.hour'; hour: number }
  | { type: 'time.phase'; phase: DayPhase }
  | { type: 'time.day'; dayIndex: number; doy: number; weekday: number; isWeekend: boolean }
  | { type: 'time.season'; season: Season; year: number }
  | { type: 'time.year'; year: number }
  /** Running speed or pause changed (`to` 0 = paused). reason: 'command' | 'possession' | 'opening' | 'auto-slow'. */
  | { type: 'time.speed-changed'; from: SpeedLevel; to: SpeedLevel; reason: string }
  | { type: 'time.speed-limited'; requested: SpeedLevel; effective: number; droppedTicks: number }
  /**
   * Auto-slow fired for an alert (D6.8: keyed on alert kind and level). Emitted by the GAME LAYER, not by a sim system:
   * the trigger (GDD 06 §4.5: raised alerts by level, the winter banner) and the speed belong to the game loop
   * (src/game/time/autoSlow.ts AutoSlowWatcher -> Game.onAutoSlow, which emits it into the sim's bus for the HUD and
   * audio). No sim system may emit it (sim-seams item 5; src/sim/time.autoSlow.test.ts).
   */
  | { type: 'time.auto-slow'; alertKind: AlertKind; level: AlertLevel; action: 'slow' | 'pause' }
  | { type: 'weather.changed'; from: WeatherState; to: WeatherState; intensityClass: RainClass | null; reason: string }
  | { type: 'weather.gust'; windMs: number }
  | { type: 'weather.thunder'; delayS: number; intensity: number }
  | { type: 'weather.lightning' }
  | { type: 'weather.dew'; state: 'formed' | 'gone' }
  | { type: 'weather.puddle'; cellsAdded: number; cellsRemoved: number }
  | { type: 'env.heat-stupor'; antId: number }
  | { type: 'env.cold-coma'; antId: number };
