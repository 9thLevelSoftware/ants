// Messages between the main thread and the world-generation worker. Plain data only (structured clone).

import type { WorldData, WorldgenCheck, WorldParams } from '@/sim/types';
import type { WorldgenProgress } from '../pipeline';

export interface GenerateRequest {
  type: 'worldgen.generate';
  /** Request id echoed in every reply. */
  id: number;
  params: WorldParams;
  forceFail?: { check: WorldgenCheck; attempts: number };
}

export type WorkerReply =
  | { type: 'worldgen.progress'; id: number; progress: WorldgenProgress }
  | { type: 'worldgen.done'; id: number; world: WorldData }
  | { type: 'worldgen.error'; id: number; message: string };

/** The part of a Worker / DedicatedWorkerGlobalScope / MessagePort the protocol uses. */
export interface MessageEndpoint {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (ev: { data: unknown }) => void): void;
  removeEventListener(type: 'message', fn: (ev: { data: unknown }) => void): void;
}

/** Underlying buffers of every typed array in the world (transferred, not copied). */
export function worldTransferables(world: WorldData): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  const visit = (v: unknown, depth: number) => {
    if (v === null || typeof v !== 'object' || depth > 8) return;
    if (ArrayBuffer.isView(v)) { if (v.buffer instanceof ArrayBuffer) out.add(v.buffer); return; }
    if (Array.isArray(v)) { for (const e of v) visit(e, depth + 1); return; }
    for (const k of Object.keys(v)) visit((v as Record<string, unknown>)[k], depth + 1);
  };
  visit(world, 0);
  return [...out];
}
