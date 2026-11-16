// `__game.cheat.*` (architecture §5): thin helpers that fill in defaults and issue `cheat.*` commands. The sim
// refuses them unless config.cheats is on (always on with ?test=1); a refusal comes back in the result.
import type { AlertKind, Caste, Command, CreatureKind, FoodKind, HumanEventKind, RainClass, Task, WeatherState } from '@/sim/types';
import { cheatClearAlert, cheatRaiseAlert, type CheatAlert } from './alertCheats';
import type { Vec3 } from '@/core';
import type { Game } from '../Game';
import { collectRefusals } from '../refusals';
import { plain } from './query';

export function buildCheats(game: Game) {
  const colonyId = () => game.sim?.state.colonies[0]?.id ?? -1;
  const here = (): Vec3 => {
    const s = game.session;
    const a = s?.possessedAnt();
    return a ? { ...a.pos } : s ? s.focus() : { x: 0, y: 0, z: 0 };
  };
  const run = (cmd: Command) => {
    const s = game.session;
    if (!s) return { ok: false, reason: 'no-game' };
    let applied = true;
    const rejected = collectRefusals(s.sim, () => { applied = game.command(cmd)?.applied !== false; });
    // in real time the command waits for the next tick (applied false): a refusal then shows in __game.events()
    return plain({ ok: rejected.length === 0, applied, rejected });
  };
  return {
    /** Any cheat command by type, payload as in src/sim/types/commandsCheat.ts. */
    raw: (cmd: Command) => run(cmd),
    addFood: (c = 5, p = 2) => run({ type: 'cheat.addFood', colonyId: colonyId(), c, p, toxin: 0 }),
    spawnAnts: (n = 5, caste: Caste = 'worker', task: Task | null = null, pos: Vec3 | null = null, ageGd = 5) =>
      run({ type: 'cheat.spawnAnts', colonyId: colonyId(), n, caste, ageGd, task, pos: pos ?? here() }),
    spawnFood: (kind: FoodKind, pos?: Vec3, units = 1) => run({ type: 'cheat.spawnFood', kind, variant: null, pos: pos ?? here(), units, stage: null }),
    setTime: (calendarTick: number) => run({ type: 'cheat.setTime', tick: calendarTick }),
    setWeather: (state: WeatherState) => run({ type: 'cheat.setWeather', state, intensityClass: null }),
    spawnCreature: (kind: CreatureKind, pos?: Vec3) => run({ type: 'cheat.spawnCreature', kind, variant: null, pos: pos ?? here(), state: null }),
    completeFounding: (workers = 10) => run({ type: 'cheat.completeFounding', workers }),
    triggerEvent: (kind: HumanEventKind, at: Vec3 | null = null, startInS = 0) => run({ type: 'cheat.humanEvent', kind, variant: null, at, startInS }),
    /** An aphid herd on plant `plantId` (query.plants lists them); k <= 0: carrying capacity by host class. */
    spawnHerd: (plantId: number, aphids = 60, k = 0) => run({ type: 'cheat.spawnHerd', plantId, aphids, k }),
    /** Flood-model rain intensity override (nest flooding only; the sky and the renderer follow setWeather). */
    setRain: (intensity: number) => run({ type: 'cheat.setRain', intensity }),
    /** Rain class with the weather state (setWeather leaves the class to the weather model). */
    setWeatherClass: (state: WeatherState, intensityClass: RainClass | null) => run({ type: 'cheat.setWeather', state, intensityClass }),
    triggerBird: (pos: Vec3 | null = null, force = true) => run({ type: 'cheat.triggerBird', variant: null, pos, force }),
    kill: (id: number, cause = 'cheat') => run({ type: 'cheat.kill', id, cause }),
    /**
     * Raises an alert through progression's own publisher, as a sim module would (alertCheats.ts; refused unless
     * config.cheats). Returns the alert id (-1 refused).
     */
    raiseAlert: (a: CheatAlert) => {
      const s = game.session;
      if (!s) return -1;
      const id = cheatRaiseAlert(s.sim, a);
      game.afterStep(s, 0);
      return id;
    },
    clearAlert: (kind: AlertKind, subjectId = -1) => {
      const s = game.session;
      if (!s) return false;
      const ok = cheatClearAlert(s.sim, kind, subjectId);
      game.afterStep(s, 0);
      return ok;
    },
  };
}
