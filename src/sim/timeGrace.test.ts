// sim-seams item 6: the opening grace of GDD 06 §5.2 (`openingGraceGd`): no human event and no predator spawns for
// the first 0.3 GD (Gentle 0.6, Harsh 0.15) of a game whose opening is being played.
import { describe, expect, it } from 'vitest';
import type { CreatureKind, DifficultyId, Sim } from '@/sim/types';
import { DIFFICULTY_PARAMS, resolveRules } from '@/sim/balance';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { TICKS_PER_DAY } from '@/sim/time';
import { creatureCounts } from '@/sim/ecology/creatures';
import { runDirector } from '@/sim/ecology/creatures/director';
import { creatureScene, sendQueenAway, setClock } from '@/sim/ecology/creatures/testkit';
import { humanEventsSystem } from '@/sim/environment/human';
import { inOpeningGrace, openingGraceEndTick } from './timeGrace';

function setPreset(sim: Sim, preset: DifficultyId): void {
  sim.state.config.difficulty.preset = preset;
  sim.state.config.difficulty.params = { ...DIFFICULTY_PARAMS[preset] };
  sim.state.config.rules = resolveRules(preset, {}, sim.state.config.rules.seasonLengthDays); // founding leniency follows
}

describe('opening grace (GDD 06 §5.2)', () => {
  it('lasts openingGraceGd of a played opening: 0.6 / 0.3 / 0.15 GD; none for a scene still at the intro card', () => {
    const sim = creatureScene({ seed: 3 });
    expect(openingGraceEndTick(sim)).toBe(0); // intro card: a scene that never plays the opening
    sim.state.player.opening!.phase = 'search';
    for (const [preset, gd] of [['gentle', 0.6], ['naturalist', 0.3], ['harsh', 0.15]] as const) {
      setPreset(sim, preset);
      expect(openingGraceEndTick(sim), preset).toBe(Math.round(gd * TICKS_PER_DAY));
    }
    setPreset(sim, 'naturalist');
    expect(inOpeningGrace(sim)).toBe(true);
    sim.state.tick = 0.3 * TICKS_PER_DAY;
    expect(inOpeningGrace(sim)).toBe(false);
  });

  it('no ant predator takes its territory during the grace; it does at the first director run after it', () => {
    const sim = creatureScene({ seed: 7, sizeBu: 256 });
    setClock(sim, 'summer', 3, 12);
    sendQueenAway(sim);
    sim.state.player.opening!.phase = 'search';
    const kind: CreatureKind = 'wolf-spider';
    sim.state.ecology.director.territories.push({ kind, center: { x: 300, y: 0, z: 800 }, radius: 100, occupantId: -1, vacantUntilTick: -1 });
    runDirector(sim);
    expect(creatureCounts(sim)[kind] ?? 0).toBe(0);
    sim.state.tick = openingGraceEndTick(sim);
    runDirector(sim);
    expect(creatureCounts(sim)[kind]).toBe(1);
  });

  it('the first day of a new game schedules no human event inside the grace (kitchen-door #7)', () => {
    const cfg = defaultGameConfig('lasius-niger', 7);
    cfg.world = { ...cfg.world, archetype: 'kitchen-door' };
    const world = createNewGame(cfg).world;
    /** The first day's schedule of a new game on that world; `played`: the intro card was skipped (the game does). */
    const firstDay = (played: boolean) => {
      const g = createNewGame(cfg, world);
      if (played) g.state.player.opening!.phase = 'dealation';
      const sim = createSim(g.state, world, { systems: [humanEventsSystem] });
      sim.tick();
      return { end: openingGraceEndTick(sim), list: sim.state.env.human.scheduled.map((i) => `${i.kind}#${i.id}@${i.startTick}`) };
    };
    const graced = firstDay(true), open = firstDay(false);
    const at = (k: string) => Number(k.split('@')[1]);
    expect(graced.end).toBe(0.3 * TICKS_PER_DAY);
    expect(open.list.some((k) => at(k) < graced.end)).toBe(true); // the grace had something to remove
    expect(graced.list.every((k) => at(k) >= graced.end)).toBe(true);
    expect(graced.list).toEqual(open.list.filter((k) => at(k) >= graced.end)); // and removed nothing else
  }, 240_000); // three generated-world games (~20 s idle; far longer at load 10)
});
