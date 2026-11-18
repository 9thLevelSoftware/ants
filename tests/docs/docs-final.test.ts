// Checks the written documents against the code they describe (task docs-final-fix):
//  - docs/MANUAL.md section 13 is the output of controlsMarkdown() (the bindings in src/input/actions.ts);
//  - the preset table and the custom-rules table of docs/MANUAL.md section 1.6 are the data of the New Game screen
//    (src/sim/config/presetDisplay.ts), with every row that nothing reads marked "not in effect";
//  - every setting named in docs/MANUAL.md section 12 exists in the settings schema;
//  - docs/design/gdd/DEVIATIONS.md has R1 to R28, and every file and symbol it points to exists.
// If one of these fails after a change to the game, update the document (or regenerate the table), not the test.
import { describe, expect, it } from 'vitest';
import { controlsMarkdown } from '@/content/text/controls';
import { presetCard, RULE_DISPLAY, UNWIRED_PARAMS } from '@/sim/config/presetDisplay';
import { presetRuleValues } from '@/sim/balance';
import manual from '../../docs/MANUAL.md?raw';
import deviations from '../../docs/design/gdd/DEVIATIONS.md?raw';
import schemaSource from '../../src/game/settings/schema.ts?raw';
import modelSource from '../../src/game/settings/model.ts?raw';

const section = (text: string, from: string, to: string): string => {
  const a = text.indexOf(from), b = text.indexOf(to, a + from.length);
  expect(a, `section start ${from}`).toBeGreaterThan(-1);
  expect(b, `section end ${to}`).toBeGreaterThan(a);
  return text.slice(a, b);
};
const cells = (line: string): string[] => line.split('|').slice(1, -1).map((c) => c.trim());

describe('MANUAL.md controls tables (section 13)', () => {
  it('contain the generated controls reference verbatim', () => {
    expect(manual.includes(controlsMarkdown().trimEnd())).toBe(true);
  });
});

describe('MANUAL.md difficulty tables (section 1.6)', () => {
  const s16 = section(manual, '### 1.6 Difficulty and rules', '### 1.7 Loading');
  const lines = s16.split('\n');
  const ids = ['gentle', 'naturalist', 'harsh'] as const;
  const cards = ids.map((id) => presetCard(id));

  it('has one row per preset parameter, in order, with the screen text and the not-in-effect mark', () => {
    cards[0].rows.forEach((row, j) => {
      const unwired = !row.inEffect;
      const want = `| ${row.group} | ${row.label}${unwired ? ' **(not in effect)**' : ''} | ${cards.map((c) => c.rows[j].value).join(' | ')} |`;
      expect(lines, row.label).toContain(want);
    });
    const groupRows = lines.filter((l) => /^\| (Founding|Weather and climate|Threats, rivals, humans|Food|Colony|Progression|Time and interface) \|/.test(l));
    expect(groupRows.length).toBe(cards[0].rows.length);
  });

  it('marks every parameter that UNWIRED_PARAMS lists', () => {
    expect(UNWIRED_PARAMS.length).toBeGreaterThan(0);
    const marked = lines.filter((l) => l.includes('**(not in effect)**')).length;
    expect(marked).toBeGreaterThanOrEqual(UNWIRED_PARAMS.length);
  });

  it('has one row per custom rule with its choices, preset values and effect flag', () => {
    const show = (v: unknown): string => (typeof v === 'boolean' ? (v ? 'on' : 'off') : v === 'timelapse' ? 'time-lapse' : String(v));
    for (const rule of RULE_DISPLAY) {
      const row = lines.filter((l) => l.startsWith('| ')).find((l) => new RegExp('\\(`' + rule.key + '`[,)]').test(cells(l)[0] ?? ''));
      expect(row, rule.key).toBeDefined();
      const c = cells(row!);
      expect(c[1], `${rule.key} choices`).toBe(rule.choices.map((x) => x.label).join(', '));
      ids.forEach((id, i) => {
        const v = rule.key === 'seasonLengthDays' ? 7 : rule.key === 'startSeason' ? 'Natural' : presetRuleValues(id)[rule.key as keyof ReturnType<typeof presetRuleValues>];
        expect(c[2 + i], `${rule.key} ${id}`).toBe(show(v));
      });
      expect(c[6], `${rule.key} in effect`).toBe(rule.inEffect ? 'yes' : '**no**');
    }
  });
});

describe('MANUAL.md settings (section 12)', () => {
  const s12 = section(manual, '## 12. Settings and accessibility', '## 13. Keyboard, mouse and gamepad');
  const schemaText = schemaSource + modelSource;

  it('names only settings that exist in the schema', () => {
    const names = new Set<string>();
    for (const m of s12.matchAll(/`([A-Za-z][A-Za-z0-9.]*)`/g)) names.add(m[1]);
    names.delete('test'); // a quality value, not a setting
    expect(names.size).toBeGreaterThan(20);
    for (const name of names) {
      const leaf = name.split('.').pop()!;
      expect(new RegExp(`\\b${leaf}\\b`).test(schemaText), name).toBe(true);
    }
  });
});

describe('DEVIATIONS.md', () => {
  const sources = import.meta.glob('/{src,tools}/**/*.{ts,tsx,css,mjs,sh}', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
  const rows = deviations.split('\n').filter((l) => /^\| [RD]\d+ \|/.test(l));

  it('has every integrator ruling R1 to R28 exactly once in table A', () => {
    const ids = rows.map((l) => cells(l)[0]);
    for (let i = 1; i <= 28; i++) expect(ids.filter((x) => x === `R${i}`).length, `R${i}`).toBe(1);
  });

  it('has D1 to D28 exactly once in table B', () => {
    const ids = rows.map((l) => cells(l)[0]);
    for (let i = 1; i <= 28; i++) expect(ids.filter((x) => x === `D${i}`).length, `D${i}`).toBe(1);
  });

  it('points only to files that exist and symbols that appear in them', async () => {
    let checked = 0;
    for (const row of rows) {
      const id = cells(row)[0];
      for (const cell of cells(row)) {
        for (const part of cell.split('<br>')) {
          const m = part.trim().match(/^`([^`]+\.(?:ts|tsx|mjs|sh|css))`(?:\s+`([^`]+)`)?/);
          if (!m) continue;
          const loader = sources['/' + m[1]];
          expect(loader, `${id}: file ${m[1]}`).toBeDefined();
          // vitest turns CSS into empty text, even with ?raw: for a .css file only its existence can be checked here
          if (m[2] && !m[1].endsWith('.css')) expect((await loader()).includes(m[2]), `${id}: ${m[2]} in ${m[1]}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
