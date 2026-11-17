// gate-close-app seam: the winter notice (GDD 06 §6.2) gets a journal entry of its own (kind `event`).
// Cross-edit logged in test-output/gate-close/cross-edits.md; the wording is in src/content/text/journal.ts.
import { describe, expect, it } from 'vitest';
import { journalEntryText } from '@/content/text/journalText';
import { makeProgSim, pollOnce } from './testkit';

describe('winter notice journal entry', () => {
  it('overwinter.notice writes event.winter-notice, and it has words', () => {
    const sim = makeProgSim({ workers: 4 });
    sim.emit({ type: 'overwinter.notice' });
    pollOnce(sim);
    const e = sim.state.progression.journal.entries.find((x) => x.key === 'event.winter-notice');
    expect(e?.kind).toBe('event');
    expect(journalEntryText('event.winter-notice')?.title).toBe('Winter is near');
  });
});
