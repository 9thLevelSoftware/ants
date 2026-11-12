// Reviewer tests (worldgen-terrain): the worker's main-thread fallback (deliverable 7, architecture §8: a worker
// may be refused or fail to load inside a sandboxed iframe). FAILS until the client handles asynchronous worker
// failure: a worker whose script never loads (CSP worker-src, blob: refused, script error) emits an 'error' event
// and never answers, and generateWorldAsync then never settles because it listens for 'message' only and has no
// timeout.
import { describe, expect, it, vi } from 'vitest';
import { generateWorld } from '../index';
import { paramsFor } from '../testing/fixtures';
import { generateWorldAsync, type WorkerLike } from './client';

vi.setConfig({ testTimeout: 120_000 });

type Fn = (ev: { data?: unknown; message?: string }) => void;

/** A worker that failed to load: it fires 'error' to its listeners and never posts a message. */
function deadWorker(): WorkerLike {
  const listeners = new Map<string, Fn[]>();
  const w = {
    postMessage() {
      setTimeout(() => { for (const f of listeners.get('error') ?? []) f({ message: 'worker script failed to load' }); }, 0);
    },
    addEventListener(type: string, f: Fn) { listeners.set(type, [...(listeners.get(type) ?? []), f]); },
    removeEventListener(type: string, f: Fn) { listeners.set(type, (listeners.get(type) ?? []).filter((g) => g !== f)); },
    terminate() {},
  };
  return w as unknown as WorkerLike;
}

describe('worldgen worker fallback (reviewer)', () => {
  it('falls back to the main thread when the worker fails asynchronously (load error, no reply)', async () => {
    const p = paramsFor('car-park-verge', 7, 'compact');
    const direct = generateWorld(p);
    const timeout = new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), 15_000));
    const got = await Promise.race([generateWorldAsync(p, { createWorker: deadWorker }), timeout]);
    expect(got, 'generateWorldAsync never settled').not.toBe('timeout');
    if (got !== 'timeout') expect(got.meta.fingerprint).toBe(direct.meta.fingerprint);
  }, 60_000);
});
