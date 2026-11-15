// The player manual (task codex-content, acceptance 3): it covers every screen and control, matches the default
// bindings, follows the wording rules, and marks the sections that describe features not yet present.
import { describe, expect, it } from 'vitest';
import { BUTTON_ACTIONS, AXES } from '@/input/actions';
import { defaultBindings } from '@/input/bindings';
import readme from '../../docs/manual/README.md?raw';
import gettingStarted from '../../docs/manual/01-getting-started.md?raw';
import controls from '../../docs/manual/02-controls.md?raw';
import views from '../../docs/manual/03-views.md?raw';
import colony from '../../docs/manual/04-the-colony.md?raw';
import nest from '../../docs/manual/05-the-nest.md?raw';
import species from '../../docs/manual/06-species.md?raw';
import settings from '../../docs/manual/07-settings.md?raw';
import troubleshooting from '../../docs/manual/08-troubleshooting.md?raw';
import { wordingProblems } from './codex/banned';
import { buildControlsReference } from './text/controls';

const PAGES: Record<string, string> = {
  'README.md': readme, '01-getting-started.md': gettingStarted, '02-controls.md': controls, '03-views.md': views,
  '04-the-colony.md': colony, '05-the-nest.md': nest, '06-species.md': species, '07-settings.md': settings,
  '08-troubleshooting.md': troubleshooting,
};
const ALL = Object.values(PAGES).join('\n');
const MARK = '<!-- verify-at-release -->';

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
  it('has the sections the task names', () => {
    expect(readme).toContain('# FOUNDRESS player manual');
    expect(gettingStarted).toMatch(/^# Getting started/m);
    expect(controls).toMatch(/^# Controls/m);
    expect(views).toMatch(/^# Views and screens/m);
    expect(colony).toMatch(/^# The colony/m);
    expect(nest).toMatch(/^# The nest/m);
    expect(species).toMatch(/^# Species/m);
    expect(settings).toMatch(/^# Settings/m);
    expect(troubleshooting).toMatch(/^# Troubleshooting/m);
    for (const name of Object.keys(PAGES).slice(1)) expect(readme, name).toContain(`(${name})`);
  });

  it('covers every screen of the design', () => {
    for (const id of SCREEN_IDS) expect(views, id).toContain(`\`${id}\``);
  });

  it('covers every screen with a row in the screens table', () => {
    const rows = views.split('\n').filter((l) => /^\| .* \| `[a-z-]+` \|/.test(l));
    expect(rows.length).toBe(SCREEN_IDS.length);
  });
});

describe('manual and bindings', () => {
  it('lists every action and axis of the bindings table (through the embedded generated table)', () => {
    const rows = buildControlsReference().flatMap((g) => g.rows);
    expect(rows.length).toBe(BUTTON_ACTIONS.length + AXES.length);
    for (const r of rows) expect(controls, r.id).toContain(`| ${r.label} |`);
  });

  it('writes every key marker of the prose as the default binding of that action', () => {
    const set = defaultBindings();
    const rows = new Map(buildControlsReference(set).flatMap((g) => g.rows).map((r) => [r.id, r]));
    const found = [...ALL.matchAll(/`([^`]+)`<!--key:([a-z0-9.-]+)-->/g)];
    expect(found.length).toBeGreaterThan(60);
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
      expect(controls, id).toContain(`<!--key:${id}-->`);
    }
  });
});

describe('verify-at-release markers', () => {
  it('sit on the line above a heading', () => {
    let count = 0;
    for (const [name, text] of Object.entries(PAGES)) {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (line.trim() !== MARK) return;
        count++;
        expect(lines[i + 1] ?? '', `${name}:${i + 1}`).toMatch(/^#{1,6} /);
      });
    }
    expect(count).toBeGreaterThanOrEqual(10);
  });

  it('mark the sections that describe features not yet in the code', () => {
    // Features checked absent or placeholder in the code when the manual was written (see the report).
    const mustBeMarked: [string, string][] = [
      ['01-getting-started.md', '### Lineage and Codex'], ['01-getting-started.md', '## The opening'],
      ['03-views.md', '### The minimap'], ['03-views.md', '### Overlays and scent view'], ['03-views.md', '## Photo mode'],
      ['03-views.md', '### First brood and winter'], ['04-the-colony.md', '## The colony health view'],
      ['04-the-colony.md', '## The journal'], ['04-the-colony.md', '## Overwintering'],
      ['04-the-colony.md', '## People, predators and rivals'], ['04-the-colony.md', '### Winged ants and the nuptial flight'],
      ['05-the-nest.md', '## Water, heat and collapse'], ['05-the-nest.md', '## The nest overview'],
      ['06-species.md', '## Black carpenter ant (*Camponotus pennsylvanicus*)'], ['06-species.md', '## European harvester ant (*Messor barbarus*)'],
      ['06-species.md', '## Texas leafcutter ant (*Atta texana*)'], ['07-settings.md', '### Display and text'],
      ['07-settings.md', '### Spiders and overlays'], ['07-settings.md', '### Auto-slow and difficulty'], ['02-controls.md', '### Gamepad'],
    ];
    for (const [name, heading] of mustBeMarked) {
      const lines = PAGES[name].split('\n');
      const at = lines.findIndex((l) => l.trim() === heading);
      expect(at, `${name}: ${heading}`).toBeGreaterThan(0);
      expect(lines[at - 1].trim(), `${name}: ${heading} is marked`).toBe(MARK);
    }
  });
});

describe('manual wording', () => {
  it('has no avoided words, jokes, exclamation marks or first-person plural', () => {
    for (const [name, text] of Object.entries(PAGES)) {
      const problems = wordingProblems(prose(text), ['orders without a commander']).filter((p) => p.rule !== 'speech');
      expect(problems, name).toEqual([]);
    }
  });

  it('has working internal links', () => {
    for (const [name, text] of Object.entries(PAGES)) {
      for (const m of text.matchAll(/\]\((\d\d-[a-z-]+\.md)\)/g)) expect(Object.keys(PAGES), `${name} -> ${m[1]}`).toContain(m[1]);
    }
  });
});
