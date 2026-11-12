// Acceptance 1: src/worldgen imports only src/core, src/sim/types, the kernel modules and the data modules the
// generator reads (balance tables, species BU), plus itself. No three, DOM, wall clock or Math.random.
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('/src/worldgen/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
const ALLOWED = [
  /^@\/core(\/|$)/, /^@\/sim\/types(\/|$)/,
  // kernel modules (docs/design/tdd/02-kernel.md)
  /^@\/sim\/kernel$/, /^@\/sim\/world\/(field|primHash|terrainSample)$/, /^@\/sim\/nest\/carve(\/|$)/, /^@\/sim\/locomotion\/walker(Params)?$/,
  // data: balance tables (world sizes, grids, GDD 03 dig table, difficulty presets) and the species registry (BU)
  /^@\/sim\/balance$/, /^@\/sim\/species$/,
  /^\.\.?\//,
];
const TEST_ONLY = [/^vitest$/, /^@\/sim\/createGame$/];
const FORBIDDEN = /\bfrom\s+['"]three|\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b|(?<![.\w$])(window|document)(?![\w$]|\s*[:?])|\bMath\.(sin|cos|exp|log|pow|atan2|hypot)\b/;

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('worldgen layering', () => {
  it('finds the sources', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(30);
  });

  it('imports only core, sim/types, kernel modules, balance/species data and worldgen itself', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(SOURCES)) {
      const isTest = file.endsWith('.test.ts');
      for (const m of strip(src).matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2] ?? m[3];
        if (!(ALLOWED.some((r) => r.test(spec)) || (isTest && TEST_ONLY.some((r) => r.test(spec))))) bad.push(`${file}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('non-test code uses no three, DOM, clocks, Math.random or transcendental Math functions (DET-3, DET-4)', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(SOURCES)) {
      if (file.endsWith('.test.ts')) continue;
      const m = strip(src).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").match(FORBIDDEN);
      if (m) bad.push(`${file}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
});
