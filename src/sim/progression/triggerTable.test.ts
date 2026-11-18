// sim-seams item 1: every milestone, codex entry and aim of the registry (GDD 00-index B6) has a trigger that can
// fire in a real game: a listener on an event some simulation module really emits, a state poll, or a milestone it
// follows. The emitter scan reads the simulation sources (tests, fixtures and the type files excluded), so a rule that
// listens to a declared-but-never-emitted event fails here. The table with emitters is in the sim-seams report.
import { describe, expect, it } from 'vitest';
// first: the sim entry (through the testkit) settles the module cycle before the rule tables are read
import { makeProgSim, pollOnce, recordEvents } from './testkit';
import type { AimId, MilestoneId, Sim, SimEvent } from '@/sim/types';
import { AIM_IDS, MILESTONE_IDS, allCodexIds } from '@/sim/types';
import { MILESTONE_RULES } from './milestoneRules';
import { CODEX_RULES } from './codexRules';
import { AIM_RULES } from './aims';

const SOURCES = import.meta.glob('/src/{sim,worldgen}/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PRODUCTION = Object.entries(SOURCES).filter(([f]) =>
  !/\.test\.ts$|\/types\/|\/testing\/|testkit|[Ff]ixtures|\/testWorld/.test(f));

/** Source files that emit an event of this type (`type: '<ev>'` literal). */
function emittersOf(ev: string): string[] {
  const re = new RegExp(`type:\\s*'${ev.replace(/[.]/g, '\\.')}'`);
  return PRODUCTION.filter(([, s]) => re.test(s)).map(([f]) => f.replace('/src/sim/', ''));
}

/** Aims the founding script opens itself (GDD 08 opening aims, colony/founding/system.ts). */
const OPENING_AIMS: readonly AimId[] = ['aim-find-site', 'aim-dig-chamber', 'aim-seal', 'aim-first-clutch', 'aim-first-workers'];
/** T3 aims of GDD 08 for species mechanics not built (Camponotus wood search, Atta planting): reported. */
const NOT_BUILT_AIMS: readonly AimId[] = ['aim-find-wood', 'aim-plant-garden'];

type Rule = { id: string; on?: object; poll?: unknown; afterMilestone?: MilestoneId };
const RULES: readonly Rule[] = [...MILESTONE_RULES, ...CODEX_RULES];

describe('trigger table (registry B6)', () => {
  it('every milestone and codex id has exactly one rule, and every rule has a trigger', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...MILESTONE_IDS, ...allCodexIds()]) expect(ids, id).toContain(id);
    for (const r of RULES) expect(Object.keys(r.on ?? {}).length > 0 || !!r.poll || !!r.afterMilestone, r.id).toBe(true);
  });

  it('every event a rule listens to is emitted by a simulation module', () => {
    const missing: string[] = [];
    for (const r of RULES) {
      for (const ev of Object.keys(r.on ?? {})) if (emittersOf(ev).length === 0) missing.push(`${r.id} <- ${ev}`);
    }
    expect(missing).toEqual([]);
  });

  it('rules that follow a milestone follow one that has its own trigger', () => {
    const ms = new Map(MILESTONE_RULES.map((r) => [r.id, r]));
    for (const r of CODEX_RULES) {
      if (!r.afterMilestone) continue;
      const m = ms.get(r.afterMilestone);
      expect(m, `${r.id} after ${r.afterMilestone}`).toBeDefined();
      expect(Object.keys(m!.on ?? {}).length > 0 || !!m!.poll, r.afterMilestone).toBe(true);
    }
  });

  it('every aim is opened by a rule or by the founding script, and completes on a milestone with a trigger', () => {
    const founding = PRODUCTION.filter(([f]) => f.includes('/colony/founding/')).map(([, s]) => s).join('\n');
    for (const id of AIM_IDS) {
      if (NOT_BUILT_AIMS.includes(id)) continue;
      const rule = AIM_RULES.find((r) => r.id === id);
      if (rule) expect((MILESTONE_IDS as readonly string[]).includes(rule.completes), id).toBe(true);
      else expect(OPENING_AIMS.includes(id) && founding.includes(`'${id}'`), `${id} has no opener`).toBe(true);
    }
  });
});

