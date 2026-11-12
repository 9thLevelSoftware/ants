// Per-attempt state handed from the structures placer to the later exterior placer (same GenContext).

import type { GenContext } from '../../kit';
import type { OutsideMouth } from './micro';
import type { KitchenPlan } from './plan';
import type { Room } from './room';
import type { ShellIds } from './shellPlace';

export interface InteriorState { room: Room; plan: KitchenPlan | null; shell: ShellIds; outsideMouths: OutsideMouth[] }

const states = new WeakMap<GenContext, InteriorState>();

export function setInteriorState(ctx: GenContext, s: InteriorState): void { states.set(ctx, s); }
export function interiorState(ctx: GenContext): InteriorState | undefined { return states.get(ctx); }
