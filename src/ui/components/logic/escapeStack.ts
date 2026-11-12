// Esc / back handling for nested layers (GDD 08 section 8: Esc = back / close). The top-most layer that registered
// a handler gets the press; when nobody is registered the key falls through (the game's own Esc handling, for
// example resuming from the pause menu, then applies).
export type BackHandler = () => void;

interface Entry {
  handler: BackHandler;
  /** Layers of a higher level sit above lower ones whatever order they registered in. */
  level: number;
}

const stack: Entry[] = [];

/** Layer levels: a screen, a dialog over it, a popover or a key capture over that. */
export const BACK_LEVEL = { screen: 0, dialog: 10, popover: 20, capture: 30 } as const;

/**
 * Registers a layer; returns the function that removes it again. Entries are ordered by level, then by
 * registration, so a screen that re-registers after a render never ends up above its own dialog.
 */
export function pushBack(handler: BackHandler, level: number = BACK_LEVEL.screen): () => void {
  const entry: Entry = { handler, level };
  let at = stack.length;
  while (at > 0 && stack[at - 1].level > level) at--;
  stack.splice(at, 0, entry);
  return () => {
    const i = stack.indexOf(entry);
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
  top.handler();
  return true;
}

/** True when a layer above a book screen is open (a dialog, a popover, a key capture): keys belong to that layer. */
export function layerAboveScreen(): boolean {
  const top = stack[stack.length - 1];
  return !!top && top.level > BACK_LEVEL.screen;
}

export function backDepth(): number {
  return stack.length;
}
