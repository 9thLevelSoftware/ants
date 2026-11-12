// Identifier sets for nests, excavation, chambers, dig plans and the architect (GDD 03 §17).

/** Bits in the optional per-voxel flag array of a carve chunk (GDD 03 §1.1). */
export const VoxelFlag = {
  LOOSE: 1,
  NATURAL: 2,
  PLUG: 4,
} as const;

export const ENTRANCE_KINDS = ['dug', 'natural', 'accidental', 'window'] as const;
export type EntranceKind = (typeof ENTRANCE_KINDS)[number];

export const ENTRANCE_STATUSES = ['open', 'sealing', 'sealed', 'reopening'] as const;
export type EntranceStatus = (typeof ENTRANCE_STATUSES)[number];

export const NEST_KINDS = ['main', 'satellite'] as const;
export type NestKind = (typeof NEST_KINDS)[number];

export const PLAN_KINDS = ['tunnel', 'shaft', 'chamber', 'entrance', 'seal', 'reopen', 'widen', 'backfill'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_STATUSES = ['proposed', 'queued', 'active', 'stalled', 'paused', 'complete', 'cancelled'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_SOURCES = ['player', 'architect', 'founding', 'worldgen', 'rival'] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export const PLAN_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type PlanPriority = (typeof PLAN_PRIORITIES)[number]; // weights live in src/sim/balance/nest.ts

export const CHAMBER_SIZES = ['s', 'm', 'l'] as const;
export type ChamberSize = (typeof CHAMBER_SIZES)[number];

export const PLAN_VALIDATION_CODES = [
  'anchor-not-in-nest', 'type-not-allowed', 'out-of-bounds', 'water', 'non-diggable', 'overlaps-plan', 'too-large',
  'unstable', 'undermines', 'too-close', 'foreign-nest', 'flood-risk',
] as const;
export type PlanValidationCode = (typeof PLAN_VALIDATION_CODES)[number];

export const PLAN_BLOCKED_REASONS = [
  'no-diggers', 'no-haulers', 'unreachable', 'flooded', 'obstructed', 'unstable', 'temperature', 'season',
  'foreign-contact', 'invalidated', 'cap',
] as const;
export type PlanBlockedReason = (typeof PLAN_BLOCKED_REASONS)[number];

export const ARCHITECT_MODES = ['auto', 'suggest', 'off'] as const;
export type ArchitectMode = (typeof ARCHITECT_MODES)[number];

export const ARCHITECT_NEEDS = [
  'crowding', 'brood-space', 'food-space', 'missing-type', 'winter-depth', 'flood-safety', 'entrance-access',
] as const;
export type ArchitectNeed = (typeof ARCHITECT_NEEDS)[number];

/** State of the founding dig (GDD 03 §13). */
export const FOUNDING_DIG_STATES = ['site-search', 'digging', 'ready', 'sealed', 'reopening', 'established'] as const;
export type FoundingDigState = (typeof FOUNDING_DIG_STATES)[number];

/** Where a dropped pellet went (GDD 03 `pellet-dumped.into`). */
export const PELLET_DUMP_TARGETS = ['mound', 'heap', 'terrain', 'water', 'plug', 'tamp'] as const;
export type PelletDumpTarget = (typeof PELLET_DUMP_TARGETS)[number];

/** Nest milestone kinds (GDD 03 `nest-milestone`). */
export const NEST_MILESTONE_KINDS = ['depth-50', 'depth-100', 'chambers-10', 'volume-1000', 'survived-flood'] as const;
export type NestMilestoneKind = (typeof NEST_MILESTONE_KINDS)[number];

/** Who designated a chamber's type. */
export const DESIGNATED_BY = ['player', 'auto'] as const;
export type DesignatedBy = (typeof DESIGNATED_BY)[number];

/** Chamber flags (GDD 07 A.0): bit = index. */
export const CHAMBER_FLAGS = ['central', 'unstable'] as const;
export type ChamberFlag = (typeof CHAMBER_FLAGS)[number];

/** Distance-field targets inside a nest (GDD 03 §5: D_exit, D_seal, D_ch, D_plan). */
export const NEST_FIELD_KINDS = ['none', 'exit', 'seal', 'chamber', 'plan'] as const;
export type NestFieldKind = (typeof NEST_FIELD_KINDS)[number];
