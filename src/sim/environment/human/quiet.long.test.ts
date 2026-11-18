// E25 in a whole game (GDD 05 App. E 25, invariant I11; quiet-time task step 4), FOUNDRESS_LONG=1: an AI-only colony
// (no possession) from a cached hand-over (test-output/colony-life/round-4/cache, made by tools/sim/life.ts
// --cache-any) to the first tick of winter, human events at normal, the quiet share of every trailing 3-game-day
// window of daytime hours outside founding and winter against the preset's QUIET_SHARE_MIN.
//   - the outside alerts (people, predators, rivals) and the major threats must meet it in every window: asserted;
//   - a major threat must start in each Naturalist and Harsh run (E25 clause, I11): asserted, and RED while the colony's
//     own standing warnings keep the director's trailing share under QUIET_SHARE_MIN + 0.05: it then refuses every
//     threat (threats.blockedByShareHours), so the outside-only share above is quiet because no threat ever came;
//   - all alerts, the colony's own included: asserted only with FOUNDRESS_QUIET_STRICT=1 (strict mode). The colony
//     does not grow yet, so its own standing warnings (food, brood, crowding), the nest flood and the heat warning
//     keep most hours loud; the numbers are written to test-output/quiet-time/ either way.
// Snapshots are not part of the repository: a missing one skips its case (it.skipIf, listed as skipped, never a pass).

import { describe, expect, it } from 'vitest';
import type { ArchetypeId, DifficultyId } from '@/sim/types';
import { DIFFICULTY_PARAMS } from '@/sim/balance/difficulty';
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
const minShare = (preset: DifficultyId): number => DIFFICULTY_PARAMS[preset].quietShareMin;
const snapshotOf = (archetype: ArchetypeId): string => `${CACHE}/founded-lasius-niger-${archetype}-1-naturalist-d-any.bin`;
const haveSnapshot = async (archetype: ArchetypeId): Promise<boolean> => (await node()).fs.existsSync(snapshotOf(archetype));
const CASES = [['suburban-garden', 'naturalist'], ['kitchen-door', 'naturalist'], ['suburban-garden', 'gentle'], ['kitchen-door', 'harsh']] as const;
const present = new Map<ArchetypeId, boolean>([['suburban-garden', await haveSnapshot('suburban-garden')], ['kitchen-door', await haveSnapshot('kitchen-door')]]);

async function run(archetype: ArchetypeId, preset: DifficultyId, workers = 0) {
  const { env, fs } = await node();
  const file = snapshotOf(archetype);
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
  // one run per case, shared by the assertions below
  const runs = new Map<string, ReturnType<typeof run>>();
  const once = (a: ArchetypeId, p: DifficultyId) => { const k = `${a}/${p}`; if (!runs.has(k)) runs.set(k, run(a, p)); return runs.get(k)!; };

  for (const [archetype, preset] of CASES) {
    // a missing snapshot is a skipped case, never a silent pass
    const itCase = it.skipIf(!present.get(archetype));
    itCase(`${archetype}, ${preset}: the outside alerts and threats meet QUIET_SHARE_MIN in every window`, async () => {
      const out = await once(archetype, preset);
      expect(out.r.outsideOnly.windows).toBeGreaterThan(0);
      expect(out.r.outsideOnly.min ?? 1).toBeGreaterThanOrEqual(minShare(preset));
      if (out.strict) expect(out.r.windows.min ?? 1).toBeGreaterThanOrEqual(minShare(preset));
    }, 3_600_000);

    if (preset === 'gentle') continue;
    itCase(`${archetype}, ${preset}: at least one major threat started (E25), so the share above is not met by an idle director`, async () => {
      const { r } = await once(archetype, preset);
      expect(r.threats.started, `director refused a threat in ${r.threats.blockedByShareHours} of ${r.threats.blockedHours} hours for lack of quiet share`).toBeGreaterThan(0);
    }, 3_600_000);
  }
});
