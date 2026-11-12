// One input, one consumer. Some bindings are shared on purpose (Shift+wheel is the colony slice and also the
// active tool's size / radius, GDD 08 §4.3): the views layer, which runs first in a frame, claims what it used, and
// the camera rig that runs after it skips claimed input. Claims live for one frame: the ViewDirector releases them
// at the end of its update.
export type InputClaim = 'shift-wheel';

const claims = new WeakMap<object, Set<InputClaim>>();

export function claimInput(input: object, what: InputClaim): void {
  let set = claims.get(input);
  if (!set) { set = new Set(); claims.set(input, set); }
  set.add(what);
}

export function isClaimed(input: object, what: InputClaim): boolean {
  return claims.get(input)?.has(what) ?? false;
}

/** End of the frame: nothing stays claimed into the next one. */
export function releaseClaims(input: object): void {
  claims.get(input)?.clear();
}
