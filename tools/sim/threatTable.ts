// Summary tables of threatFunnel runs (threats-live report): the funnel summed over a directory of runs, the
// worlds on which each family reached each stage, and loss / meeting rates per run.
//
//   node tools/sim/run-ts.mjs tools/sim/threatTable.ts DIR [DIR ...]

import { funnelTable, HUNTERS, type FunnelResult } from './threatFunnel';

interface NodeFs { readdirSync(p: string): string[]; readFileSync(p: string, enc: string): string }

const r2 = (x: number): number => Math.round(x * 100) / 100;

export function rates(runs: FunnelResult[]): string {
  const lines = ['| run | workers start -> end | outside worker-h | telegraphs | strikes | hits | worker deaths to predators (by kind) | deaths / outside-worker-gd | deaths / 100 outside-worker-h | telegraphs / gd | predator-near raised | quiet share min |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  let tD = 0, tH = 0, tT = 0, tS = 0, tHit = 0, tDays = 0;
  for (const r of runs) {
    let tele = 0, strikes = 0, hits = 0;
    for (const k of Object.values(r.kinds)) { tele += k.stages.telegraph; strikes += k.stages.strike; hits += k.stages.hit; }
    const deaths = Object.values(r.workerDeathsPredatorByKind).reduce((a, b) => a + b, 0);
    const owgd = r.colony.outsideWorkerHours / 24;
    tD += deaths; tH += r.colony.outsideWorkerHours; tT += tele; tS += strikes; tHit += hits; tDays += r.days;
    const by = Object.entries(r.workerDeathsPredatorByKind).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
    const ro = r.options as { runSeed?: number; workers?: number };
    lines.push(`| ${r.options.archetype}${ro.runSeed ? ` r${ro.runSeed}` : ''}${ro.workers ? ` w${ro.workers}` : ''} ${r.options.preset ?? 'naturalist'}${r.options.rules ? ' ' + JSON.stringify(r.options.rules) : ''} | ${r.colony.workersStart} -> ${r.colony.workersEnd} | ${r.colony.outsideWorkerHours} | ${tele} | ${strikes} | ${hits} | ${deaths} (${by}) | ${r2(deaths / Math.max(1e-9, owgd))} | ${r2((100 * deaths) / Math.max(1e-9, r.colony.outsideWorkerHours))} | ${r2(tele / r.days)} | ${r.alerts?.predatorNearRaised ?? '-'} | ${r.alerts?.quietShareMin ?? '-'} |`);
  }
  lines.push(`| **all** | | ${tH} | ${tT} | ${tS} | ${tHit} | ${tD} | **${r2(tD / Math.max(1e-9, tH / 24))}** | **${r2((100 * tD) / Math.max(1e-9, tH))}** | ${r2(tT / Math.max(1e-9, tDays))} | | |`);
  return lines.join('\n');
}

export function worlds(runs: FunnelResult[]): string {
  const stages = ['sense', 'select', 'telegraph', 'strike', 'hit', 'kill'] as const;
  const lines = ['| kind | ' + stages.map((s) => `worlds with ${s}`).join(' | ') + ' |', '|---|' + stages.map(() => '---|').join('')];
  for (const k of [...HUNTERS, 'antlion']) {
    lines.push(`| ${k} | ${stages.map((s) => runs.filter((r) => r.kinds[k].stages[s] > 0).length + ' / ' + runs.length).join(' | ')} |`);
  }
  return lines.join('\n');
}

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as NodeFs;
  for (const dir of args) {
    const runs = fs.readdirSync(dir).filter((f) => f.startsWith('funnel-') && f.endsWith('.json')).sort()
      .map((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')) as FunnelResult);
    if (runs.length === 0) continue;
    const birds = runs.map((r) => `${r.options.archetype}: approaches ${r.bird.approaches}, gate ${JSON.stringify(r.bird.gate)}`).join('; ');
    const pits = runs.map((r) => `${r.options.archetype}: pits ${r.antlion.pits}, crossings ${r.antlion.crossings}, flicks ${r.antlion.flicks}, grabs ${r.antlion.grabs}, kills ${r.antlion.kills}`).join('; ');
    console.log(`## ${dir}\n\n### Funnel (summed over ${runs.length} runs)\n\n${funnelTable(runs)}\n\n### Worlds reaching each stage\n\n${worlds(runs)}\n\n### Rates\n\n${rates(runs)}\n\nBird: ${birds}\n\nAntlion: ${pits}\n`);
  }
}
