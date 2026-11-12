import { describe, expect, it } from 'vitest';
import creditsMd from '../../../../public/assets/CREDITS.md?raw';
import { parseCredits, plain, SOFTWARE_CREDITS } from './parse';

describe('credits parsing', () => {
  it('strips inline markdown', () => {
    expect(plain('`a/b` **bold** *it* [x](http://y)')).toBe('a/b bold it x (http://y)');
  });

  it('parses a small document into sections and rows', () => {
    const md = '# T\n\nIntro line.\n\n## Src (2 source pages)\n\nLicence: CC0.\n\n| Work | Author | Source | Used for |\n|---|---|---|---|\n| A | B | http://c | `d` |\n| E | F | http://g | `h` |\n\n## Notes\n\n- one\n- two\n';
    const p = parseCredits(md);
    expect(p.title).toBe('T');
    expect(p.intro).toEqual(['Intro line.']);
    expect(p.sections.map((s) => s.title)).toEqual(['Src (2 source pages)', 'Notes']);
    expect(p.sections[0].notes).toEqual(['Licence: CC0.']);
    expect(p.sections[0].rows).toEqual([{ work: 'A', author: 'B', source: 'http://c', usedFor: 'd' }, { work: 'E', author: 'F', source: 'http://g', usedFor: 'h' }]);
    expect(p.sections[1].notes).toEqual(['one', 'two']);
  });

  it('reads the real public/assets/CREDITS.md: every source group has rows with a source page', () => {
    const p = parseCredits(creditsMd);
    expect(p.title.toLowerCase()).toContain('credits');
    const groups = p.sections.filter((s) => s.rows.length > 0);
    expect(groups.map((g) => g.title.split(' (')[0])).toEqual(['Poly Haven', 'ambientCG', 'OpenGameArt', 'archive.org']);
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    expect(total).toBeGreaterThan(30);
    for (const g of groups) for (const r of g.rows) { expect(r.work.length).toBeGreaterThan(0); expect(r.source).toMatch(/^https?:\/\//); }
    expect(p.sections.find((s) => s.title === 'Notes')?.notes.length).toBeGreaterThan(0);
  });

  it('lists the bundled fonts and libraries with their licences', () => {
    const names = SOFTWARE_CREDITS.map((s) => s.name);
    for (const n of ['Source Serif 4', 'Inter', 'Atkinson Hyperlegible', 'JetBrains Mono']) expect(names).toContain(n);
    expect(SOFTWARE_CREDITS.filter((s) => s.licence.includes('Open Font Licence')).length).toBe(4);
  });
});
