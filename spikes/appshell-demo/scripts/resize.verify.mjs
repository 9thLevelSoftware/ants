// Review check (F3a): the drawing-buffer size must not drift when the canvas has no CSS size (display:none,
// detached, zero-size iframe). renderApp.resize() falls back to canvas.width, which it set itself on the previous
// frame, so with resolutionScale != 1 (low = 0.85) or a pixel ratio != 1 the size compounds every frame.
// node tools/harness/play.mjs --root spikes/appshell-demo --query "test=1&quality=low&t=2" \
//   --script spikes/appshell-demo/scripts/resize.verify.mjs --out test-output/review-f3a/resize
export default async ({ page, log }) => {
  const widths = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const out = [c.width];
    c.style.display = 'none';
    for (let i = 0; i < 6; i++) { window.__demo.renderFrame(); out.push(c.width); }
    c.style.display = '';
    window.__demo.renderFrame();
    out.push(c.width);
    return out;
  });
  log(JSON.stringify(widths));
  await page.evaluate(() => window.__demo.dispose());
  const hidden = widths.slice(1, 7);
  if (new Set(hidden).size > 1) throw new Error(`drawing buffer drifts while the canvas is hidden: ${widths.join(' -> ')}`);
  return { widths };
};
