// The player manual (docs/MANUAL.md, the only manual): it covers every screen and control, matches the default
// bindings and follows the wording rules. The generated tables are checked by tests/docs/docs-final.test.ts.
import { describe, expect, it } from 'vitest';
import { BUTTON_ACTIONS, AXES } from '@/input/actions';
import { defaultBindings } from '@/input/bindings';
import manual from '../../docs/MANUAL.md?raw';
import { wordingProblems } from './codex/banned';
import { buildControlsReference } from './text/controls';

const ALL = manual;

/** Every screen id of the design (GDD 01 §1.1, GDD 08 §3.1; registry B2). */
const SCREEN_IDS = [
  'boot', 'unsupported', 'title', 'new-game', 'load', 'lineage', 'settings', 'codex', 'loading', 'credits', 'hud', 'pause',
  'directives', 'markers', 'colony-health', 'roster', 'nest', 'journal', 'save-load', 'photo', 'timelapse-founding',
  'timelapse-winter', 'epitaph',
];

/** Text without code spans and HTML comments, for the wording check (key names such as `I` are not first person). */
function prose(text: string): string {
  const noTable = text.replace(/<!-- controls-table:start -->[\s\S]*?<!-- controls-table:end -->/, ' ');
  return noTable.replace(/<!--[\s\S]*?-->/g, ' ').replace(/`[^`]*`/g, ' ');
}

describe('manual structure', () => {
  it('is one file with the numbered sections', () => {
    expect(manual).toMatch(/^# FOUNDRESS player's manual/m);
    for (let i = 0; i <= 20; i++) expect(manual, `section ${i}`).toMatch(new RegExp(`^## ${i}\\. `, 'm'));
  });

  it('covers every screen of the design with a row in the screens table', () => {
    const table = manual.slice(manual.indexOf('| Screen | Id | What it is |'), manual.indexOf('Drawers open on the right'));
    const rows = table.split('\n').filter((l) => /^\| .* \| `[a-z-]+` \|/.test(l));
    expect(rows.length).toBe(SCREEN_IDS.length);
    for (const id of SCREEN_IDS) expect(table, id).toContain(`\`${id}\``);
  });
});

describe('manual and bindings', () => {
  it('lists every action and axis of the bindings table (through the embedded generated table)', () => {
    const rows = buildControlsReference().flatMap((g) => g.rows);
    expect(rows.length).toBe(BUTTON_ACTIONS.length + AXES.length);
    for (const r of rows) expect(manual, r.id).toContain(`| ${r.label} |`);
  });

  it('writes every key marker of the prose as the default binding of that action', () => {
    const set = defaultBindings();
    const rows = new Map(buildControlsReference(set).flatMap((g) => g.rows).map((r) => [r.id, r]));
    const found = [...ALL.matchAll(/`([^`]+)`<!--key:([a-z0-9.-]+)-->/g)];
    expect(found.length).toBeGreaterThan(40);
    const bad: string[] = [];
    for (const m of found) {
      const [, key, id] = m;
      const row = rows.get(id);
      if (!row) { bad.push(`${id}: no such action or axis`); continue; }
      const labels = row.keyboard.split(/ or |; |, | /).filter(Boolean);
      const ok = key.includes(' ') ? row.keyboard.includes(key) : labels.includes(key);
      if (!ok) bad.push(`${id}: manual says ${key}, bindings say ${row.keyboard}`);
    }
    expect(bad).toEqual([]);
  });

  it('names the keys of the essentials table', () => {
    for (const id of ['move', 'interact', 'dig', 'inspect', 'release', 'colony-view', 'directives', 'pause-toggle', 'menu']) {
      expect(manual, id).toContain(`<!--key:${id}-->`);
    }
  });
});

describe('manual wording', () => {
  it('has no avoided words, jokes, exclamation marks or first-person plural', () => {
    const problems = wordingProblems(prose(manual), ['orders without a commander']).filter((p) => p.rule !== 'speech');
    expect(problems).toEqual([]);
  });
});
