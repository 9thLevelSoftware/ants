// Ecology harvest statuses (sources-core takeFromSource) as action failure codes.

import type { ActionFailReason } from '@/sim/types';
import type { HarvestStatus } from '@/sim/ecology';

const MAP: Record<HarvestStatus, ActionFailReason> = {
  ok: 'conditions', 'no-source': 'no-target', 'out-of-season': 'conditions', empty: 'no-target', crowded: 'blocked',
  'out-of-reach': 'out-of-reach', 'crop-full': 'crop-full', 'hands-full': 'hands-full', 'too-heavy': 'too-heavy',
};

export function harvestFailure(status: HarvestStatus): ActionFailReason {
  return MAP[status];
}
