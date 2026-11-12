// Size report of the output folder and the limits check (architecture section 8).
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS } from './config.mjs';
import { formatBytes, listFiles } from './util.mjs';

/** @returns {{ lines: string[], failures: string[], total: number, files: {name:string,bytes:number}[] }} */
export function sizeReport(dir) {
  const files = listFiles(dir).map((name) => ({ name, bytes: fs.statSync(path.join(dir, name)).size }));
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const width = Math.max(...files.map((f) => f.name.length));
  const lines = files.map((f) => `  ${f.name.padEnd(width)}  ${formatBytes(f.bytes).padStart(10)}`);
  lines.push(`  ${'TOTAL'.padEnd(width)}  ${formatBytes(total).padStart(10)}   (${files.length} files)`);
  const failures = [];
  if (total > LIMITS.totalBytes) failures.push(`total ${formatBytes(total)} exceeds ${formatBytes(LIMITS.totalBytes)}`);
  if (files.length > LIMITS.fileCount) failures.push(`${files.length} files exceed the limit of ${LIMITS.fileCount}`);
  for (const f of files) {
    if (f.bytes > LIMITS.fileBytes) failures.push(`${f.name} is ${formatBytes(f.bytes)}, over the per-file limit ${formatBytes(LIMITS.fileBytes)}`);
    if (f.name.startsWith('packs/') && f.bytes > LIMITS.packBytes) failures.push(`pack ${f.name} is ${formatBytes(f.bytes)}, over the pack limit ${formatBytes(LIMITS.packBytes)}`);
  }
  return { lines, failures, total, files };
}
