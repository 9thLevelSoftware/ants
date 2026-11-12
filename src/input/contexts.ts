// Input context stack and the overlap rule used by conflict detection.
import type { InputContext } from './types';

/** Play views: the global layer `G` is live on top of these. */
const PLAY_VIEWS: readonly InputContext[] = ['P', 'O', 'C'];

/** Contexts that are live when `top` is the top of the stack. */
export function liveContexts(top: InputContext): InputContext[] {
  if (top === 'G') return ['G'];
  return PLAY_VIEWS.includes(top) ? ['G', top] : [top];
}

/**
 * Do two contexts share any moment where both are live? (A binding conflicts only with actions whose contexts
 * overlap, GDD 01 5.7.) P, O, C, Ph, TL and UI are mutually exclusive; G overlaps the play views P, O, C
 * (see the decision note in actions.ts).
 */
export function contextsOverlap(a: InputContext, b: InputContext): boolean {
  if (a === b) return true;
  if (a === 'G') return PLAY_VIEWS.includes(b);
  if (b === 'G') return PLAY_VIEWS.includes(a);
  return false;
}

export function anyContextsOverlap(a: readonly InputContext[], b: readonly InputContext[]): boolean {
  for (const x of a) for (const y of b) if (contextsOverlap(x, y)) return true;
  return false;
}

/**
 * A stack of contexts: the game pushes UI over a view, swaps views, etc. Only the top is live (plus G over play
 * views). An empty stack means nothing is live (title screen with no game: the UI pushes 'UI').
 */
export class ContextStack {
  private stack: InputContext[] = [];
  private version = 0;

  /** Replace the whole stack (e.g. on view change: setBase('O')). */
  setBase(ctx: InputContext): void {
    this.stack = [ctx];
    this.version++;
  }

  push(ctx: InputContext): void {
    this.stack.push(ctx);
    this.version++;
  }

  /** Pops the top if it equals `ctx` (or unconditionally when omitted). Returns the popped context. */
  pop(ctx?: InputContext): InputContext | undefined {
    const top = this.stack[this.stack.length - 1];
    if (top === undefined || (ctx !== undefined && top !== ctx)) return undefined;
    this.stack.pop();
    this.version++;
    return top;
  }

  top(): InputContext | undefined {
    return this.stack[this.stack.length - 1];
  }

  live(): InputContext[] {
    const t = this.top();
    return t === undefined ? [] : liveContexts(t);
  }

  isLive(contexts: readonly InputContext[]): boolean {
    const live = this.live();
    for (const c of contexts) if (live.includes(c)) return true;
    return false;
  }

  /** Changes whenever the stack changes (cheap cache key). */
  get revision(): number {
    return this.version;
  }

  toArray(): InputContext[] {
    return [...this.stack];
  }
}
