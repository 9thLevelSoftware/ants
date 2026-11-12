// Load guard for wall-clock budget tests on the shared build machine (up to ten engineers, 4 cores). A budget
// test that fails only because the machine is saturated says nothing about the code, so under heavy load the
// timing is reported instead of asserted. FOUNDRESS_PERF_STRICT=1 always asserts.

/** 1-minute load average per core above which wall-clock budgets are not asserted (outside strict mode). */
const HEAVY_LOAD_PER_CORE = 2;

interface NodeOs {
  loadavg(): number[];
  availableParallelism?(): number;
  cpus(): unknown[];
}

const proc = (globalThis as unknown as {
  process?: { env: Record<string, string | undefined>; getBuiltinModule?: (id: string) => unknown };
}).process;

/** FOUNDRESS_PERF_STRICT=1: exact budgets, always asserted. */
export const PERF_STRICT = proc?.env.FOUNDRESS_PERF_STRICT === '1';

/** True when the machine is too busy for a wall-clock budget to mean anything (never in strict mode). */
export function heavyLoad(): boolean {
  if (PERF_STRICT) return false;
  const os = proc?.getBuiltinModule?.('node:os') as NodeOs | undefined;
  if (!os) return false;
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  return os.loadavg()[0] > HEAVY_LOAD_PER_CORE * Math.max(1, cores);
}
