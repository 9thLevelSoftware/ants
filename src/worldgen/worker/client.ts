// Main-thread side: generate a world in a worker when one can be created, else on the main thread (same output,
// GDD 04 DET-7). The game supplies the worker factory, because how a worker is built depends on the packaging:
// in the classic single-file build the worker source is inlined and started from a Blob URL (blobWorkerFactory),
// since module workers and worker URLs fail in an opaque-origin iframe (architecture §8).

import type { WorldData, WorldgenCheck, WorldParams } from '@/sim/types';
import { generateWorldReport, type WorldgenProgress } from '../pipeline';
import type { MessageEndpoint, WorkerReply } from './protocol';

export interface WorkerLike extends MessageEndpoint {
  terminate(): void;
  addEventListener(type: 'message', fn: (ev: { data: unknown }) => void): void;
}

export interface AsyncGenerateOptions {
  onProgress?: (p: WorldgenProgress) => void;
  /** Returns a worker running worker/entry.ts, or null; any throw means "no worker" (fallback). */
  createWorker?: () => WorkerLike | null;
  forceFail?: { check: WorldgenCheck; attempts: number };
}

let nextId = 1;

function onMainThread(params: WorldParams, o: AsyncGenerateOptions): Promise<WorldData> {
  // defer one microtask so callers can paint a loading state first
  return Promise.resolve().then(() => generateWorldReport(params, { onProgress: o.onProgress, forceFail: o.forceFail }).world);
}

/** Generates the world off the main thread when possible; resolves with the same WorldData either way. */
export function generateWorldAsync(params: WorldParams, o: AsyncGenerateOptions = {}): Promise<WorldData> {
  let worker: WorkerLike | null = null;
  try { worker = o.createWorker ? o.createWorker() : null; } catch { worker = null; }
  if (!worker) return onMainThread(params, o);
  const w = worker;
  const id = nextId++;
  return new Promise<WorldData>((resolve) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      w.removeEventListener('message', onMessage);
      try { w.terminate(); } catch { /* already gone */ }
      fn();
    };
    const onMessage = (ev: { data: unknown }) => {
      const r = ev.data as WorkerReply;
      if (!r || r.id !== id) return;
      if (r.type === 'worldgen.progress') o.onProgress?.(r.progress);
      else if (r.type === 'worldgen.done') finish(() => resolve(r.world));
      else if (r.type === 'worldgen.error') finish(() => { void onMainThread(params, o).then(resolve); });
    };
    w.addEventListener('message', onMessage);
    try {
      w.postMessage({ type: 'worldgen.generate', id, params, forceFail: o.forceFail });
    } catch {
      finish(() => { void onMainThread(params, o).then(resolve); });
    }
  });
}

/** Minimal shapes of the browser globals the Blob factory needs (absent in Node and some sandboxes). */
interface BlobCtor { new (parts: string[], opts: { type: string }): unknown }
interface UrlApi { createObjectURL(b: unknown): string; revokeObjectURL(u: string): void }
interface WorkerCtor { new (url: string): WorkerLike }

/**
 * Worker factory from the inlined source text of a classic worker bundle of worker/entry.ts. Returns a factory
 * that yields null when Blob, URL.createObjectURL or Worker are unavailable or refuse (so the caller falls back).
 */
export function blobWorkerFactory(source: string): () => WorkerLike | null {
  return () => {
    const g = globalThis as unknown as { Blob?: BlobCtor; URL?: UrlApi; Worker?: WorkerCtor };
    if (!g.Blob || !g.URL?.createObjectURL || !g.Worker) return null;
    const url = g.URL.createObjectURL(new g.Blob([source], { type: 'text/javascript' }));
    try {
      return new g.Worker(url);
    } finally {
      g.URL.revokeObjectURL(url);
    }
  };
}
