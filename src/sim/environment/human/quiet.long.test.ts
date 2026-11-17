// E25 in a whole game (GDD 05 App. E 25, invariant I11; quiet-time task step 4), FOUNDRESS_LONG=1: an AI-only colony
// (no possession) from a cached hand-over (test-output/colony-life/round-4/cache, made by tools/sim/life.ts
// --cache-any) to the first tick of winter, human events at normal, the quiet share of every trailing 3-game-day
// window of daytime hours outside founding and winter against the preset's QUIET_SHARE_MIN.
//   - the outside alerts (people, predators, rivals) and the major threats must meet it in every window: asserted;
//   - all alerts, the colony's own included: asserted only with FOUNDRESS_QUIET_STRICT=1 (strict mode). The colony
//     does not grow yet, so its own standing warnings (food, brood, crowding), the nest flood and the heat warning
//     keep most hours loud; the numbers are written to test-output/quiet-time/ either way.
// Snapshots are not part of the repository: a missing one skips its case.

import { describe, expect, it } from 'vitest';
import type { ArchetypeId, DifficultyId } from '@/sim/types';
import { runQuiet, type QuietOpts } from '../../../../tools/sim/quietRun';

interface Node {
  env: Record<string, string | undefined>;
  fs: { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array; mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string): void };
}
const node = async (): Promise<Node> => {
  const mod = 'node:fs';
  const fs = (await import(/* @vite-ignore */ mod)) as Node['fs'];
  return { env: (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}, fs };
};
const LONG = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}).FOUNDRESS_LONG === '1';
const CACHE = 'test-output/colony-life/round-4/cache';
const MIN: Record<DifficultyId, number> = { gentle: 0.75, naturalist: 0.6, harsh: 0.4 };

async function run(archetype: ArchetypeId, preset: DifficultyId, workers = 0) {
  const { env, fs } = await node();
  const file = `${CACHE}/founded-lasius-niger-${archetype}-1-naturalist-d-any.bin`;
  if (!fs.existsSync(file)) return null;
  const o: QuietOpts = {
    archetype, seed: 1, days: 14, preset: preset === 'naturalist' ? null : preset, rules: { humanActivity: 'normal' }, cache: CACHE, out: null, tag: '',
    snapshot: null, runSeed: 0, workers, food: [0, 0], untilWinter: true, counts: false,
  };
  const r = runQuiet(o, new Uint8Array(fs.readFileSync(file)), () => undefined);
  fs.mkdirSync('test-output/quiet-time/long', { recursive: true });
  fs.writeFileSync(`test-output/quiet-time/long/whole-${archetype}-${preset}${workers ? `-w${workers}` : ''}.json`, JSON.stringify({ ...r, hourRecords: undefined }, null, 1));
  return { r, strict: env.FOUNDRESS_QUIET_STRICT === '1' };
}

describe.skipIf(!LONG)('E25 whole game, AI-only colony, hand-over to winter', () => {
  it.each([['suburban-garden', 'naturalist'], ['kitchen-door', 'naturalist'], ['suburban-garden', 'gentle'], ['kitchen-door', 'harsh']] as const)(
    '%s, %s: the outside alerts and threats meet QUIET_SHARE_MIN in every window', async (archetype, preset) => {
      const out = await run(archetype, preset);
      if (!out) return;
      expect(out.r.outsideOnly.windows).toBeGreaterThan(0);
      expect(out.r.outsideOnly.min ?? 1).toBeGreaterThanOrEqual(MIN[preset]);
      if (out.strict) expect(out.r.windows.min ?? 1).toBeGreaterThanOrEqual(MIN[preset]);
    }, 3_600_000);
});
