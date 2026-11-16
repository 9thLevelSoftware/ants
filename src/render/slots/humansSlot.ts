// Registry slot 'humans' (wire-stage2): soles, paws, mower, broom, nozzle, cloth, pours and the car's underside of the
// running human events (src/render/world/humans). Parked cars and bait stations are dynamic primitives the world
// renderer draws. Camera tremor is the views layer's (src/game/views/tremorCue.ts reads the sim's `tremor` cues).
import { HumansRenderer } from '@/render/world/humans';

export class HumansSlot extends HumansRenderer {}
