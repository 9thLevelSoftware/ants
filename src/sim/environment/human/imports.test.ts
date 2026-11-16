import { it, expect } from 'vitest';
import * as env from '@/sim/environment';
import { SYSTEMS } from '@/sim/systems';
// The environment barrel is imported before the sim in places: the human module it now pulls in must not leave a hole
// in the assembled system list (import cycle through progression -> commands -> systems).
it('importing the environment barrel first still assembles every system', () => { expect(env.humanEventsSystem).toBeDefined(); expect(SYSTEMS.every((s) => !!s)).toBe(true); });
