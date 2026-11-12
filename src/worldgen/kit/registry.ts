// Placer registration. A content module (src/worldgen/place/<area>/index.ts, src/worldgen/populate/index.ts,
// src/worldgen/catalog/<area>/index.ts) exports a `worldgen: WorldgenModule` object; the pipeline discovers them at
// build time (Vite eager glob: static imports, so the classic single-file bundle includes them) and runs each
// placer in its GDD 04 step. A placer with the same id as a built-in default replaces it.

import type { ArchetypeId, WorldgenCheck } from '@/sim/types';
import type { ContentKind, GenContext } from './context';
import type { ObjectTemplate } from './template';
import type { RngState } from '@/core/rng';
import { PLACER_STEPS, type PlacerStep } from '../tuning/pipeline';

export interface PlacerDef {
  /** Unique id, e.g. 'outdoor/paving'. Built-in defaults are 'default/<name>'. */
  id: string;
  step: PlacerStep;
  /** Order inside the step (ascending; ties by id). Default 0. */
  order?: number;
  /** Run only for these archetypes (default: all). */
  archetypes?: readonly ArchetypeId[];
  /** Content this placer provides (makes the matching validation checks applicable). */
  provides?: readonly ContentKind[];
  run(ctx: GenContext): void;
}

/** Repair action (GDD 04 §4.3 R1..R5) applied to the best attempt after the last regeneration failed. */
export interface RepairDef {
  /** 'R1' .. 'R5' (or a module-specific id); listed in WorldMeta.repairs when it changed the world. */
  id: string;
  check: WorldgenCheck;
  /** Returns true if it changed the world. */
  run(ctx: GenContext): boolean;
}

export type TemplateFactory = (rng: RngState) => ObjectTemplate;

export interface WorldgenModule {
  placers?: PlacerDef[];
  repairs?: RepairDef[];
  /** Templates other modules may reuse by id (e.g. 'flat-stone' for repair R2). */
  templates?: Record<string, TemplateFactory>;
}

export interface Registry {
  placers: PlacerDef[];
  repairs: RepairDef[];
  templates: Record<string, TemplateFactory>;
}

type ModuleFile = { worldgen?: WorldgenModule };

/** Content modules found in the source tree, sorted by path (deterministic). */
export function discoveredModules(): WorldgenModule[] {
  const found = import.meta.glob<ModuleFile>(['../place/*/index.ts', '../populate/index.ts', '../catalog/*/index.ts'], { eager: true });
  return Object.keys(found).sort().map((k) => found[k].worldgen).filter((m): m is WorldgenModule => !!m);
}

/**
 * Merges the built-in defaults with content modules: same-id placers replace defaults (last module wins),
 * then sorts by step (GDD order), order, id.
 */
export function buildRegistry(defaults: WorldgenModule, modules: readonly WorldgenModule[]): Registry {
  const byId = new Map<string, PlacerDef>();
  const repairs = new Map<string, RepairDef>();
  const templates: Record<string, TemplateFactory> = {};
  for (const m of [defaults, ...modules]) {
    for (const p of m.placers ?? []) byId.set(p.id, p);
    for (const r of m.repairs ?? []) repairs.set(`${r.check}:${r.id}`, r);
    Object.assign(templates, m.templates ?? {});
  }
  const stepIdx = (s: PlacerStep) => PLACER_STEPS.indexOf(s);
  const placers = [...byId.values()].sort((a, b) =>
    stepIdx(a.step) - stepIdx(b.step) || (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const reps = [...repairs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.check < b.check ? -1 : 1));
  return { placers, repairs: reps, templates };
}

/** Placers of one step that apply to the archetype. */
export function placersFor(reg: Registry, step: PlacerStep, archetype: ArchetypeId): PlacerDef[] {
  return reg.placers.filter((p) => p.step === step && (!p.archetypes || p.archetypes.includes(archetype)));
}
