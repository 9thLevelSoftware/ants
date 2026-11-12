// Locomotion tunables (task loco), re-exported so every tunable is reachable from src/sim/balance. They live next
// to the locomotion code (src/sim/locomotion/params.ts, BU-scaled per world), like the kernel's (balance/kernel.ts).
export { LOCO_TUNING, MATERIAL_GRIP, PLAYER_MOVE_OK_ACTIONS } from '@/sim/locomotion/params';
export { NAV_GRID_TUNING } from '@/sim/locomotion/grid/gridData';
