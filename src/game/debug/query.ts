// `__game.query.*` read-outs (architecture §5; GDD 01 App. F 15, GDD 02 §16, GDD 03 App. E, GDD 04 §16). Each
// returns plain JSON-safe data. Modules can add their own read-outs with registerQuery() without editing this file.
import type { Sim, TargetRef } from '@/sim/types';
import { queryLedger } from '@/sim/colony/summary';
import { inspectTarget, promptView } from '@/sim/ants/player';
import { stateHash } from '@/sim/save/hash';
import { digSpeedAt } from '@/sim/nest';

export type QueryFn = (sim: Sim, ...args: unknown[]) => unknown;

const EXTRA: Record<string, QueryFn> = {};

/** Adds a named read-out under `__game.query.<name>` (module tests and later tasks). */
export function registerQuery(name: string, fn: QueryFn): void {
  EXTRA[name] = fn;
}

/** Plain-data copy (typed arrays become arrays) safe to return through Playwright. */
export function plain(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as unknown as ArrayLike<number>) : x)));
}

function safe<T>(fn: () => T): T | { error: string } {
  try { return fn(); } catch (e) { return { error: String((e as Error)?.message ?? e) }; }
}

export function buildQueries(getSim: () => Sim | null) {
  const withSim = <A extends unknown[]>(fn: (sim: Sim, ...a: A) => unknown) => (...a: A) => {
    const sim = getSim();
    return sim ? safe(() => plain(fn(sim, ...a))) : null;
  };
  const base = {
    ant: withSim((sim, id: number) => sim.stores.ants.get(id) ?? null),
    ants: withSim((sim) => sim.state.ants.filter((a) => a.alive).map((a) => ({ id: a.id, caste: a.caste, colony: a.colony, task: a.task, pos: a.pos }))),
    brood: withSim((sim, id: number) => sim.stores.brood.get(id) ?? null),
    item: withSim((sim, id: number) => sim.stores.items.get(id) ?? null),
    colony: withSim((sim, id?: number) => sim.stores.colonies.get(id ?? sim.state.colonies[0]?.id ?? -1) ?? null),
    ledger: withSim((sim) => queryLedger(sim, sim.state.colonies[0]?.id ?? -1)),
    nest: withSim((sim, id?: number) => (id === undefined ? sim.state.nests : sim.stores.nests.get(id) ?? null)),
    prompt: withSim((sim) => {
      const a = sim.stores.ants.get(sim.state.player.possessedAntId);
      return a ? promptView(sim, a) : null;
    }),
    inspect: withSim((sim, t: TargetRef) => inspectTarget(sim, sim.stores.ants.get(sim.state.player.possessedAntId) ?? null, t)),
    player: withSim((sim) => sim.state.player),
    time: withSim((sim) => sim.state.env.time),
    voxel: withSim((sim) => ({ openVolumeMm3: sim.carve.openVolume(), chunks: sim.state.worldDelta.carve.keys.length, bu: sim.world.bu })),
    field: withSim((sim, x: number, y: number, z: number) => ({ f: sim.field.sampleXYZ(x, y, z), substrate: sim.field.substrate({ x, y, z }), height: sim.field.height(x, z) })),
    /**
     * Diggability at a point (inside the solid): material, the player colony's species dig speed (0 = too hard),
     * and the material of a primitive within `primPad` mm (stems, stones: scripts choose dig sites clear of them).
     */
    dig: withSim((sim, x: number, y: number, z: number, primPad?: number) => {
      const p = { x, y, z };
      const prim = sim.field.primAt(p, Number(primPad ?? 0));
      return { material: sim.field.materialAt(p), speed: digSpeedAt(sim, sim.species.id, p), substrate: sim.field.substrate(p), prim: prim ? prim.material : null };
    }),
    world: withSim((sim) => ({
      size: sim.world.size, bu: sim.world.bu, prims: sim.world.prims.length, objects: sim.world.objects.length,
      queenStart: sim.world.queenStart, generatorVersion: sim.world.generatorVersion, fingerprint: sim.world.meta?.fingerprint ?? null,
    })),
    stateHash: withSim((sim) => stateHash(sim.state)),
    /** Mounds and spoil heaps (world delta): id, entrance, cells, volume (mm^3), centre. */
    mounds: withSim((sim) => sim.state.worldDelta.mounds.map((m) => ({
      id: m.id, entranceId: m.entranceId, n: m.n, cell: m.cell, volume: m.volume, absorbed: m.absorbed, centerX: m.centerX, centerZ: m.centerZ,
    }))),
    /** Living items counted by kind. */
    items: withSim((sim) => {
      const out: Record<string, number> = {};
      for (const it of sim.state.items) if (it.alive) out[it.kind] = (out[it.kind] ?? 0) + 1;
      return out;
    }),
  };
  return new Proxy(base as Record<string, (...a: unknown[]) => unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      const fn = EXTRA[prop];
      return fn ? withSim((sim, ...a: unknown[]) => fn(sim, ...a)) : undefined;
    },
  });
}
