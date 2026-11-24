// The player's opening, headless (task opening-fix item 2): CLI around src/sim/colony/founding/playerOpeningKit.ts,
// which issues the same commands as beats 04-13 of tests/e2e/firstplay.mjs straight to the sim.
//
//   node tools/sim/run-ts.mjs tools/sim/opening.ts --seed 2 [--out DIR] [--until 11] [--after-ticks 7500]
//        [--dump-state <beat prefix>] [--save-handover FILE]
//
// The JSON summary goes to stdout (and DIR/opening-<seed>.json with --out); a line per beat to stderr.
// --dump-state: the whole state as JSON at that beat into DIR (to diff with firstplay.mjs FIRSTPLAY_DUMP_STATE).
// --save-handover: a sim snapshot right after "Take a worker" (the probe test-output/opening-fix/probes/reopenProbe.ts.txt restored it).

import type { Sim } from '@/sim/types';
import { snapshot } from '@/sim/save';
import { runOpening, type OpeningOptions } from '@/sim/colony/founding/playerOpeningKit';

declare const process: { exitCode?: number; stderr: { write(s: string): void }; stdout: { write(s: string): void } };

interface NodeFs { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string | Uint8Array): void }

interface CliOptions extends OpeningOptions { out: string | null; dumpState: string; saveHandover: string }

function stateJson(sim: Sim): string {
  return JSON.stringify(sim.state, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as unknown as ArrayLike<number>) : x));
}

function parse(args: string[]): CliOptions {
  const o: CliOptions = { seed: 2, until: '', afterTicks: 7500, out: null, dumpState: '', saveHandover: '' };
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i], v = args[i + 1];
    if (k === '--seed') o.seed = Number(v);
    else if (k === '--until') o.until = v;
    else if (k === '--after-ticks') o.afterTicks = Number(v);
    else if (k === '--out') o.out = v;
    else if (k === '--dump-state') o.dumpState = v;
    else if (k === '--save-handover') o.saveHandover = v;
    else throw new Error(`opening: unknown option ${k}`);
  }
  return o;
}

export default async function main(args: string[]): Promise<void> {
  const o = parse(args);
  const fs = (await import('node:fs' as string)) as NodeFs;
  if (o.out) fs.mkdirSync(o.out, { recursive: true });
  o.log = (line) => process.stderr.write(`${line}\n`);
  o.onBeat = (name, d) => {
    if (o.dumpState && o.out && name.startsWith(o.dumpState)) fs.writeFileSync(`${o.out}/state-${name}.json`, stateJson(d.sim));
  };
  if (o.saveHandover) o.onHandover = (sim) => fs.writeFileSync(o.saveHandover, snapshot(sim));
  const t0 = Date.now();
  const { result } = runOpening(o);
  result.checks.wallS = Math.round((Date.now() - t0) / 100) / 10;
  const text = JSON.stringify(result, null, 1);
  if (o.out) fs.writeFileSync(`${o.out}/opening-${o.seed}.json`, text);
  process.stdout.write(`${text}\n`);
  process.exitCode = result.failure ? 1 : 0;
}
