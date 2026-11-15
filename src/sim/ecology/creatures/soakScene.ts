// The headless creature soak (task AC 3): a 300-worker colony (the small test nest) on a 400 BU test world with
// creature territories for every Tier 2 kind, three aphid herds, prey patches; a stand-in forager driver keeps
// 60 workers out by day (20 at night) wandering around the nest with work pauses (the real foraging behaviours
// are other tasks'), replacing the dead from the nest. Measures counts against caps, quiet share, predation.
// Test support only (not used by the game).

import type { Ant, CreatureKind, Sim, System } from '@/sim/types';
import { rngFork, rngFloat, rngRange } from '@/core/rng';
import { makeTestSim } from '@/sim/testing';
import { spawnBrood } from '@/sim/entities';
import { locomotionSystem, navStop, navWander, placeOnSurface } from '@/sim/locomotion';
import { CREATURE_AGENT_CAP } from '@/sim/balance/creatures';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { creatureDirectorSystem, creatureSystem, capOf, quietTracker } from './index';
import { conditions } from './conditions';
import { addHerd, installFakeCombat, setClock } from './testkit';

export interface SoakResult {
  days: number;
  ticks: number;
  /** Highest live count per kind and its cap at that moment exceeded? */
  maxCount: Record<string, number>;
  capViolations: string[];
  maxTotal: number;
  /** Deaths per cause (predation, antlion, bird). */
  deaths: Record<string, number>;
  deathsPerGd: number[];
  /** Quiet share (I11) per closed trailing 3-GD window (counted hours only) and the threats started. */
  minWindowShare: number | null;
  windows: number;
  threats: number;
  birdEvents: number;
  invasions: number;
  telegraphs: number;
  strikes: number;
  hits: number;
  /** Strike hits per predator kind. */
  hitsByKind: Record<string, number>;
  insideSolid: number;
}

const FORAGERS_DAY = 60;
const FORAGERS_NIGHT = 20;
const FORAGE_RADIUS_MM = 600;
const MOUND_RADIUS_MM = 120;
/** Brood in the nursery (centipede invasions need brood). */
const BROOD = 40;

/** Territories for every resident / visitor kind around the nest (positions in mm on a 1600 mm map). */
function addTerritories(sim: Sim): void {
  const t = (kind: CreatureKind, x: number, z: number, r: number) =>
    sim.state.ecology.director.territories.push({ kind, center: { x, y: 0, z }, radius: r, occupantId: -1, vacantUntilTick: -1 });
  const ring = (kind: CreatureKind, n: number, dist: number, r: number, phase = 0) => {
    for (let i = 0; i < n; i++) {
      const a = phase + (2 * Math.PI * i) / n;
      t(kind, 800 + Math.cos(a) * dist, 800 + Math.sin(a) * dist, r);
    }
  };
  ring('wolf-spider', 4, 450, 500, 0.3);
  ring('jumping-spider', 5, 380, 300, 1.1);
  ring('ant-spider', 3, 330, 300, 2.0);
  ring('antlion', 3, 520, 25, 0.7);
  ring('centipede', 3, 600, 400, 1.7);
  ring('rove-beetle', 6, 420, 300, 0.2);
  ring('woodlouse', 6, 650, 200, 0.9);
  ring('millipede', 4, 560, 200, 2.6);
  ring('earthworm', 4, 300, 250, 1.4);
  ring('snail', 3, 680, 300, 0.5);
  ring('springtail', 4, 250, 160, 0.1);
}

interface Driver { foragers: number[]; rng: ReturnType<typeof rngFork> }

function forageDriver(d: Driver): System {
  return {
    name: 'soak-foragers', phase: 'behaviours',
    run(s) {
      const e = s.state.nests[0]?.entrances[0]?.pos;
      if (!e) return;
      d.foragers = d.foragers.filter((id) => s.stores.ants.has(id));
      const want = conditions(s).phase === 'night' ? FORAGERS_NIGHT : FORAGERS_DAY;
      // send workers out / back in (back in = put on the nest floor, under the entrance)
      if (s.state.tick % 50 === 0) {
        while (d.foragers.length > want) {
          const a = s.stores.ants.get(d.foragers.pop()!);
          if (a) { navStop(s, a); a.task = 'idle'; placeOnSurface(s, a, { x: e.x, y: e.y - 40, z: e.z }, { x: 0, y: -1, z: 0 }); }
        }
        for (const a of s.stores.ants.list) {
          if (d.foragers.length >= want) break;
          if (!a.alive || a.caste !== 'worker' || a.nestId < 0 || d.foragers.includes(a.id)) continue;
          const ang = rngRange(d.rng, 0, 2 * Math.PI);
          if (placeOnSurface(s, a, { x: e.x + Math.cos(ang) * 30, y: e.y, z: e.z + Math.sin(ang) * 30 })) {
            a.task = 'forage';
            d.foragers.push(a.id);
          }
        }
      }
      // wander with work pauses (antennating, harvesting): part of the time standing
      for (const id of d.foragers) {
        const a = s.stores.ants.get(id) as Ant;
        if ((s.state.tick + id) % 20 !== 0) continue;
        // half of them work near the mound (trail heads, mound work), half range out
        const r = id % 2 === 0 ? MOUND_RADIUS_MM : FORAGE_RADIUS_MM;
        if (a.nav.mode === 'wander' && rngFloat(d.rng) < 0.08) navStop(s, a);
        else if (a.nav.mode !== 'wander' && rngFloat(d.rng) < 0.3) navWander(s, a, { x: e.x, y: e.y, z: e.z }, r);
      }
    },
  };
}

