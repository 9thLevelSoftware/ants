// The reduced-motion camera crossfade (GDD 08 2.4 and 7.10): a still of the last frame laid over the live picture and faded out, so the player sees one
// image blend into the next, not a dip to dark. The still is a 2D canvas on top of the game canvas; it is copied from the game canvas right after each
// render while reduced motion is on (a WebGL canvas can only be read in the task that drew it), and is not touched while it is showing.

export class CrossfadeVeil {
  private readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private visible = false;
  private captured = false;

  constructor(private readonly source: HTMLCanvasElement) {
    this.el = source.ownerDocument.createElement('canvas');
    this.ctx = this.el.getContext('2d');
    const st = this.el.style;
    st.position = 'fixed'; st.inset = '0'; st.width = '100vw'; st.height = '100vh'; st.pointerEvents = 'none'; st.display = 'none';
    this.el.setAttribute('aria-hidden', 'true');
    source.insertAdjacentElement('afterend', this.el);
  }

  /** True while the still is on screen (the next frames must not overwrite it). */
  get showing(): boolean { return this.visible; }

  /** Copies the game canvas as it was just rendered. Call right after a render, in the same task. */
  capture(): void {
    const s = this.source;
    if (this.visible || !this.ctx || s.width === 0 || s.height === 0) return;
    if (this.el.width !== s.width || this.el.height !== s.height) { this.el.width = s.width; this.el.height = s.height; }
    this.ctx.drawImage(s, 0, 0);
    this.captured = true;
  }

  /** Lays the still over the picture at `opacity` (0 hides it). Without a captured still nothing is shown. */
  setOpacity(opacity: number): void {
    const on = this.captured && opacity > 0.001;
    if (on) this.el.style.opacity = String(Math.min(1, opacity));
    if (on !== this.visible) { this.visible = on; this.el.style.display = on ? 'block' : 'none'; }
  }

  /** Hides the still and forgets it (the game ended, the view changed for good). */
  reset(): void {
    this.captured = false;
    this.setOpacity(0);
  }
}
