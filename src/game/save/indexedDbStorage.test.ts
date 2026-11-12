// The IndexedDB back end against a missing, throwing or misbehaving IndexedDB: it must always resolve a status.
// (Real IndexedDB behaviour is exercised in the browser by tests/e2e/save.mjs.)
import { describe, expect, it } from 'vitest';
import { IndexedDbStorage } from './indexedDbStorage';
import { classifyError } from './storage';

describe('IndexedDbStorage failure paths', () => {
  it('no IndexedDB at all: unavailable, for every call, never a rejection', async () => {
    const s = new IndexedDbStorage({ factory: () => null });
    expect(await s.open()).toMatchObject({ ok: false, status: 'unavailable' });
    expect(await s.get('saves', 'x')).toMatchObject({ ok: false, status: 'unavailable' });
    expect(await s.getAll('meta')).toMatchObject({ ok: false, status: 'unavailable' });
    expect(await s.write([{ op: 'put', store: 'saves', key: 'a', value: { x: 1 } }])).toMatchObject({ ok: false, status: 'unavailable' });
    s.close();
  });

  it('the global itself throws on access (sandboxed iframe)', async () => {
    const s = new IndexedDbStorage({ factory: () => { throw new DOMException('denied', 'SecurityError'); } });
    const r = await s.open();
    expect(r).toMatchObject({ ok: false, status: 'unavailable' });
    expect((r as { message: string }).message).toMatch(/denied|not available/i);
  });

  it('open() throwing synchronously, erroring asynchronously, or being blocked', async () => {
    const throwing = { open: () => { throw new Error('boom'); } } as unknown as IDBFactory;
    expect(await new IndexedDbStorage({ factory: () => throwing }).open()).toMatchObject({ ok: false });

    const erroring = {
      open: () => {
        const req: { onerror?: () => void; error?: unknown } = { error: new DOMException('nope', 'InvalidStateError') };
        queueMicrotask(() => req.onerror?.());
        return req;
      },
    } as unknown as IDBFactory;
    expect(await new IndexedDbStorage({ factory: () => erroring }).open()).toMatchObject({ ok: false, status: 'unavailable' });

    const blocked = {
      open: () => {
        const req: { onblocked?: () => void } = {};
        queueMicrotask(() => req.onblocked?.());
        return req;
      },
    } as unknown as IDBFactory;
    expect(await new IndexedDbStorage({ factory: () => blocked }).open()).toMatchObject({ ok: false, status: 'unavailable' });
  });

  it('a refused open is remembered: later calls do not retry it', async () => {
    let calls = 0;
    const s = new IndexedDbStorage({ factory: () => { calls++; return null; } });
    await s.open();
    await s.open();
    await s.get('saves', 'x');
    expect(calls).toBe(1);
  });
});

describe('classifyError', () => {
  it('words quota, denied and generic failures', () => {
    expect(classifyError(new DOMException('full', 'QuotaExceededError')).status).toBe('quota');
    expect(classifyError(new Error('The quota has been exceeded')).status).toBe('quota');
    expect(classifyError(new DOMException('x', 'SecurityError')).status).toBe('unavailable');
    expect(classifyError(new Error('whatever')).status).toBe('failed');
    expect(classifyError('string').status).toBe('failed');
    expect(classifyError(null).status).toBe('failed');
  });
});
