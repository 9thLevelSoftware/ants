// Review finding (int-1B-app, possession framing): the rig's zoom started from its own hard-coded table (open 5 L,
// crevice 1.2 L), so the retuned defaults in possessionStates.ts (open 3.6 L, crevice 1.8 L) never took effect.
import { describe, expect, it } from 'vitest';
import { STATE_PARAMS } from './possessionStates';
import { ThirdPersonRig } from './thirdPersonRig';

describe('possession camera zoom defaults', () => {
  it('every state starts at the default distance of the state table', () => {
    const r = new ThirdPersonRig({ bu: 4, bodyL: 1 }) as unknown as { zoomL: Record<string, number> };
    for (const [state, p] of Object.entries(STATE_PARAMS)) expect(r.zoomL[state], state).toBe(p.dist[0]);
  });
});
