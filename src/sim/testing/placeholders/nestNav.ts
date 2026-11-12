// Placeholder NestNav: no distance fields (everything unreachable). Replaced by src/sim/nest/nav (F2-kernel).

import type { NestNav } from '@/sim/types';

export function createPlaceholderNestNav(): NestNav {
  return {
    distance: () => -1,
    descend: () => false,
    onCarve: () => {},
    rebuild: () => {},
  };
}
