// Batch of threatFunnel runs in one process (threats-calibrate): every world x run seed in turn, one at a time, each
// written as it finishes (funnel-*.json / .md as threatFunnel.ts --out), then a summary `tables.md` (threatTable's
// tables plus strikes per family per world). Observer only: changes no rule.
//
//   node tools/sim/run-ts.mjs tools/sim/threatBatch.ts --out DIR [--worlds a,b,..] [--seed 1] [--run-seeds 1,2]
//        [--days 6] [--preset P] [--rules JSON] [--workers N] [--food C,P] [--cache DIR]
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
  };
  fs.mkdirSync(out, { recursive: true });
  const runs: FunnelResult[] = [];
  for (const archetype of worldsArg) {
    for (const runSeed of runSeeds) {
      const o = { ...base, archetype, runSeed };
      const file = `${o.cache}/founded-lasius-niger-${archetype}-${o.seed}-naturalist-d-any.bin`;
      if (!fs.existsSync(file)) { console.error(`no hand-over snapshot ${file}`); continue; }
      const r = runFunnel(o, new Uint8Array(fs.readFileSync(file)), (s) => console.error(`[batch ${archetype} r${runSeed} ${preset ?? 'snap'} w${o.workers}] ${s}`));
      runs.push(r);
      const b = `${out}/funnel-${archetype}-${o.seed}-${preset ?? 'naturalist'}${o.rules ? '-custom' : ''}${o.workers ? `-w${o.workers}` : ''}-r${runSeed}`;
      fs.writeFileSync(`${b}.json`, JSON.stringify(r, null, 1));
      fs.writeFileSync(`${b}.md`, funnelTable([r]) + '\n');
      console.error(`[batch] done ${archetype} r${runSeed}: workers ${r.colony.workersStart} -> ${r.colony.workersEnd}, predation ${JSON.stringify(r.workerDeathsPredatorByKind)}, ${r.wallS} s`);
    }
  }
  const md = `# ${out}\n\nargs: ${args.join(' ')}\n\n## Rates\n\n${rates(runs)}\n\n## Strikes per family\n\n${strikesTable(runs)}\n\n## Worlds reaching each stage\n\n${worlds(runs)}\n\n## Funnel (summed)\n\n${funnelTable(runs)}\n`;
  fs.writeFileSync(`${out}/tables.md`, md);
  fs.writeFileSync(`${out}/DONE`, '');
  console.error(md);
}
