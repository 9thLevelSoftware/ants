// Batch of threatFunnel runs in one process (threats-calibrate): every world x run seed in turn, one at a time, each
// written as it finishes (funnel-*.json / .md as threatFunnel.ts --out), then a summary `tables.md` (threatTable's
// tables plus strikes per family per world). Results already on disk are kept, so a cut-off batch resumes (only when
// they were made with the same run options: runMismatch).
// Observer only: changes no rule.
//
//   node tools/sim/run-ts.mjs tools/sim/threatBatch.ts --out DIR [--worlds a,b,..] [--seed 1] [--run-seeds 1,2]
//        [--days 6] [--preset P] [--rules JSON] [--workers N] [--food C,P] [--cache DIR] [--until-winter 1]
//
// Wall clock and files live here, never in src/sim.

import type { ArchetypeId, DifficultyId } from '@/sim/types';
import { funnelTable, HUNTERS, runFunnel, type FunnelResult } from './threatFunnel';
import { rates, worlds } from './threatTable';

interface NodeFs { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string): void; existsSync(p: string): boolean; readFileSync(p: string): Uint8Array }

const ALL: ArchetypeId[] = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'];

/** Strikes (and kills) per family per run: the "which families hunt" table. */
export function strikesTable(runs: FunnelResult[]): string {
  const head = `| run | ${HUNTERS.join(' | ')} | bird pecks |`;
  const lines = [head, '|---|' + HUNTERS.map(() => '---|').join('') + '---|'];
  for (const r of runs) {
    const cells = HUNTERS.map((k) => `${r.kinds[k].stages.strike} / ${r.workerDeathsPredatorByKind[k] ?? 0}`);
    lines.push(`| ${r.options.archetype} r${(r.options as { runSeed?: number }).runSeed ?? 0} | ${cells.join(' | ')} | ${r.bird.pecks} |`);
  }
  const tot = HUNTERS.map((k) => `${runs.reduce((a, r) => a + r.kinds[k].stages.strike, 0)} / ${runs.reduce((a, r) => a + (r.workerDeathsPredatorByKind[k] ?? 0), 0)}`);
  lines.push(`| **all** | ${tot.join(' | ')} | ${runs.reduce((a, r) => a + r.bird.pecks, 0)} |`);
  return '(strikes / worker kills)\n\n' + lines.join('\n');
}

/** The options that decide a run's outcome (out and tag only name files; snapshot is the cache file of the batch). */
const RUN_KEYS = ['archetype', 'seed', 'days', 'preset', 'rules', 'cache', 'workers', 'food', 'runSeed', 'untilWinter'] as const;

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${k}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/**
 * The run options in which a result on disk differs from the requested run ([] = the same run, safe to reuse).
 * The file name holds only archetype, seed, preset, custom, workers and run seed; a rerun into the same --out with
 * other --days, --until-winter, --food, --cache or --rules content must not pick up the old result.
 */
export function runMismatch(stored: Record<string, unknown>, wanted: Record<string, unknown>): string[] {
  const norm = (o: Record<string, unknown>, k: string): unknown => (k === 'untilWinter' ? o[k] === true : o[k]);
  return RUN_KEYS.filter((k) => canon(norm(stored, k)) !== canon(norm(wanted, k)));
}

/** Worker deaths to predators per colony run, and their median (the founding-year check: median <= 1). */
export function perColony(runs: FunnelResult[]): string {
  const d = runs.map((r) => Object.values(r.workerDeathsPredatorByKind).reduce((a, b) => a + b, 0));
  const s = [...d].sort((a, b) => a - b);
  const med = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
  const days = runs.map((r) => r.days);
  return `predation deaths per colony: ${d.join(', ')} (median ${med}); run lengths ${Math.min(...days)}-${Math.max(...days)} gd; workers start ${runs.map((r) => r.colony.workersStart).join(', ')}`;
}

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as NodeFs;
  const get = (k: string, d: string): string => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const out = get('--out', '');
  if (!out) throw new Error('threatBatch: --out DIR is required');
  const worldsArg = get('--worlds', ALL.join(',')).split(',') as ArchetypeId[];
  const runSeeds = get('--run-seeds', '0').split(',').map(Number);
  const preset = (get('--preset', '') || null) as DifficultyId | null;
  const rulesS = get('--rules', '');
  const base = {
    seed: Number(get('--seed', '1')), days: Number(get('--days', '6')), preset, rules: rulesS ? JSON.parse(rulesS) as Record<string, unknown> : null,
    cache: get('--cache', 'test-output/colony-life/round-4/cache'), out, tag: '', snapshot: null,
    workers: Number(get('--workers', '0')), food: get('--food', '0,0').split(',').map(Number) as [number, number],
    untilWinter: get('--until-winter', '0') === '1',
  };
  fs.mkdirSync(out, { recursive: true });
  const runs: FunnelResult[] = [];
  for (const archetype of worldsArg) {
    for (const runSeed of runSeeds) {
      const o = { ...base, archetype, runSeed };
      const file = `${o.cache}/founded-lasius-niger-${archetype}-${o.seed}-naturalist-d-any.bin`;
      if (!fs.existsSync(file)) { console.error(`no hand-over snapshot ${file}`); continue; }
      const b = `${out}/funnel-${archetype}-${o.seed}-${preset ?? 'naturalist'}${o.rules ? '-custom' : ''}${o.workers ? `-w${o.workers}` : ''}-r${runSeed}`;
      // Restartable: a run whose result is already on disk (from a batch cut off by a restart) is read, not re-run,
      // but only when it was made with the same options; otherwise stop rather than mix two configurations.
      if (fs.existsSync(`${b}.json`)) {
        const kept = JSON.parse(new TextDecoder().decode(fs.readFileSync(`${b}.json`))) as FunnelResult;
        const diff = runMismatch(kept.options as unknown as Record<string, unknown>, o as unknown as Record<string, unknown>);
        if (diff.length > 0) throw new Error(`threatBatch: ${b}.json was made with other options (${diff.join(', ')}); use another --out or delete it`);
        runs.push(kept);
        console.error(`[batch] kept ${archetype} r${runSeed} from ${b}.json`);
        continue;
      }
      const r = runFunnel(o, new Uint8Array(fs.readFileSync(file)), (s) => console.error(`[batch ${archetype} r${runSeed} ${preset ?? 'snap'} w${o.workers}] ${s}`));
      runs.push(r);
      fs.writeFileSync(`${b}.json`, JSON.stringify(r, null, 1));
      fs.writeFileSync(`${b}.md`, funnelTable([r]) + '\n');
      console.error(`[batch] done ${archetype} r${runSeed}: workers ${r.colony.workersStart} -> ${r.colony.workersEnd}, predation ${JSON.stringify(r.workerDeathsPredatorByKind)}, ${r.wallS} s`);
    }
  }
  const md = `# ${out}\n\nargs: ${args.join(' ')}\n\n${perColony(runs)}\n\n## Rates\n\n${rates(runs)}\n\n## Strikes per family\n\n${strikesTable(runs)}\n\n## Worlds reaching each stage\n\n${worlds(runs)}\n\n## Funnel (summed)\n\n${funnelTable(runs)}\n`;
  fs.writeFileSync(`${out}/tables.md`, md);
  fs.writeFileSync(`${out}/DONE`, '');
  console.error(md);
}
