// `__game.cheat.*` (architecture §5): thin helpers that fill in defaults and issue `cheat.*` commands. The sim
// refuses them unless config.cheats is on (always on with ?test=1); a refusal comes back in the result.
import type { Caste, Command, CreatureKind, FoodKind, HumanEventKind, Task, WeatherState } from '@/sim/types';
import type { Vec3 } from '@/core';
import type { Game } from '../Game';
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
    const before = s.events.log.length;
    game.command(cmd);
    const rejected = s.events.log.slice(before).filter((e) => e.type === 'command-rejected');
    return plain({ ok: rejected.length === 0, rejected: rejected.map((e) => e.event) });
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
    kill: (id: number, cause = 'cheat') => run({ type: 'cheat.kill', id, cause }),
  };
}
