// Arrow-key movement inside a group of focusable items (roving tabindex): segmented controls, tabs, radio card
// lists, menus. Pure: takes the item count, the current index and the key, returns the index to move to.
export type Orientation = 'horizontal' | 'vertical' | 'both';

export interface GroupNavOptions {
  orientation: Orientation;
  /** Wrap around at the ends (default true). */
  wrap?: boolean;
  /** Items that cannot take focus (hidden / not selectable). */
  skip?: (index: number) => boolean;
}

/** Index to move to for `key`, or null when the key is not a navigation key for this orientation. */
export function groupNext(count: number, current: number, key: string, o: GroupNavOptions): number | null {
  if (count <= 0) return null;
  const wrap = o.wrap ?? true;
  let dir = 0;
  const h = o.orientation !== 'vertical', v = o.orientation !== 'horizontal';
  if ((h && key === 'ArrowRight') || (v && key === 'ArrowDown')) dir = 1;
  else if ((h && key === 'ArrowLeft') || (v && key === 'ArrowUp')) dir = -1;
  else if (key === 'Home') return firstEnabled(count, o.skip);
  else if (key === 'End') return lastEnabled(count, o.skip);
  else return null;
  let i = current;
  for (let n = 0; n < count; n++) {
    i += dir;
    if (i < 0 || i >= count) {
      if (!wrap) return current;
      i = (i + count) % count;
    }
    if (!o.skip?.(i)) return i;
  }
  return current;
}

function firstEnabled(count: number, skip?: (i: number) => boolean): number | null {
  for (let i = 0; i < count; i++) if (!skip?.(i)) return i;
  return null;
}

function lastEnabled(count: number, skip?: (i: number) => boolean): number | null {
  for (let i = count - 1; i >= 0; i--) if (!skip?.(i)) return i;
  return null;
}

/** Tab-key cycling for a focus trap: index of the element to focus next given the current one (-1 = outside). */
export function trapIndex(count: number, current: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}
