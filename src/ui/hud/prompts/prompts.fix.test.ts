import { describe, expect, it } from 'vitest';
import type { FoundingUi } from '../../screens/founding/store';
import { foundingPromptHints, foundingShownHints } from './foundingShown';

const ui = (phase: string, prompts: { action: string; text: string }[], extra: Partial<FoundingUi> = {}): FoundingUi => ({ phase, prompts, ...extra } as unknown as FoundingUi);

describe('what Shift+H dismisses on the opening overlay', () => {
  it('is the hints of its glyph prompts, not its gauges or the time-lapse banner', () => {
    const search = ui('search', [{ action: 'move', text: 'Walk' }, { action: 'inspect', text: 'Antennate the ground' }, { action: 'dig', text: 'Dig' }], { queen: {} as never });
    expect(foundingPromptHints(search).sort()).toEqual(['hint-antennate', 'hint-dig', 'hint-move']);
    expect(foundingShownHints(search)).toContain('hint-reserves'); // tracked as shown, but not a prompt: not dismissed by the key
    expect(foundingPromptHints(search)).not.toContain('hint-reserves');
  });

  it('is empty without an overlay or in the stuck-seal phase\'s "move" line', () => {
    expect(foundingPromptHints(null)).toEqual([]);
    expect(foundingPromptHints(ui('seal', [{ action: 'move', text: 'Move up the shaft, then seal' }]))).toEqual([]);
  });
});
