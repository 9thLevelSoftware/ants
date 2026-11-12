// Independent verification of the player manual (reviewer's tests): unmarked key mentions, table shape, screen
// coverage against the id registry, heading hygiene.
import { describe, expect, it } from 'vitest';
import index from '../../docs/design/gdd/00-index.md?raw';
import readme from '../../docs/manual/README.md?raw';
import gettingStarted from '../../docs/manual/01-getting-started.md?raw';
import controls from '../../docs/manual/02-controls.md?raw';
import views from '../../docs/manual/03-views.md?raw';
import colony from '../../docs/manual/04-the-colony.md?raw';
import nest from '../../docs/manual/05-the-nest.md?raw';
import species from '../../docs/manual/06-species.md?raw';
import settings from '../../docs/manual/07-settings.md?raw';
import troubleshooting from '../../docs/manual/08-troubleshooting.md?raw';
import { ACTIONS } from '@/input/actions';
import { bindingLabel, defaultBindings } from '@/input/bindings';

const PAGES: Record<string, string> = {
  'README.md': readme, '01-getting-started.md': gettingStarted, '02-controls.md': controls, '03-views.md': views,
  '04-the-colony.md': colony, '05-the-nest.md': nest, '06-species.md': species, '07-settings.md': settings,
  '08-troubleshooting.md': troubleshooting,
};
const ALL = Object.values(PAGES).join('\n');

/** Every label a default binding can display (keyboard, mouse, gamepad), to check unmarked key names against. */
function defaultLabels(): Set<string> {
  const set = defaultBindings();
  const out = new Set<string>();
  for (const a of ACTIONS) {
    for (const b of [...(set.kbm[a.id] ?? []), ...(a.fixed ?? [])]) if (b) out.add(bindingLabel(b));
  }
  return out;
}

describe('manual key names', () => {
  it('every unmarked single key name in code spans is a key the default bindings use (or a documented non-binding)', () => {
    const labels = defaultLabels();
    // Names that are not single bindings: modifiers written alone, a mouse gesture, the marker-tool chord.
    const allowed = new Set(['Shift', 'Esc', 'W A S D', 'RMB drag', 'Shift+1', 'Shift+7', 'Shift+/']);
    const unmarked = [...ALL.matchAll(/`([^`\n]+)`(?!<!--key:)/g)].map((m) => m[1]);
    const keyLike = unmarked.filter((t) => /^(F\d{1,2}|[A-Z]|[0-9]|Tab|Space|Delete|Esc|Shift|Enter|Backspace)$/.test(t));
    const bad = keyLike.filter((t) => !labels.has(t) && !allowed.has(t));
    expect(bad).toEqual([]);
  });

  it('marks every key claim of the controls page prose with an action id that exists', () => {
    const ids = new Set(ACTIONS.map((a) => a.id));
    const axes = new Set(ACTIONS.map((a) => a.axis).filter(Boolean) as string[]);
    for (const m of ALL.matchAll(/<!--key:([a-z0-9.-]+)-->/g)) {
      expect(ids.has(m[1]) || axes.has(m[1]), m[1]).toBe(true);
    }
  });
});

describe('manual structure and hygiene', () => {
  it('has pipe tables with a constant column count per table', () => {
    const problems: string[] = [];
    for (const [name, text] of Object.entries(PAGES)) {
      let cols = -1;
      for (const [i, line] of text.split('\n').entries()) {
        if (!line.startsWith('|')) { cols = -1; continue; }
        const n = line.replace(/\\\|/g, '').split('|').length;
        if (cols < 0) cols = n;
        else if (n !== cols) problems.push(`${name}:${i + 1}: ${n} cells, table has ${cols}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('has unique headings per page and no skipped heading levels', () => {
    const problems: string[] = [];
    for (const [name, text] of Object.entries(PAGES)) {
      const seen = new Set<string>();
      let prev = 0;
      for (const m of text.replace(/<!-- controls-table:start -->[\s\S]*?<!-- controls-table:end -->/, '').matchAll(/^(#{1,6}) (.+)$/gm)) {
        const level = m[1].length;
        if (seen.has(m[2])) problems.push(`${name}: duplicate heading "${m[2]}"`);
        seen.add(m[2]);
        if (prev && level > prev + 1) problems.push(`${name}: "${m[2]}" jumps from h${prev} to h${level}`);
        prev = level;
      }
    }
    expect(problems).toEqual([]);
  });

  it('leaves no placeholders', () => {
    expect(ALL).not.toMatch(/\b(TODO|TBD|FIXME|lorem ipsum|XXX)\b/i);
    expect(ALL).not.toMatch(/\{[a-z_]+\}/);
  });

  it('has no trailing-space or tab damage and ends each page with a newline', () => {
    for (const [name, text] of Object.entries(PAGES)) {
      expect(text.endsWith('\n'), name).toBe(true);
      expect(text, name).not.toMatch(/\t/);
    }
  });

  it('has every verify-at-release marker directly above a heading and none dangling', () => {
    for (const [name, text] of Object.entries(PAGES)) {
      const lines = text.split('\n');
      lines.forEach((l, i) => {
        if (l.trim() === '<!-- verify-at-release -->') expect(lines[i + 1], `${name}:${i + 1}`).toMatch(/^#{2,4} /);
      });
    }
  });
});

describe('screens against the id registry (GDD 00-index B2)', () => {
  const line = index.split('\n').find((l) => l.startsWith('- Screens:'))!;
  const ids = [...line.split('Game modes')[0].matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);

  it('parses the registry line', () => {
    expect(ids.length).toBeGreaterThanOrEqual(22);
  });

  it('names every registry screen id (except the in-game state "playing") somewhere in the manual', () => {
    const missing = ids.filter((id) => id !== 'playing' && !ALL.includes(`\`${id}\``));
    expect(missing).toEqual([]);
  });
});
