// Text templates: `{token}` placeholders filled from a plain object. Pure, no formatting policy beyond substitution
// (numbers are written by the caller with their units, GDD 08 §6.4: numbers always carry units).

export type TextTokens = Readonly<Record<string, string | number>>;

const TOKEN = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** The token names of a template, in order of first appearance. */
export function templateTokens(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(TOKEN)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Fills a template. A token that is not in `tokens` is left as written, so a missing value shows up in review. */
export function formatText(template: string, tokens: TextTokens = {}): string {
  return template.replace(TOKEN, (whole, name: string) => {
    const v = tokens[name];
    return v === undefined ? whole : String(v);
  });
}
