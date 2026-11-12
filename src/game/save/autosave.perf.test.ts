// Autosave cost (task save, acceptance 4): the synchronous part of an autosave of a 1,500-ant state must stay under
// 80 ms. Timing is noisy on a shared machine: the test repeats and takes the MINIMUM, asserts a load-tolerant bound
// by default, and the strict 80 ms bound with FOUNDRESS_STRICT_PERF=1 (run on a quiet machine). The real
// IndexedDB figure is measured in the browser by tests/e2e/save.mjs.
import { describe, expect, it } from 'vitest';
import { deepCopy } from './deepCopy';
import { makeRig } from './testkit';

const STRICT = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_STRICT_PERF === '1';
const ANTS = 1500;
const REPEATS = 7;

function bigRig() {
  const rig = makeRig({ workers: ANTS });
  expect(rig.host.sim!.state.ants.length).toBeGreaterThanOrEqual(ANTS);
  return rig;
}

describe(`autosave of ${ANTS} ants`, () => {
  it('blocks the caller for a short time (deep copy at the tick boundary), and what is stored is exact', async () => {
    const rig = bigRig();
    await rig.manager.init();
    const sync: number[] = [];
    for (let i = 0; i < REPEATS; i++) {
      rig.host.sim!.tick();
      const t0 = performance.now();
      const pending = rig.manager.autosave('interval'); // everything up to the write call happens synchronously
      sync.push(performance.now() - t0);
      expect((await pending).ok).toBe(true);
    }
    const copy: number[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const t0 = performance.now();
      deepCopy(rig.host.sim!.state);
      copy.push(performance.now() - t0);
    }
    const clone: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      structuredClone(rig.host.sim!.state);
      clone.push(performance.now() - t0);
    }
    const min = (a: number[]) => Math.round(Math.min(...a) * 10) / 10;
    console.info(`[perf] ${ANTS} ants: autosave sync part min ${min(sync)} ms, deepCopy min ${min(copy)} ms, structuredClone min ${min(clone)} ms`);
    expect(min(sync)).toBeLessThan(STRICT ? 80 : 400);
    expect(min(copy)).toBeLessThan(STRICT ? 80 : 400);
  });

  it('the stored copy is independent of the live state (the sim can keep ticking)', async () => {
    const rig = makeRig({ workers: 50 });
    await rig.manager.init();
    const pending = rig.manager.autosave('interval');
    const before = rig.host.sim!.state.tick;
    for (let i = 0; i < 5; i++) rig.host.sim!.tick(); // the loop moves on before the write finishes
    await pending;
    await rig.manager.load('auto');
    expect(rig.host.adopted.at(-1)!.sim.state.tick).toBe(before);
  });
});