/** Runs the soak for `days` game days (wall time is measured by the caller). */
export function runSoak(days: number, seed: number): SoakResult {
  const { restore } = installFakeCombat();
  try {
    const d: Driver = { foragers: [], rng: rngFork(seed, 'soak-foragers') };
    const sim = makeTestSim({
      seed, sizeBu: 400, terrain: 'noise', prims: 14, features: ['stone', 'wall'], nest: 'small', workers: 300,
      systems: [forageDriver(d), creatureDirectorSystem, creatureSystem, locomotionSystem],
    });
    return soakOn(sim, days);
  } finally {
    restore();
  }
}

function soakOn(sim: Sim, days: number): SoakResult {
  setClock(sim, 'summer', 3, 6);
  sim.state.progression.stage.id = 'growing';
  addTerritories(sim);
  for (const [x, z] of [[500, 700], [1100, 900], [800, 1150]]) addHerd(sim, x, z, 250);
  const nest = sim.state.nests[0];
  const nursery = nest.chambers.find((c) => c.type === 'nursery') ?? nest.chambers[0];
  for (let i = 0; i < BROOD; i++) {
    spawnBrood(sim, {
      colony: nest.colony, stage: i % 2 ? 'larva' : 'pupa', destined: 'worker', nestId: nest.id, chamberId: nursery.id,
      pos: { x: nursery.center.x + (i % 5) - 2, y: nursery.center.y - nursery.radii.y * 0.8, z: nursery.center.z + Math.floor(i / 5) - 4 },
    });
  }
  const r: SoakResult = {
    days, ticks: 0, maxCount: {}, capViolations: [], maxTotal: 0, deaths: {}, deathsPerGd: [], minWindowShare: null,
    windows: 0, threats: 0, birdEvents: 0, invasions: 0, telegraphs: 0, strikes: 0, hits: 0, hitsByKind: {}, insideSolid: 0,
  };
  const dayDeaths: number[] = [];
  sim.events.on('ant-died', (ev) => {
    if (ev.cause === 'predation' || ev.cause === 'antlion' || ev.cause === 'bird') {
      r.deaths[ev.cause] = (r.deaths[ev.cause] ?? 0) + 1;
      const day = Math.floor(sim.state.tick / TICKS_PER_DAY);
      dayDeaths[day] = (dayDeaths[day] ?? 0) + 1;
    }
  });
  sim.events.on('bird-landed', () => { r.birdEvents++; });
  sim.events.on('predator-telegraph', () => { r.telegraphs++; });
  sim.events.on('predator-strike', (ev) => {
    r.strikes++;
    if (!ev.hit) return;
    r.hits++;
    const k = sim.stores.creatures.get(ev.creatureId)?.kind ?? 'gone';
    r.hitsByKind[k] = (r.hitsByKind[k] ?? 0) + 1;
  });
  const codes: number[] = [];
  let lastTotal = 0;
  const end = Math.round(days * TICKS_PER_DAY);
  for (let t = 0; t < end; t++) {
    sim.tick();
    if (sim.state.rivals.threatDirector.activeKind === 'centipede-invasion' && t % TICKS_PER_HOUR === 0) r.invasions++;
    if (t % 50 === 49) {
      let total = 0;
      const counts: Record<string, number> = {};
      // leaving (fly-off) and unhatched (egg) aphid predators are not at the herds any more / yet
      for (const c of sim.stores.creatures.list) {
        if (!c.alive) continue;
        total++;
        if (c.state !== 'fly-off' && c.state !== 'egg') counts[c.kind] = (counts[c.kind] ?? 0) + 1;
      }
      for (const [k, n] of Object.entries(counts)) {
        r.maxCount[k] = Math.max(r.maxCount[k] ?? 0, n);
        const cap = capOf(sim, k as CreatureKind);
        if (n > cap && !r.capViolations.some((v) => v.startsWith(`${k} `))) r.capViolations.push(`${k} ${n} > ${cap} at tick ${sim.state.tick}`);
      }
      r.maxTotal = Math.max(r.maxTotal, total);
      if (total > CREATURE_AGENT_CAP) r.capViolations.push(`total ${total}`);
    }
    if (t % 200 === 0) for (const c of sim.stores.creatures.list) if (c.alive && sim.field.sample(c.pos) < -0.5) r.insideSolid++;
    const q = quietTracker(sim);
    if (q.total !== lastTotal) {
      lastTotal = q.total;
      codes.push(q.hours[(q.head - 1 + q.hours.length) % q.hours.length]);
    }
  }
  // every trailing 3-GD window (72 clock hours) of counted hours
  for (let i = 72; i <= codes.length; i++) {
    const w = codes.slice(i - 72, i).filter((c) => c >= 0);
    if (w.length === 0) continue;
    const share = w.reduce((a, b) => a + b, 0) / w.length;
    r.windows++;
    r.minWindowShare = r.minWindowShare === null ? share : Math.min(r.minWindowShare, share);
  }
  r.threats = quietTracker(sim).threats;
  r.ticks = end;
  r.deathsPerGd = Array.from({ length: Math.ceil(days) }, (_, i) => dayDeaths[i] ?? 0);
  return r;
}
