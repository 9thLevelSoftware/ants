// Re-judges and summarises colony-life reports (tools/sim/life.ts JSON files): one verdict line per run and the
// per-day Markdown table of each. Use after a sweep, or after the health rules changed.
//
//   node tools/sim/run-ts.mjs tools/sim/lifeSummary.ts test-output/int1b/sweep [--tables]

import type { LifeReport } from './life';
import { lifeMarkdown } from './life';
import { judge } from './lifeHealth';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readdirSync(p: string): string[]; readFileSync(p: string, e: string): string };
  const dir = args[0] ?? 'test-output/int1b/sweep';
  const tables = args.includes('--tables');
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('life-') && f.endsWith('.json')).sort();
  const lines: string[] = ['| run | founding | workers start -> end | deliveries | eggs | eclosed | net growth | verdict | failed checks |', '|---|---|---|---|---|---|---|---|---|'];
  const out: string[] = [];
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')) as LifeReport;
    if (r.perf) continue;
    r.verdict = judge(r);
    const last = r.days[r.days.length - 1]?.state;
    const deliveries = r.days.reduce((a, d) => a + d.events.deliveries, 0);
    const eggs = r.days.reduce((a, d) => a + d.events.eggsLaid, 0);
    const eclosed = r.days.slice(1).reduce((a, d) => a + d.events.eclosions, 0);
    const failed = r.verdict.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`).join('; ');
    lines.push(`| ${r.options.archetype} #${r.options.seed} | ${r.founding.phase}, ${r.founding.gd} gd | ${r.founding.workers} -> ${last?.workers ?? '-'} | ${deliveries} | ${eggs} | ${eclosed} | ${r.verdict.netGrowth ? 'yes' : 'no'} | ${r.verdict.healthy ? 'healthy' : 'unhealthy'} | ${failed || '-'} |`);
    if (tables) out.push(lifeMarkdown(r), '');
  }
  console.log([...lines, '', ...out].join('\n'));
}
