import { describe, expect, it } from 'vitest';

// Source of every module under src/sim and src/worldgen (Vite glob, so no Node APIs are needed).
const SOURCES = {
  ...import.meta.glob('/src/sim/**/*.ts', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/src/worldgen/**/*.ts', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
const ALLOWED = [/^@\/core(\/|$)/, /^@\/sim(\/|$)/, /^@\/worldgen(\/|$)/, /^\.\.?\//];
const TEST_ONLY = [/^vitest$/];
// Browser globals (not property names such as DigPlan.window) and non-deterministic clocks / randomness.
const FORBIDDEN_GLOBALS =
  /(?<![.\w$])(window|document|localStorage|indexedDB)(?![\w$]|\s*[:?])|\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Removes string literal contents (ids such as 'window' are data, not globals). */
function stripStrings(src: string): string {
  return src.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
}

describe('layering (architecture §2)', () => {
  it('finds the sources', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(40);
  });

  it('src/sim and src/worldgen import only from core, sim, worldgen', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(SOURCES)) {
      const isTest = file.endsWith('.test.ts');
      for (const m of stripComments(src).matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2] ?? m[3];
        const ok = ALLOWED.some((r) => r.test(spec)) || (isTest && TEST_ONLY.some((r) => r.test(spec)));
        if (!ok) bad.push(`${file}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('non-test simulation code uses no DOM, wall clock or Math.random', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(SOURCES)) {
      if (file.endsWith('.test.ts')) continue;
      const m = stripStrings(stripComments(src)).match(FORBIDDEN_GLOBALS);
      if (m) bad.push(`${file}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('layering checker', () => {
  it('flags browser globals but not property names or ids', () => {
    expect(FORBIDDEN_GLOBALS.test('const w = window.innerWidth;')).toBe(true);
    expect(FORBIDDEN_GLOBALS.test('x = Math.random();')).toBe(true);
    expect(FORBIDDEN_GLOBALS.test('plan.window.length')).toBe(false);
    expect(FORBIDDEN_GLOBALS.test('  window: number[];')).toBe(false);
    expect(FORBIDDEN_GLOBALS.test(stripStrings("kind === 'window'"))).toBe(false);
  });
});
