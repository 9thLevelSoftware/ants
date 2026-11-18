// Writes the generated tables of docs/MANUAL.md from the code the game reads (task app-seams-2, item 8):
//   npm run sim -- tests/docs/regen-manual.ts
// Species (1.3), the preset and rule tables (1.6) and the controls (13) sit between `<!-- generated:NAME:start -->` and
// `<!-- generated:NAME:end -->` comments (the controls between their own `controls-table` markers). Prose around them is
// written by hand. tests/docs/docs-final.test.ts and src/content/text/controls.test.ts check the result.
import { readFileSync, writeFileSync } from 'node:fs';
import { controlsMarkdown, CONTROLS_TABLE_END, CONTROLS_TABLE_START } from '@/content/text/controls';
import { presetCard, RULE_DISPLAY } from '@/sim/config/presetDisplay';
import { presetRuleValues } from '@/sim/balance';
import { ruleOnScreen } from '@/ui/screens/newgame/presetRows';
import { SPECIES_CARDS, foundingSeasonOf, isSpeciesAvailable } from '@/ui/screens/newgame/species';

const PATH = 'docs/MANUAL.md';

function replaceBlock(text: string, start: string, end: string, body: string): string {
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error(`markers not found: ${start}`);
  return `${text.slice(0, a + start.length)}\n${body.trimEnd()}\n${text.slice(b)}`;
}
const block = (name: string) => [`<!-- generated:${name}:start -->`, `<!-- generated:${name}:end -->`] as const;

function speciesTable(): string {
  const rows = ['| Species | Common name | Playable now | Natural start season | The card says |', '|---|---|---|---|---|'];
  for (const c of SPECIES_CARDS) {
    const ok = isSpeciesAvailable(c.id);
    rows.push(`| *${c.binomial}* (\`${c.id}\`) | ${c.commonName} | ${ok ? 'yes' : 'no: "Not yet available"'} | ${foundingSeasonOf(c.id)} | ${c.playstyle} Founding: ${c.founding}. |`);
  }
  return rows.join('\n');
}

const IDS = ['gentle', 'naturalist', 'harsh'] as const;

function presetTable(): string {
  const cards = IDS.map((id) => presetCard(id));
  const rows = ['| Group | Parameter | Gentle | Naturalist | Harsh |', '|---|---|---|---|---|'];
  cards[0].rows.forEach((r, i) => rows.push(`| ${r.group} | ${r.label}${r.inEffect ? '' : ' **(not in effect)**'} | ${cards.map((c) => c.rows[i].value).join(' | ')} |`));
  return rows.join('\n');
}

function ruleTable(): string {
  const show = (v: unknown): string => (typeof v === 'boolean' ? (v ? 'on' : 'off') : v === 'timelapse' ? 'time-lapse' : String(v));
  const rows = ['| Rule | Choices | Gentle | Naturalist | Harsh | New Game screen | In effect |', '|---|---|---|---|---|---|---|'];
  for (const r of RULE_DISPLAY) {
    const vals = IDS.map((id) => (r.key === 'seasonLengthDays' ? 7 : r.key === 'startSeason' ? 'Natural' : presetRuleValues(id)[r.key as keyof ReturnType<typeof presetRuleValues>]));
    const kind = ruleOnScreen(r.key);
    const screen = kind === 'greyed' ? 'greyed: "Not in this build"' : kind === 'none' ? 'not on screen' : r.key === 'startSeason' ? 'on screen (Starting season, in the Locality column)' : 'on screen';
    rows.push(`| ${r.label} (\`${r.key}\`${r.fixedAtGeneration ? ', fixed at world generation' : ''}) | ${r.choices.map((c) => c.label).join(', ')} | ${vals.map(show).join(' | ')} | ${screen} | ${r.inEffect ? 'yes' : '**no**'} |`);
  }
  return rows.join('\n');
}

export default async function regen(): Promise<void> {
  let t = readFileSync(PATH, 'utf8');
  t = replaceBlock(t, ...block('species'), speciesTable());
  t = replaceBlock(t, ...block('presets'), presetTable());
  t = replaceBlock(t, ...block('rules'), ruleTable());
  t = replaceBlock(t, CONTROLS_TABLE_START, CONTROLS_TABLE_END, controlsMarkdown());
  writeFileSync(PATH, t);
  console.log('docs/MANUAL.md regenerated');
}
