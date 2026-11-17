// Species behaviours of the wood-nesting module: the `nurse` behaviour with the shuttle trip (shuttle.ts).

import type { Behaviour } from '@/sim/types';
import { woodNurseBehaviour } from './shuttle';

export const woodBehaviours: Behaviour[] = [woodNurseBehaviour];
