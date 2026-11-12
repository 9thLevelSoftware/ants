// Parses public/assets/CREDITS.md into the structure the Credits screen lists (GDD 08 3.3: "Scrollable list
// generated from CREDITS.md + fonts and libraries"). The markdown is the source of truth; nothing is retyped.
export interface CreditRow {
  work: string;
  author: string;
  source: string;
  usedFor: string;
}

export interface CreditSection {
  title: string;
  /** Licence paragraph(s) under the heading. */
  notes: string[];
  rows: CreditRow[];
}

export interface ParsedCredits {
  title: string;
  intro: string[];
  sections: CreditSection[];
}

/** Drops the markdown that has no meaning in plain text (code ticks, bold, italics, link syntax). */
export function plain(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => plain(c));
}

const isRule = (line: string) => /^\|?\s*:?-{3,}/.test(line.trim());

export function parseCredits(md: string): ParsedCredits {
  const lines = md.split(/\r?\n/);
  const out: ParsedCredits = { title: '', intro: [], sections: [] };
  let cur: CreditSection | null = null;
  let inTable = false;
  let headerSeen = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('# ')) { out.title = plain(line.slice(2)); continue; }
    if (line.startsWith('## ')) {
      cur = { title: plain(line.slice(3)), notes: [], rows: [] };
      out.sections.push(cur);
      inTable = false; headerSeen = false;
      continue;
    }
    if (line.trim() === '') { inTable = false; headerSeen = false; continue; }
    if (line.trim().startsWith('|')) {
      if (!cur) continue;
      if (!inTable) { inTable = true; headerSeen = false; }
      if (isRule(line)) { headerSeen = true; continue; }
      if (!headerSeen) continue; // the header row itself
      const c = cells(line);
      if (c.length >= 4) cur.rows.push({ work: c[0], author: c[1], source: c[2], usedFor: c[3] });
      continue;
    }
    const text = plain(line.replace(/^-\s+/, ''));
    if (cur) cur.notes.push(text);
    else out.intro.push(text);
  }
  return out;
}

/** Fonts and libraries that ship with the game (GDD 08 2.2; package licences). */
export const SOFTWARE_CREDITS: readonly { name: string; role: string; licence: string }[] = [
  { name: 'Source Serif 4', role: 'Headings (via @fontsource-variable/source-serif-4)', licence: 'SIL Open Font Licence 1.1' },
  { name: 'Inter', role: 'Interface text (via @fontsource-variable/inter)', licence: 'SIL Open Font Licence 1.1' },
  { name: 'Atkinson Hyperlegible', role: 'Optional legibility face (via @fontsource/atkinson-hyperlegible)', licence: 'SIL Open Font Licence 1.1' },
  { name: 'JetBrains Mono', role: 'Keys and seed codes (via @fontsource/jetbrains-mono)', licence: 'SIL Open Font Licence 1.1' },
  { name: 'three.js', role: '3D rendering', licence: 'MIT' },
  { name: 'postprocessing', role: 'Depth of field, bloom and anti-aliasing', licence: 'Zlib' },
  { name: 'Preact and Preact Signals', role: 'Interface', licence: 'MIT' },
  { name: 'fflate', role: 'Save compression', licence: 'MIT' },
];
