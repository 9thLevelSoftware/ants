// Fact-check of the codex (task codex-content, acceptance 2). Every claim of the provenance tables is a verbatim quote
// of a statement in a dossier of docs/research that is not marked unsupported or estimated, and 25 entries chosen
// across the species are fully traceable. The dossiers are read with Vite's ?raw import (no node:fs in this project).
import { describe, expect, it } from 'vitest';
import lasius from '../../../docs/research/bio-lasius-niger.md?raw';
import camponotus from '../../../docs/research/bio-camponotus.md?raw';
import messor from '../../../docs/research/bio-messor.md?raw';
import atta from '../../../docs/research/bio-atta.md?raw';
import ecology from '../../../docs/research/ecology-habitats.md?raw';
import { ALL_CODEX_ENTRIES, getCodexEntry } from './index';
import { PROVENANCE } from './provenance';
import { SAMPLE_25, SAMPLE_25_TRACE, splitSentences } from './sample25';
import type { DossierCode } from './provenance';

const norm = (s: string): string => s.replace(/\s+/g, ' ');
const TEXT: Record<DossierCode, string> = {
  L: norm(lasius), C: norm(camponotus), M: norm(messor), A: norm(atta), E: norm(ecology),
};

/** Tags the dossiers put right after a value they could not source (end of the table cell, or 24 characters). */
const UNSOURCED_TAG = /\[(E|EST|MEM|NF|2ND|U|UNVERIFIED|UNSUPPORTED)\b/;
const MARKED_IN_QUOTE = /ESTIMATE|UNSUPPORTED|UNVERIFIED|\[E\]|\[EST\]|\[MEM\]|\[NF\]/;

describe('provenance claims are verbatim dossier statements', () => {
  it('finds every quote in its dossier and none of them is marked unsupported or estimated', () => {
    const problems: string[] = [];
    let n = 0;
    for (const [id, p] of Object.entries(PROVENANCE)) {
      for (const c of p.claims) {
        n++;
        const q = norm(c.q);
        const at = TEXT[c.d].indexOf(q);
        if (at < 0) { problems.push(`${id}: not found in ${c.d}: ${c.q}`); continue; }
        if (MARKED_IN_QUOTE.test(q) && !c.absence) problems.push(`${id}: quote carries an unsupported marker: ${c.q}`);
        if (!c.absence) {
          let after = TEXT[c.d].slice(at + q.length, at + q.length + 24);
          const bar = after.indexOf('|');
          if (bar >= 0) after = after.slice(0, bar);
          if (UNSOURCED_TAG.test(after)) problems.push(`${id}: ${c.q} is followed by ${JSON.stringify(after)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(n).toBeGreaterThan(300);
  });

  it('only cites ids that have a codex entry', () => {
    for (const id of Object.keys(PROVENANCE)) expect(getCodexEntry(id), id).toBeDefined();
  });

  it('gives every biology entry a citation line and the interface entries none beyond the orders note', () => {
    for (const e of ALL_CODEX_ENTRIES) {
      if (e.category === 'interface' && e.id !== 'cx-interface-orders') {
        expect(PROVENANCE[e.id], e.id).toBeUndefined();
        expect(getCodexEntry(e.id)!.source, e.id).toBe('');
      } else {
        expect(PROVENANCE[e.id], `${e.id} has no provenance`).toBeDefined();
        expect(getCodexEntry(e.id)!.source.length, e.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('fact-check sample of 25 entries (acceptance 2)', () => {
  it('lists 25 distinct entries that exist', () => {
    expect(new Set(SAMPLE_25).size).toBe(25);
    for (const id of SAMPLE_25) expect(getCodexEntry(id), id).toBeDefined();
  });

  it('traces every sentence of each of them to verified dossier statements, or says why it is a hedge', () => {
    const HEDGE = /thought|reported|estimate|assumption|not been measured|not stated|uncertain|may |infer|follows|reference species/i;
    const problems: string[] = [];
    let sentences = 0;
    let traced = 0;
    for (const id of SAMPLE_25) {
      const e = getCodexEntry(id)!;
      const parts = splitSentences(e.body);
      const trace = SAMPLE_25_TRACE[id];
      if (parts.length !== trace.length) { problems.push(`${id}: ${parts.length} sentences, trace has ${trace.length}`); continue; }
      const claims = PROVENANCE[id]?.claims ?? [];
      parts.forEach((sentence, i) => {
        sentences++;
        const t = trace[i];
        if (typeof t === 'string') {
          if (t.length < 10) problems.push(`${id} s${i}: reason too short`);
          else if (!HEDGE.test(sentence) && !/^framing/.test(t)) problems.push(`${id} s${i}: not a hedge: ${sentence}`);
        } else {
          if (t.length === 0) problems.push(`${id} s${i}: empty trace`);
          for (const k of t) {
            if (!claims[k]) problems.push(`${id} s${i}: claim ${k} does not exist`);
            else traced++;
          }
        }
      });
    }
    expect(problems).toEqual([]);
    expect(sentences).toBeGreaterThanOrEqual(110);
    expect(traced).toBeGreaterThanOrEqual(sentences * 0.8);
  });

  it('keeps the values the fact-check corrected out of the notes', () => {
    // Lasius dossier corrections and unsupported claims (verification log) must not reappear.
    expect(getCodexEntry('cx-species-lasius-niger')!.body).not.toMatch(/400-500|20 percent of|29 years/);
    expect(getCodexEntry('cx-nanitics')!.body).toMatch(/1\.08/);
    expect(getCodexEntry('cx-cofounding')!.body).not.toMatch(/Metarhizium|1\.5 percent/);
    expect(getCodexEntry('cx-fungus-pellet')!.body).not.toMatch(/99\.95/);
    expect(getCodexEntry('cx-hybridogenesis')!.body).toMatch(/13\.4 percent/);
    expect(getCodexEntry('cx-trunk-trail')!.body).not.toMatch(/55 m/);
  });
});
