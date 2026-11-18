// The controls reference is generated from the bindings table (task codex-content, acceptance 3): the generated table
// is compared with the one embedded in docs/MANUAL.md (section 13), and covers every action and axis.
import { describe, expect, it } from 'vitest';
import { ACTIONS, AXES, BUTTON_ACTIONS } from '@/input/actions';
import { defaultBindings } from '@/input/bindings';
import controlsPage from '../../../docs/MANUAL.md?raw';
import { CONTROLS_TABLE_END, CONTROLS_TABLE_START, buildControlsReference, controlsMarkdown, describeBinding, groupOf } from './controls';

function embeddedTable(): string {
  const a = controlsPage.indexOf(CONTROLS_TABLE_START);
  const b = controlsPage.indexOf(CONTROLS_TABLE_END);
  expect(a, 'start marker').toBeGreaterThan(-1);
  expect(b, 'end marker').toBeGreaterThan(a);
  return controlsPage.slice(a + CONTROLS_TABLE_START.length, b).trim();
}

describe('controls reference', () => {
  it('matches the table embedded in the manual (regenerate with controlsMarkdown() if bindings change)', () => {
    expect(embeddedTable()).toBe(controlsMarkdown().trim());
  });

  it('lists every button action and every axis exactly once', () => {
    const rows = buildControlsReference().flatMap((g) => g.rows);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of BUTTON_ACTIONS) expect(ids, a.id).toContain(a.id);
    for (const x of AXES) expect(ids, x.id).toContain(x.id);
    expect(rows.length).toBe(BUTTON_ACTIONS.length + AXES.length);
    // axis components are folded into their axis row and are not rows of their own
    for (const a of ACTIONS.filter((c) => c.axis)) expect(ids).not.toContain(a.id);
  });

  it('writes every action label into the manual', () => {
    const md = controlsMarkdown();
    for (const a of BUTTON_ACTIONS) expect(md, a.id).toContain(`| ${a.label} |`);
    for (const x of AXES) expect(md, x.id).toContain(`| ${x.label} |`);
  });

  it('reports the default bindings the design gives (GDD 01 §5, GDD 08 §5.4)', () => {
    const row = (id: string) => buildControlsReference().flatMap((g) => g.rows).find((r) => r.id === id)!;
    expect(row('move').keyboard).toContain('W A S D');
    expect(row('interact').keyboard).toBe('E');
    expect(row('dig').keyboard).toBe('F');
    expect(row('inspect').keyboard).toBe('T');
    expect(row('release').keyboard).toBe('X');
    expect(row('colony-view').keyboard).toBe('M');
    expect(row('pause-toggle').keyboard).toBe('P or Pause');
    expect(row('speed-8').keyboard).toBe('4');
    expect(row('directives').keyboard).toBe('I');
    expect(row('quick-save').keyboard).toBe('F5');
    expect(row('possess-queen').keyboard).toBe('8');
    expect(row('menu').keyboard).toBe('Esc');
    expect(row('trail-toggle').gamepad).toBe('Dpad up');
  });

  it('groups actions by the contexts in which they are live', () => {
    expect(groupOf(['G'])).toBe('anywhere');
    expect(groupOf(['P', 'O', 'C'])).toBe('views');
    expect(groupOf(['P', 'O'])).toBe('ant-observer');
    expect(groupOf(['P'])).toBe('ant');
    expect(groupOf(['C'])).toBe('colony');
    expect(groupOf(['Ph'])).toBe('photo');
    expect(groupOf(['TL'])).toBe('timelapse');
    expect(groupOf(['UI'])).toBe('menus');
  });

  it('follows rebinding: a changed key changes the table', () => {
    const set = defaultBindings();
    set.kbm.dig = [{ kind: 'key', code: 'KeyV' }, null];
    set.pad.dig = null;
    const row = buildControlsReference(set).flatMap((g) => g.rows).find((r) => r.id === 'dig')!;
    expect(row.keyboard).toBe('V');
    expect(row.gamepad).toBe('none');
    expect(controlsMarkdown(set)).not.toBe(controlsMarkdown());
  });

  it('writes bindings in words: no raw axis numbers', () => {
    expect(controlsMarkdown()).not.toMatch(/Axis \d/);
    expect(describeBinding({ kind: 'padAxis', axis: 3, dir: -1, mod: 4 })).toBe('LB+right stick up');
    expect(describeBinding({ kind: 'key', code: 'KeyW' })).toBe('W');
  });
});
