// Types and helpers of the provenance tables (see provenance.ts).

/** The dossiers: L bio-lasius-niger, C bio-camponotus, M bio-messor, A bio-atta, E ecology-habitats. */
export type DossierCode = 'L' | 'C' | 'M' | 'A' | 'E';

export const DOSSIER_FILES: Record<DossierCode, string> = {
  L: 'bio-lasius-niger.md', C: 'bio-camponotus.md', M: 'bio-messor.md', A: 'bio-atta.md', E: 'ecology-habitats.md',
};

export interface Claim {
  /** Which dossier the quote is in. */
  d: DossierCode;
  /** Verbatim text of the dossier (whitespace-insensitive). */
  q: string;
  /** `absence`: the dossier says the value was searched for and not found (the tag window check is skipped). */
  absence?: boolean;
}

export interface Provenance {
  /** Short citation shown as the source line (GDD 08 §7.3), e.g. "Hart et al. 2018, Ecography". */
  citation: string;
  claims: readonly Claim[];
  /** What is hedged or rests on the game's own rules, in words (not machine-checked). */
  note?: string;
}

export const L = (q: string): Claim => ({ d: 'L', q });
export const C = (q: string): Claim => ({ d: 'C', q });
export const M = (q: string): Claim => ({ d: 'M', q });
export const A = (q: string): Claim => ({ d: 'A', q });
export const E = (q: string): Claim => ({ d: 'E', q });
/** A claim that a value was searched for and not found (any dossier). */
export const absent = (d: DossierCode, q: string): Claim => ({ d, q, absence: true });
