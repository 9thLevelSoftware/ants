// Esc / back handling for nested layers (GDD 08 section 8: Esc = back / close). The top-most layer that registered
// a handler gets the press; when nobody is registered the key falls through (the game's own Esc handling, for
// example resuming from the pause menu, then applies).
export type BackHandler = () => void;

const stack: BackHandler[] = [];

/** Registers a layer; returns the function that removes it again. */
export function pushBack(handler: BackHandler): () => void {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** True when a layer is registered (the caller should then swallow the key). */
export function hasBackHandler(): boolean {
  return stack.length > 0;
}

/** Calls the top-most handler. Returns whether one existed. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function backDepth(): number {
  return stack.length;
}
