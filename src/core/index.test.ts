import { describe, expect, it } from 'vitest';
import * as core from '@/core';
import { v3Add } from '@/core/math/vec3';

describe('core barrel and @/ alias', () => {
  it('resolves @/core in Vitest and re-exports every module (deep imports are the same functions)', () => {
    expect(core.v3Add).toBe(v3Add);
    for (const name of ['clamp', 'quatSlerp', 'fbm2', 'sdRoundBox', 'rngFork', 'EventBus', 'HashGrid3', 'grid2dSample', 'Store', 'tsPush', 'assert', 'createLogger', 'encode', 'FOUNDRESS_VERSION']) {
      expect(core, name).toHaveProperty(name);
    }
  });

  it('runs in a plain Node environment (no DOM)', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });
});
