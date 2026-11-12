// Worker protocol (in-process message channel with structured clone): same fingerprint as the main thread
// (DET-7), progress forwarded, typed arrays transferred, fallback when no worker can be created.
import { describe, expect, it } from 'vitest';
import { generateWorld, worldFingerprint } from '../index';
import { paramsFor } from '../testing/fixtures';
import { generateWorldAsync, type WorkerLike } from './client';
import { installWorldgenHost } from './host';
import type { MessageEndpoint } from './protocol';
import { worldTransferables } from './protocol';

type Fn = (ev: { data: unknown }) => void;

/** Two endpoints joined like a worker and its global scope; messages are structured-cloned asynchronously. */
function channel(): { main: WorkerLike; scope: MessageEndpoint; transferred: number[] } {
  const listeners: { main: Fn[]; scope: Fn[] } = { main: [], scope: [] };
  const transferred: number[] = [];
  const endpoint = (self: 'main' | 'scope', other: 'main' | 'scope') => ({
    postMessage(msg: unknown, transfer?: Transferable[]) {
      transferred.push(transfer?.length ?? 0);
      const copy = structuredClone(msg);
      setTimeout(() => { for (const f of [...listeners[other]]) f({ data: copy }); }, 0);
    },
    addEventListener(_t: 'message', f: Fn) { listeners[self].push(f); },
    removeEventListener(_t: 'message', f: Fn) { listeners[self] = listeners[self].filter((g) => g !== f); },
  });
  const main = { ...endpoint('main', 'scope'), terminate() {} } as WorkerLike;
  return { main, scope: endpoint('scope', 'main'), transferred };
}

describe('worldgen worker', () => {
  it('generates the same world through the worker protocol as on the main thread, with progress', async () => {
    const p = paramsFor('kitchen-door', 7, 'compact');
    const direct = generateWorld(p);
    const ch = channel();
    const off = installWorldgenHost(ch.scope);
    const steps: string[] = [];
    const w = await generateWorldAsync(p, { createWorker: () => ch.main, onProgress: (q) => steps.push(q.step) });
    off();
    expect(w.meta.fingerprint).toBe(direct.meta.fingerprint);
    expect(worldFingerprint(w)).toBe(direct.meta.fingerprint);
    expect(steps[0]).toBe('zones');
    expect(steps).toContain('validate');
    expect(Math.max(...ch.transferred)).toBeGreaterThan(10); // the done message transfers the typed arrays
  }, 120_000);

  it('falls back to the main thread when no worker can be created or the worker fails', async () => {
    const p = paramsFor('car-park-verge', 7, 'compact');
    const direct = generateWorld(p);
    const a = await generateWorldAsync(p, { createWorker: () => { throw new Error('blocked by sandbox'); } });
    expect(a.meta.fingerprint).toBe(direct.meta.fingerprint);
    const b = await generateWorldAsync(p, { createWorker: () => null });
    expect(b.meta.fingerprint).toBe(direct.meta.fingerprint);
    const ch = channel(); // no host installed: reply with an error by hand
    ch.scope.addEventListener('message', (ev) => {
      const id = (ev.data as { id: number }).id;
      ch.scope.postMessage({ type: 'worldgen.error', id, message: 'boom' });
    });
    const c = await generateWorldAsync(p, { createWorker: () => ch.main });
    expect(c.meta.fingerprint).toBe(direct.meta.fingerprint);
  }, 120_000);

  it('collects every typed-array buffer for transfer', () => {
    const w = generateWorld(paramsFor('playground-park', 7, 'compact'));
    const bufs = worldTransferables(w);
    expect(bufs).toContain(w.terrain.data.buffer);
    expect(bufs).toContain(w.maps.zone.data.buffer);
    expect(new Set(bufs).size).toBe(bufs.length);
  }, 60_000);
});
