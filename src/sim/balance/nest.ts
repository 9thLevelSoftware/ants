// Nest defaults (GDD 03). Owners add the rest (src/sim/balance/nest*.ts) as the nest modules land.

import type { PlanPriority } from '@/sim/types';

/** Slot-seeking weight per plan priority (GDD 03 §7). */
export const PLAN_PRIORITY_WEIGHT: Record<PlanPriority, number> = { low: 1, normal: 2, high: 4, urgent: 8 };
