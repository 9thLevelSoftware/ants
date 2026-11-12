// Sim events: carve grid, pellets, mounds, entrances, plans, chambers, founding dig, flood, collapse (GDD 03 App. C).

import type { Vec3 } from '@/core/math/vec3';
import type { ChamberType, Material } from './ids';
import type {
  ArchitectNeed, EntranceKind, EntranceStatus, NestMilestoneKind, PelletDumpTarget, PlanBlockedReason, PlanKind,
  PlanPriority, PlanStatus, PlanValidationCode,
} from './ids/nest';

export type NestEvent =
  | { type: 'carve-chunks-dirty'; keys: number[] }
  | { type: 'breach'; nestId: number; entranceId: number; pos: Vec3; radius: number }
  | { type: 'pellet-created'; antId: number; itemId: number; volume: number; material: Material; pos: Vec3 }
  | { type: 'pellet-expelled'; antId: number; itemId: number; volume: number; material: Material; pos: Vec3; moundId: number }
  | { type: 'pellet-dumped'; itemId: number; into: PelletDumpTarget }
  | { type: 'mound-changed'; moundId: number; min: Vec3; max: Vec3 }
  | { type: 'entrance-opened'; entranceId: number; nestId: number; kind: EntranceKind }
  | { type: 'entrance-state-changed'; entranceId: number; status: EntranceStatus; prev: EntranceStatus }
  | { type: 'plan-created'; planId: number; kind: PlanKind; priority: PlanPriority }
  | { type: 'plan-rejected'; kind: PlanKind; codes: PlanValidationCode[]; warnings: PlanValidationCode[] }
  | { type: 'plan-status-changed'; planId: number; status: PlanStatus; blockedReason: PlanBlockedReason | null }
  | { type: 'plan-progress'; planId: number; progress: number }
  | { type: 'plan-complete'; planId: number; kind: PlanKind }
  | { type: 'architect-proposal'; planId: number; need: ArchitectNeed; priority: PlanPriority }
  | { type: 'chamber-registered'; chamberId: number; nestId: number; chamberType: ChamberType; volume: number }
  | { type: 'chamber-changed'; chamberId: number; chamberType: ChamberType; volume: number; reason: string }
  | { type: 'chamber-removed'; chamberId: number; reason: string }
  | { type: 'chamber-designated'; chamberId: number; chamberType: ChamberType }
  /**
   * Shared refusal of any command (D4.20). reason: 'unknown-type' | 'cheats-disabled' | 'unhandled' |
   * 'handler-error' | module-specific codes; detail: error text (optional).
   */
  | { type: 'command-rejected'; commandType: string; reason: string; detail?: string }
  | { type: 'natural-cavity-joined'; cavityId: number; nestId: number }
  | { type: 'foreign-cavity-contact'; cavityId: number; nestId: number; otherColony: number }
  /** D5.10: readiness 0..1 and its parts 0..1. */
  | { type: 'founding-readiness'; nestId: number; readiness: number; parts: { depth: number; volume: number } }
  | { type: 'founding-ready'; nestId: number }
  | { type: 'founding-sealed'; nestId: number; entranceId: number }
  | { type: 'founding-reopened'; nestId: number }
  | { type: 'flood-started'; nestId: number; water: number; level: number; chambers: number[] }
  | { type: 'flood-level'; nestId: number; water: number; level: number; chambers: number[] }
  | { type: 'flood-ended'; nestId: number }
  | { type: 'ant-submerged'; id: number; pos: Vec3 }
  | { type: 'brood-drowned'; id: number; pos: Vec3 }
  | { type: 'collapse-warning'; nestId: number; center: Vec3; radius: number; volume: number }
  | { type: 'collapse'; nestId: number; center: Vec3; radius: number; volume: number; breach: boolean }
  | { type: 'nest-milestone'; kind: NestMilestoneKind; value: number };