describe('world discovery stand-in (zone first entry, micro-connection passage)', () => {
  /** A worker of the colony standing outside the nest at p. */
  function outside(sim: Sim, x: number, z: number): void {
    const a = sim.stores.ants.list.find((w) => w.alive && w.caste === 'worker')!;
    a.nestId = -1;
    a.chamberId = -1;
    a.medium = 'surface';
    a.pos = { x, y: sim.field.height(x, z), z };
  }

  it('a worker on a paving joint discovers it once; the milestone and the codex entry follow; a zone entry is announced', () => {
    const sim = makeProgSim({ workers: 2 });
    const bu = sim.world.bu;
    const c = sim.world.size * 0.2; // away from the queen's start and the nest
    const y = sim.field.height(c, c);
    sim.world.micro.push({
      id: 900, kind: 'paving-joint', posA: { x: c - 4 * bu, y, z: c }, posB: { x: c + 4 * bu, y, z: c }, gapMm: bu,
      minClearanceBu: 1, lengthBu: 8, useful: true, reason: 'test',
    });
    sim.state.worldDelta.microState.push({ id: 900, discovered: false, discoveredTick: -1, open: true });
    const ev = recordEvents(sim, ['world.micro-discovered', 'world.zone-first-entry']);
    outside(sim, c + 20 * bu, c + 20 * bu);
    pollOnce(sim);
    expect(ev.filter((e) => e.type === 'world.micro-discovered')).toHaveLength(0);
    expect(ev.filter((e) => e.type === 'world.zone-first-entry').map((e) => (e as Extract<SimEvent, { type: 'world.zone-first-entry' }>).zoneType)).toEqual(['lawn']);
    outside(sim, c + bu, c + 0.3 * bu);
    pollOnce(sim);
    pollOnce(sim);
    expect(ev.filter((e) => e.type === 'world.micro-discovered')).toHaveLength(1);
    expect(sim.state.worldDelta.microState.find((m) => m.id === 900)?.discovered).toBe(true);
    expect(sim.state.progression.milestones['ms-micro-connection']).toBeDefined();
    expect(sim.state.progression.codexSeen['cx-paving-joints']).toBeDefined();
    // the test world is one lawn zone: no crossing into another zone, no `ms-zone-crossed`
    expect(sim.state.progression.milestones['ms-zone-crossed']).toBeUndefined();
  });

  it('a worker entering another zone type than the nest zone completes ms-zone-crossed with both zone tokens', () => {
    const sim = makeProgSim({ workers: 2 });
    const half = sim.world.size / 2;
    sim.world.zones.push({ id: 7, type: 'pavement', variant: null, rects: [[half, 0, sim.world.size, sim.world.size]], areaMm2: 1 });
    const m = sim.world.maps.zone;
    for (let iz = 0; iz < m.nz; iz++) for (let ix = 0; ix < m.nx; ix++) if ((ix + 0.5) * m.cell > half) m.data[iz * m.nx + ix] = 7;
    const nest = sim.state.nests[0];
    outside(sim, nest.origin.x < half ? half * 1.5 : half * 0.5, half);
    pollOnce(sim);
    const zoneOfNest = nest.origin.x < half ? 'lawn' : 'pavement';
    const other = zoneOfNest === 'lawn' ? 'pavement' : 'lawn';
    const entry = sim.state.progression.journal.entries.find((e) => e.key === 'ms-zone-crossed');
    expect(entry?.tokens).toEqual({ zone_from: zoneOfNest, zone_to: other });
    expect(sim.state.progression.codexSeen[`cx-habitat-${other}`]).toBeDefined();
  });

  it('the queen and a male entering another zone unlock its habitat entry but not ms-zone-crossed; a worker later does', () => {
    // GDD 06 §8 "a worker first enters ..."; GDD 06 §10 / 08 §9.4 habitat entries: "first entry into each zone type"
    const sim = makeProgSim({ workers: 2 });
    const half = sim.world.size / 2;
    sim.world.zones.push({ id: 7, type: 'pavement', variant: null, rects: [[half, 0, sim.world.size, sim.world.size]], areaMm2: 1 });
    const m = sim.world.maps.zone;
    for (let iz = 0; iz < m.nz; iz++) for (let ix = 0; ix < m.nx; ix++) if ((ix + 0.5) * m.cell > half) m.data[iz * m.nx + ix] = 7;
    const nest = sim.state.nests[0];
    const x = nest.origin.x < half ? half * 1.5 : half * 0.5;
    const other = nest.origin.x < half ? 'pavement' : 'lawn';
    const ants = sim.stores.ants.list.filter((a) => a.alive);
    const queen = ants.find((a) => a.caste === 'queen')!;
    const male = ants.find((a) => a.caste === 'worker')!;
    male.caste = 'male';
    for (const a of [queen, male]) {
      a.nestId = -1;
      a.chamberId = -1;
      a.medium = 'surface';
      a.pos = { x, y: sim.field.height(x, half), z: half };
    }
    const ev = recordEvents(sim, ['world.zone-first-entry']);
    pollOnce(sim);
    expect(sim.state.progression.codexSeen[`cx-habitat-${other}`]).toBeDefined();
    expect(sim.state.progression.milestones['ms-zone-crossed']).toBeUndefined();
    const worker = ants.find((a) => a.caste === 'worker')!;
    worker.nestId = -1;
    worker.chamberId = -1;
    worker.medium = 'surface';
    worker.pos = { x, y: sim.field.height(x, half * 0.9), z: half * 0.9 };
    pollOnce(sim);
    pollOnce(sim);
    const entries = sim.state.progression.journal.entries.filter((e) => e.key === 'ms-zone-crossed');
    expect(entries.map((e) => e.tokens)).toEqual([{ zone_from: other === 'pavement' ? 'lawn' : 'pavement', zone_to: other }]);
    // one first-entry event per zone type: the worker's crossing is not announced as a second first entry
    expect(ev.filter((e) => (e as Extract<SimEvent, { type: 'world.zone-first-entry' }>).zoneType === other)).toHaveLength(1);
  });

  it('the first rival of a Formica-type species the colony discovers unlocks cx-formica (rival-discovered)', () => {
    const sim = makeProgSim({ workers: 2 });
    const col = sim.state.colonies[0];
    sim.emit({ type: 'rival-discovered', colonyId: 99, by: col.id, species: 'formica-rufa', pos: { x: 0, y: 0, z: 0 } });
    sim.emit({ type: 'rival-discovered', colonyId: 98, by: 97, species: 'tetramorium-immigrans', pos: { x: 0, y: 0, z: 0 } });
    pollOnce(sim);
    expect(sim.state.progression.codexSeen['cx-formica']).toBeDefined();
    expect(sim.state.progression.codexSeen['cx-pavement-wars']).toBeUndefined(); // discovered by another colony
  });
});
