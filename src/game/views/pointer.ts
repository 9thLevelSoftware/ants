// Where the cursor is over the game canvas (CSS px from the canvas's top-left). The input layer reports buttons and
// drags but not the absolute cursor position, which picking needs; this small tracker listens to pointer moves on the
// canvas itself. Scripts (the debug API) can place the cursor directly.

export class CursorTracker {
  x = 0;
  y = 0;
  /** The cursor is over the canvas. */
  inside = false;
  private detachFn: (() => void) | null = null;

  /** Starts listening on the canvas (browser only; a no-op without addEventListener). */
  attach(canvas: HTMLCanvasElement): void {
    this.detach();
    if (typeof canvas.addEventListener !== 'function') return;
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.x = e.clientX - r.left;
      this.y = e.clientY - r.top;
      this.inside = this.x >= 0 && this.y >= 0 && this.x <= r.width && this.y <= r.height;
    };
    const leave = () => { this.inside = false; };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', move);
    canvas.addEventListener('pointerleave', leave);
    this.detachFn = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', move);
      canvas.removeEventListener('pointerleave', leave);
    };
  }

  /** Scripted cursor (debug API); null = off the canvas. */
  set(p: { x: number; y: number } | null): void {
    if (!p) { this.inside = false; return; }
    this.x = p.x; this.y = p.y; this.inside = true;
  }

  detach(): void {
    this.detachFn?.();
    this.detachFn = null;
  }
}
