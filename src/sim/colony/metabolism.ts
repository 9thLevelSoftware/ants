// Metabolic class of an ant from its behaviour state (GDD 02 §1.4). Behaviour states are `<task>.<state>`.

import type { Ant, MetabolicClass } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { MET_MOVING_BU_S } from '@/sim/balance';

// Imported bindings are accessor reads under Vite's SSR module runner (tests, headless tools); the hot per-entity
// steps below read these module-local copies instead.
const _AntFlag = AntFlag;
const _MET_MOVING_BU_S = MET_MOVING_BU_S;

/** Waiting, queueing and resting states. */
const REST_STATES = new Set([
  'idle', 'rest', 'forage.wait', 'forage.queue', 'tend.wait', 'store.post', 'flee.freeze',
]);

/** Nest work while standing or moving slowly; states missing here and from REST_STATES are active. */
const LIGHT_STATES = new Set([
  'nurse.select', 'nurse.load', 'nurse.feed', 'nurse.tend', 'nurse.assist', 'nurse.cannibalise', 'nurse.groom',
  'queen-care.attend', 'queen-care.load', 'queen-care.feed', 'queen-care.collect-eggs',
  'store.receive', 'store.disperse', 'guard.post', 'guard.alarm-raise', 'scout.assess', 'scout.report',
  'forage.collect', 'forage.deliver', 'tend.solicit', 'tend.guard-herd', 'tend.guard', 'tend.deliver',
  'queen.found-care', 'queen.reside',
]);

/** Metabolic class of the ant now. Possessed ants (and unknown states) are classed by movement. */
export function metabolicClass(a: Ant, buMm: number): MetabolicClass {
  if ((a.flags & _AntFlag.POSSESSED) === 0) {
    if (REST_STATES.has(a.state)) return 'met-rest';
    if (LIGHT_STATES.has(a.state)) return 'met-light';
    if (a.state.includes('.')) return 'met-active';
  }
  if (a.carry.kind !== 'none') return 'met-active';
  return a.speed > _MET_MOVING_BU_S * buMm ? 'met-active' : a.task === 'idle' || a.task === 'rest' ? 'met-rest' : 'met-light';
}
