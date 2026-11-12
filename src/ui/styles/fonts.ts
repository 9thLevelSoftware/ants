// Bundled fonts (GDD 08 2.2): Source Serif 4 (headings), Inter (UI), Atkinson Hyperlegible (optional face) and
// JetBrains Mono (keys, seed codes), all SIL OFL, `latin` + `latin-ext` only. Every file is imported with `?inline`
// so it becomes a base64 data URI inside the bundle: no font request is ever made, which is what the portable
// (sandboxed, opaque-origin) build needs. font-display: swap, so the UI is usable before the fonts are decoded.
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline';
import interLatinExt from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?inline';
import serifLatin from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?inline';
import serifLatinExt from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-ext-wght-normal.woff2?inline';
import serifItalicLatin from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-italic.woff2?inline';
import serifItalicLatinExt from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-ext-wght-italic.woff2?inline';
import atkinson400 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?inline';
import atkinson700 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2?inline';
import atkinson400Ext from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-ext-400-normal.woff2?inline';
import atkinson700Ext from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-ext-700-normal.woff2?inline';
import monoLatin from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?inline';
import monoLatinExt from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-500-normal.woff2?inline';

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF';

interface Face {
  family: string;
  style: 'normal' | 'italic';
  weight: string;
  url: string;
  range: string;
  variable: boolean;
}

const FACES: Face[] = [
  { family: 'Inter Variable', style: 'normal', weight: '100 900', url: interLatinExt, range: LATIN_EXT, variable: true },
  { family: 'Inter Variable', style: 'normal', weight: '100 900', url: interLatin, range: LATIN, variable: true },
  { family: 'Source Serif 4 Variable', style: 'normal', weight: '200 900', url: serifLatinExt, range: LATIN_EXT, variable: true },
  { family: 'Source Serif 4 Variable', style: 'normal', weight: '200 900', url: serifLatin, range: LATIN, variable: true },
  { family: 'Source Serif 4 Variable', style: 'italic', weight: '200 900', url: serifItalicLatinExt, range: LATIN_EXT, variable: true },
  { family: 'Source Serif 4 Variable', style: 'italic', weight: '200 900', url: serifItalicLatin, range: LATIN, variable: true },
  { family: 'Atkinson Hyperlegible', style: 'normal', weight: '400', url: atkinson400Ext, range: LATIN_EXT, variable: false },
  { family: 'Atkinson Hyperlegible', style: 'normal', weight: '400', url: atkinson400, range: LATIN, variable: false },
  { family: 'Atkinson Hyperlegible', style: 'normal', weight: '700', url: atkinson700Ext, range: LATIN_EXT, variable: false },
  { family: 'Atkinson Hyperlegible', style: 'normal', weight: '700', url: atkinson700, range: LATIN, variable: false },
  { family: 'JetBrains Mono', style: 'normal', weight: '500', url: monoLatinExt, range: LATIN_EXT, variable: false },
  { family: 'JetBrains Mono', style: 'normal', weight: '500', url: monoLatin, range: LATIN, variable: false },
];

/** All @font-face rules with the font files embedded as data URIs. */
export function fontFaceCss(): string {
  return FACES.map((f) => `@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-display: swap;
  font-weight: ${f.weight};
  src: url(${f.url}) format('${f.variable ? 'woff2-variations' : 'woff2'}');
  unicode-range: ${f.range};
}`).join('\n');
}
