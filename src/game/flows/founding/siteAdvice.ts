// The line under the site read-out when the ground is Poor or Fair: it names the weakest factor in words and says what to look for
// (GDD 06 §5.7 words, GDD 08 §9.3 "one-word labels"; look pass 4: the card used to say "Poor" and nothing else). Pure text.
import type { FoundingUi } from '@/ui/screens/founding/store';

/** What to look for, by factor id and the factor's own word. A word with no entry falls back to the factor's `any` line. */
const ADVICE: Record<string, { any: string; byWord?: Record<string, string> }> = {
  diggability: { any: 'look for looser soil', byWord: { Unbreakable: 'look for bare soil, not stone or paving', Hard: 'look for looser soil' } },
  moisture: { any: 'look for ground that is damp, not soaked', byWord: { Dry: 'look for damper ground, in shade or by plants', 'Slightly damp': 'look for damper ground', Wet: 'look for drier ground', Waterlogged: 'look for drier, higher ground' } },
  warmth: { any: 'look for open, sun-warmed soil', byWord: { Shaded: 'look for open, sun-warmed soil', Mild: 'look for a sunnier spot', 'Sun-baked': 'look for some shade' } },
  cover: { any: 'look for a stone, a log or leaf litter overhead', byWord: { Open: 'look under a stone, a log or leaf litter' } },
  floodSafety: { any: 'look for higher ground', byWord: { 'Low-lying': 'look for higher ground, water pools here', Sloped: 'look for higher, flatter ground' } },
  rivalScent: { any: 'look further from the other colony', byWord: { Strong: 'another colony is close: look elsewhere', Faint: 'another colony is near: look further away' } },
  exposure: { any: 'look for a quieter corner', byWord: { Busy: 'people walk here: look for a quieter corner', Open: 'look for a more sheltered corner' } },
};

/** The factor with the fewest dots (the first of equals, in the card's order). */
export function weakestRow(rows: readonly { id: string; dots: number; value: number }[]): { id: string; dots: number; value: number } | null {
  let worst: { id: string; dots: number; value: number } | null = null;
  for (const r of rows) if (!worst || r.value < worst.value) worst = r;
  return worst;
}

/** "Shaded: look for open, sun-warmed soil." for a Poor or Fair read-out, null for Good and Excellent ground or no reading yet. */
export function siteAdvice(site: Pick<NonNullable<FoundingUi['site']>, 'rows' | 'word'>): string | null {
  if (site.word !== 'poor' && site.word !== 'fair') return null;
  const w = weakestRow(site.rows);
  const full = w ? site.rows.find((r) => r.id === w.id) : null;
  if (!w || !full) return null;
  const a = ADVICE[w.id];
  if (!a) return null;
  const word = (full as { word?: string }).word ?? '';
  return `${word}: ${a.byWord?.[word] ?? a.any}.`.replace(/^: /, '');
}
