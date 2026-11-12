// Kernel tunables (task F2), re-exported so every tunable is reachable from src/sim/balance. They live next to
// the kernel code (in BU, scaled by the species' body unit); see docs/design/tdd/02-kernel.md.
export { FIELD_TUNING } from '@/sim/world/field';
export { CARVE_TUNING } from '@/sim/nest/carve/params';
export { NAV_TUNING } from '@/sim/nest/nav/params';
export { WALKER_TUNING } from '@/sim/locomotion/walkerParams';
