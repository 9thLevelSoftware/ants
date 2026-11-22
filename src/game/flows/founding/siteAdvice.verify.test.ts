// Review of look-pass-4 item 7: the line under a Poor or Fair site read-out names the weakest factor in words and what to
// look for. Words are the read-out's own (src/sim/colony/founding/siteScore.ts FACTOR_WORDS).
import { describe, expect, it } from 'vitest';
import { siteAdvice } from './siteAdvice';

const row = (id: string, value: number, word: string) => ({ id, label: id, value, dots: Math.round(value * 5), word });

describe('siteAdvice (review)', () => {
  it('starts with a capital and ends with a full stop for every factor word the read-out can show', () => {
    const words: Record<string, string[]> = {
      diggability: ['Unbreakable', 'Hard', 'Firm', 'Loose'], moisture: ['Dry', 'Slightly damp', 'Damp', 'Wet', 'Waterlogged'],
      warmth: ['Shaded', 'Mild', 'Warm', 'Sun-baked'], cover: ['Open', 'Leaf-covered', 'Roofed'], exposure: ['Busy', 'Open', 'Sheltered'],
    };
    for (const [id, ws] of Object.entries(words)) for (const w of ws) {
      const s = siteAdvice({ rows: [row(id, 0.1, w)], word: 'poor' });
      expect(s, `${id}/${w}`).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('never tells the player to look for what the weakest factor already says the ground has', () => {
    // Fair ground whose weakest factor is cover at "Leaf-covered" (the middle word): the line must not send the player to leaf litter
    const rows = [row('diggability', 0.9, 'Loose'), row('moisture', 0.9, 'Damp'), row('warmth', 0.8, 'Warm'), row('cover', 0.55, 'Leaf-covered'), row('exposure', 0.9, 'Sheltered')];
    const s = siteAdvice({ rows, word: 'fair' }) ?? '';
    expect(s).toMatch(/^Leaf-covered: /);
    expect(s, s).not.toMatch(/leaf litter/);
  });
});
