// Debug-API read-outs and helpers for the Stage 2 systems (task wire-stage2): rivals and territory claims, plants and
// herds, creatures, human events and weather (`__game.query.*` through registerQuery); the fx overlays and effects
// and the creature look read-out (`__game.fx.*`, `__game.ui.look`). Read-only except the overlay switches, which go
// through the UI's overlay state so the HUD controls show the same thing.
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';
import { rivalSummary } from '@/sim/rivals';
import { claimAt } from '@/sim/rivals/claims';
import { humanSites } from '@/sim/environment/human/sites';
import { setOverlay, overlays } from '@/ui/overlays/state';
import type { OverlayId } from '@/ui/overlays/catalogue';
import type { RenderRegistry } from '@/render';
import { creatureLookOf, fxHostOf } from '../stage2Wiring';
import { plain, registerQuery } from './query';

const v3 = (p: Vec3) => ({ x: p.x, y: p.y, z: p.z });

export function registerStage2Queries(): void {
  /** GDD 05 App. B: the rival colonies' abstract numbers. */
  registerQuery('rivals', (sim: Sim) => rivalSummary(sim));
  /** GDD 05 §3.5: who claims the territory cell under a point ({x, z} in mm). */
  registerQuery('territory', (sim: Sim, ...a: unknown[]) => {
    const p = a[0] as { x: number; z: number } | undefined;
    return p ? claimAt(sim, { x: Number(p.x), z: Number(p.z) }) : null;
  });
  /** Living creatures: id, kind, variant, state, position. */
  registerQuery('creatures', (sim: Sim) => sim.state.creatures.filter((c) => c.alive).map((c) => ({
    id: c.id, kind: c.kind, variant: c.variant, state: c.state, pos: v3(c.pos), medium: c.medium,
  })));
  /** The active bird event (pos, phase, ticks), null none. */
  registerQuery('bird', (sim: Sim) => sim.state.ecology.birdEvent);
  /** Plant instances with their world object's position and their herds (spawnHerd needs a plant id). */
  registerQuery('plants', (sim: Sim) => {
    const objs = new Map(sim.world.objects.map((o) => [o.id, o]));
    return sim.state.plants.filter((p) => p.alive).map((p) => {
      const o = objs.get(p.objectId);
      return { id: p.id, objectId: p.objectId, templateId: o?.templateId ?? null, pos: o ? v3(o.pos) : null, hostClass: p.hostClass, herdIds: [...p.herdIds] };
    });
  });
  /** Living herds: id, kind, plant, segment, aphids. */
  registerQuery('herds', (sim: Sim) => sim.stores.herds.list.filter((h) => h.alive).map((h) => ({
    id: h.id, kind: h.kind, hostId: h.hostId, segment: h.segment, aphids: Math.round(h.a), site: herdSite(sim, h.hostId, h.segment),
  })));
  /** Running human events: kind, plan ticks and the tremor cues (src/game/views/tremorCue.ts reads these). */
  registerQuery('humans', (sim: Sim) => sim.state.env.human.active.map((r) => ({
    instId: r.instId, kind: r.inst?.kind ?? null, started: !!r.started, cues: r.cues.map((c) => ({ kind: c.kind, impactTick: c.impactTick, origin: v3(c.origin), radiusMm: c.radiusMm })),
  })));
  /** Human-event sites (lawns, patios, lanes...): id, kind, bounds (mm); scripts aim cheat.humanEvent at one. */
  registerQuery('humanSites', (sim: Sim) => humanSites(sim.world).list.map((h) => ({ id: h.id, kind: h.kind, rect: { ...h.rect } })));
  /** Weather state the weather renderer reads; with a point ({x, z}), also the nearest puddle cell (centre, depth). */
  registerQuery('weather', (sim: Sim, ...a: unknown[]) => {
    const w = sim.state.env.weather, m = sim.state.env.moisture;
    const near = a[0] as { x: number; z: number } | undefined;
    return {
      state: w.state, rainRateMmH: w.rainRateMmH, intensityClass: w.intensityClass, precip: w.precip, surfaceWet: m.surfaceWet ?? 0,
      puddle: near ? nearestPuddle(sim, Number(near.x), Number(near.z)) : null,
    };
  });
}

/** The puddle cell nearest to (x, z): centre on the ground (mm) and depth (mm); null when there is no puddle. */
function nearestPuddle(sim: Sim, x: number, z: number): { x: number; y: number; z: number; depthMm: number; cells: number } | null {
  const m = sim.state.env.moisture;
  let best = -1, bestD = Infinity, cells = 0;
  for (let i = 0; i < m.puddle.length; i++) {
    if (m.puddle[i] === 0) continue;
    cells++;
    const cx = ((i % m.nx) + 0.5) * m.cell, cz = (Math.floor(i / m.nx) + 0.5) * m.cell;
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0) return null;
  const px = ((best % m.nx) + 0.5) * m.cell, pz = (Math.floor(best / m.nx) + 0.5) * m.cell;
  return { x: px, y: sim.field.height(px, pz), z: pz, depthMm: m.puddle[best] * 0.05, cells };
}

/** Where a herd sits: its plant's aphid-site point by segment (the creature renderer's rule), else the plant base. */
function herdSite(sim: Sim, plantId: number, segment: number): Vec3 | null {
  const plant = sim.stores.plants.get(plantId);
  const obj = plant ? sim.world.objects.find((o) => o.id === plant.objectId) : undefined;
  if (!obj) return null;
  const sites = sim.world.pois.filter((p) => p.kind === 'aphid-site' && p.objectId === obj.id);
  return v3(sites.length > 0 ? sites[Math.abs(segment) % sites.length]!.pos : obj.pos);
}

/** `__game.fx.*`: overlays (through the UI state), particle effects in test mode, the fx renderer's statistics. */
export function buildFxDebug(registry: () => RenderRegistry | null | undefined, requestRender: () => void) {
  return {
    /** Switch an overlay ('scent' | 'temperature' | 'moisture' | 'threats' | 'dig-plans'); returns what is on. */
    overlay(id: OverlayId, on = true) {
      setOverlay(id, on);
      requestRender();
      return plain(overlays.peek());
    },
    state: () => plain(overlays.peek()),
    /** Particles / motes are off in the `test` preset unless requested. */
    effects(r: { particles?: boolean; motes?: boolean }) {
      fxHostOf(registry())?.setEffects(r);
      requestRender();
      return true;
    },
    stats: () => plain(fxHostOf(registry())?.stats() ?? null),
  };
}

/** GDD 08 E17 `ui.look(creatureId)`: what the creature was drawn as in the last frame. */
export function lookOf(registry: RenderRegistry | null | undefined, id: number) {
  return plain(creatureLookOf(registry, id));
}
