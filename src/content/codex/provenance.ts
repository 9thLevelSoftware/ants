// Fact provenance of the codex (task codex-content, acceptance criterion 2). Each factual sentence of an entry is
// traceable to a statement in a fact-checked dossier under docs/research. A claim is a verbatim quote of that
// statement; `provenance.test.ts` opens the dossiers and checks that every quote exists and is not marked
// unsupported or estimated. Sentences that rest on the game's own rules, or that are hedged ("is thought to",
// "has not been measured"), are described in `note` instead of `claims`.
import { PROVENANCE_BIO } from './provenanceBio';
import { PROVENANCE_WORLD } from './provenanceWorld';
import type { Provenance } from './provenanceTypes';

export { DOSSIER_FILES } from './provenanceTypes';
export type { Claim, DossierCode, Provenance } from './provenanceTypes';

/** Provenance of every entry that rests on research; entries not listed rest on the game's own rules. */
export const PROVENANCE: Readonly<Record<string, Provenance>> = { ...PROVENANCE_BIO, ...PROVENANCE_WORLD };

/** The citation line of an entry ("" when it rests on the game's own rules). */
export function citationOf(id: string): string {
  return PROVENANCE[id]?.citation ?? '';
}
