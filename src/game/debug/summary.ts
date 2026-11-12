// `__game.summary()` (architecture §5): compact, JSON-safe digest of the running game for Playwright scripts:
// time, weather, colony population by caste and task, stores, brood, nest, alerts, the possessed ant, camera.
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { colonySummary } from '@/sim/colony/summary';
import { timeOf } from '../uiBridge';
import type { GameSession } from '../session';
import type { GameMode } from '../time/speedRules';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const vec = (p: { x: number; y: number; z: number }) => [r3(p.x), r3(p.y), r3(p.z)];

export interface SummaryContext {
  mode: GameMode;
  session: GameSession | null;
  manualClock: boolean;
  /** Paused by window blur or pad loss (GDD 01 E17). */
  autoPaused: boolean;
  camera: { state: string | null; observerMode: string | null; pos: { x: number; y: number; z: number }; underground: boolean };
  renderers: Record<string, string>;
}

function possessedSummary(sim: Sim, a: Ant | undefined) {
  if (!a) return null;
  return {
    id: a.id, caste: a.caste, controlled: (a.flags & AntFlag.POSSESSED) !== 0, task: a.task, state: a.state,
    pos: vec(a.pos), up: vec(a.up), fwd: vec(a.fwd), medium: a.medium, speed: r3(a.speed),
    underground: sim.field.substrate(a.pos) < 0, health: r3(a.maxHp > 0 ? a.hp / a.maxHp : 0),
    crop: { c: r3(a.cropC), p: r3(a.cropP), cap: r3(a.cropCap) }, carry: { kind: a.carry.kind, id: a.carry.id },
    action: a.action ? a.action.id : null, trailOn: (a.flags & AntFlag.TRAIL_ON) !== 0, lengthBu: r3(a.lengthBu),
  };
}

function colonyPart(sim: Sim) {
  const col = sim.state.colonies[0];
  if (!col) return null;
  try {
    const s = colonySummary(sim, col.id);
    if (s) return { id: col.id, ...s };
  } catch {
    // colony module in progress: fall back to plain counts below
  }
  const byCaste: Record<string, number> = {};
  for (const a of sim.state.ants) if (a.alive && a.colony === col.id) byCaste[a.caste] = (byCaste[a.caste] ?? 0) + 1;
  return { id: col.id, byCaste, stores: { C: col.stores.c, P: col.stores.p } };
}

function nestPart(sim: Sim) {
  let entrances = 0, chambers = 0, plans = 0;
  for (const n of sim.state.nests) {
    if (!n.alive) continue;
    entrances += n.entrances.length; chambers += n.chambers.length; plans += n.digPlans.length;
  }
  return {
    nests: sim.state.nests.filter((n) => n.alive).length, entrances, chambers, plans,
    carveChunks: sim.state.worldDelta.carve.keys.length, breaches: sim.state.worldDelta.carve.breaches.length,
    openVolumeBu3: r3(sim.carve.openVolume() / sim.world.bu ** 3),
  };
}

export function buildSummary(ctx: SummaryContext) {
  const s = ctx.session;
  if (!s) return { mode: ctx.mode, tick: -1, game: null };
  const sim = s.sim, st = sim.state, t = st.env.time;
  const w = st.env.weather;
  const living = (k: { alive: boolean }[]) => k.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  return {
    mode: ctx.mode,
    view: s.view,
    tick: st.tick,
    seed: st.config.world.seed,
    species: st.config.species,
    time: {
      ...timeOf(sim), speed: t.paused ? 0 : t.speed, running: t.speed, paused: t.paused, requested: t.requested,
      effective: r3(s.driver.speedReport().effective), manualClock: ctx.manualClock, autoPaused: ctx.autoPaused,
    },
    weather: { state: w.state, precip: r3(w.precip), cloud: r3(w.cloud), wind: r3(w.wind2m) },
    colony: colonyPart(sim),
    brood: living(st.brood),
    counts: { ants: living(st.ants), brood: living(st.brood), items: living(st.items), creatures: living(st.creatures), sources: living(st.sources), markers: living(st.markers) },
    nest: nestPart(sim),
    alerts: st.progression.alerts.map((a) => ({ id: a.id, kind: a.kind, level: a.level })),
    possessed: possessedSummary(sim, s.possessedAnt()),
    previousAntId: st.player.previousAntId,
    returnAntId: st.player.returnAntId,
    opening: st.player.opening ? { phase: st.player.opening.phase, done: st.player.opening.done } : null,
    camera: { state: ctx.camera.state, observerMode: ctx.camera.observerMode, pos: vec(ctx.camera.pos), underground: ctx.camera.underground, followId: s.followId },
    renderers: ctx.renderers,
  };
}
