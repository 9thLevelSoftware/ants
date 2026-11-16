// Reviewer tests (onboarding verify): the opening overlay bridge must hide only LESSONS that are learned, never an
// instruction the player needs right now. Prompt lists are the ones src/game/flows/founding/flowView.ts builds.
import { describe, expect, it } from 'vitest';
import { defaultBindings } from '@/input';
import type { HintId } from '@/sim/types';
import type { FoundingUi } from '../../screens/founding/store';
import { promptVisibility } from './foundingGate';
import { foundingShownHints } from './foundingShown';
import { keyCapText } from './keys';

const ui = (phase: string, prompts: { action: string; text: string }[], extra: Partial<FoundingUi> = {}): FoundingUi => ({ phase, prompts, ...extra } as unknown as FoundingUi);
/** A returning player: everything taught before the seal is learned. */
const learnedBeforeSeal = new Set<HintId>(['hint-move', 'hint-look', 'hint-antennate', 'hint-dig', 'hint-readiness', 'hint-reserves']);
const allows = (id: HintId) => !learnedBeforeSeal.has(id);

describe('the opening overlay bridge keeps instructions that are not the walk lesson', () => {
  it('a queen stuck while sealing still sees "Move up the shaft, then seal" after hint-move was learned', () => {
    // flowView.ts, phase seal, seal.state 'stuck'
    const stuck = ui('seal', [{ action: 'move', text: 'Move up the shaft, then seal' }, { action: 'interact', text: 'Seal the entrance' }]);
    expect(promptVisibility(stuck, allows)).toEqual([true, true]);
  });

  it('the stuck-seal "move" line is not tracked as a showing of the walk hint', () => {
    const stuck = ui('seal', [{ action: 'move', text: 'Move up the shaft, then seal' }, { action: 'interact', text: 'Seal the entrance' }]);
    expect(foundingShownHints(stuck)).not.toContain('hint-move');
  });

  it('the seal status lines (climbing, sealing) stay while the seal lesson is not learned', () => {
    const walking = ui('seal', [{ action: 'interact', text: 'Climbing to the throat to seal it' }]);
    expect(promptVisibility(walking, allows)).toEqual([true]);
  });
});

describe('key caps for unusual bindings', () => {
  it('a hint whose action has only its second slot bound still shows that key', () => {
    const set = structuredClone(defaultBindings());
    set.kbm['scent-view'] = [null, { kind: 'key', code: 'KeyB' }];
    expect(keyCapText(set, 'scent-view')).toBe('B');
  });

  it('a movement axis with one direction unbound still names the other three keys', () => {
    const set = structuredClone(defaultBindings());
    set.kbm['move.left'] = [null, null];
    expect(keyCapText(set, 'move')).toBe('W S D');
  });
});
