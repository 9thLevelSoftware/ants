// Text templates: `{token}` placeholders filled from a plain object. Pure, no formatting policy beyond substitution
// (numbers are written by the caller with their units, GDD 08 §6.4: numbers always carry units).
//
// A count that is followed by a noun is written `{n:ant|ants}`: it prints the number, a space, and the singular form
// when the value is exactly 1, otherwise the plural form ("1 ant", "3 ants", "0 ants", "0.5 game days"). The form may
// hold the rest of a clause, so the verb agrees too: `Only {n:ant remains|ants remain}`.

export type TextTokens = Readonly<Record<string, string | number>>;

const TOKEN = /\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^{}|]*)\|([^{}]*))?\}/g;

/** The token names of a template, in order of first appearance. */
export function templateTokens(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(TOKEN)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Fills a template. A token that is not in `tokens` is left as written, so a missing value shows up in review. */
export function formatText(template: string, tokens: TextTokens = {}): string {
  return template.replace(TOKEN, (whole, name: string, one: string | undefined, many: string | undefined) => {
    const v = tokens[name];
    if (v === undefined) return whole;
    if (one === undefined) return String(v);
    return `${String(v)} ${Number(v) === 1 ? one : many}`;
  });
}
