// Luminance and contrast numbers from the real game's canvas (look-pass-2 acceptance 3). Runs IN the page right after
// a frame was rendered (the drawing buffer is still valid in the same task): reads the canvas back through a 2D
// canvas, so no PNG decoder is needed. Luminance = Rec. 709 weights on the sRGB-ENCODED values / 255 (what a viewer
// sees; 0.18 = 18 %). Inputs come from look2-stage.mjs groundPoints(): CSS px positions of terrain samples within 20 body
// lengths of the ant ("points"), terrain samples within a few body widths of it ("ring") and the ant's projected
// centre and size ("subject": x, y, rPx = half the projected body length).
//
//   const m = await page.evaluate(measureInPage, { points, ring, subject })
//   m = { ground: { n, median, p10, p90 }, ant: { n, median, p10, p90 }, ring: { n, median }, contrast, frame: { median } }
//
// contrast = Michelson contrast of the ant disc's median luma against the median luma of the terrain around it;
// separable = share of the ant disc's pixels more than 0.06 luma away from that ground median.

/* eslint-disable no-undef */
export async function measureInPage({ points, ring: ringPoints, subject }) {
  // (everything must live inside this function: it is serialised into the page)
  /** Luma difference (sRGB-encoded, 0..1) from the ground's median beyond which an ant pixel counts as separated from it. */
  const SEP_LUMA = 0.06;
  const c = document.getElementById('view');
  const im = new Image();
  im.src = c.toDataURL('image/png');
  await im.decode();
  const cv = document.createElement('canvas');
  cv.width = im.width; cv.height = im.height;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(im, 0, 0);
  const k = im.width / (c.clientWidth || im.width);
  const data = cx.getImageData(0, 0, im.width, im.height).data;
  const luma = (x, y) => {
    const i = (Math.min(im.height - 1, Math.max(0, Math.round(y * k))) * im.width + Math.min(im.width - 1, Math.max(0, Math.round(x * k)))) * 4;
    return (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  };
  const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const out = { size: [im.width, im.height] };
  // whole-frame median from a coarse grid
  const all = [];
  for (let y = 4; y < im.height; y += 8) for (let x = 4; x < im.width; x += 8) all.push(luma(x / k, y / k));
  out.frame = { median: q(all, 0.5) };
  // ground: terrain samples outside the ant's disc (the stage already dropped them; guarded here as well)
  const near = (p) => subject && Math.hypot(p[0] - subject.x, p[1] - subject.y) <= subject.rPx * 1.15;
  const g = (points || []).filter((p) => !near(p)).map((p) => luma(p[0], p[1]));
  out.ground = { n: g.length, median: q(g, 0.5), p10: q(g, 0.1), p90: q(g, 0.9) };
  if (subject) {
    const inner = [];
    const r = subject.rPx;
    for (let dy = -r; dy <= r; dy += Math.max(0.75, r / 12)) for (let dx = -r; dx <= r; dx += Math.max(0.75, r / 12)) {
      if (Math.hypot(dx, dy) <= r * 0.5) inner.push(luma(subject.x + dx, subject.y + dy));
    }
    const ring = (ringPoints || []).map((p) => luma(p[0], p[1]));
    const am = q(inner, 0.5), rm = q(ring, 0.5);
    out.ant = { n: inner.length, median: am, p90: q(inner, 0.9), p10: q(inner, 0.1) };
    out.ring = { n: ring.length, median: rm };
    out.contrast = am !== null && rm !== null && am + rm > 0 ? Math.abs(rm - am) / (rm + am) : null;
    // share of the ant disc's pixels that differ from the ground's median by more than SEP_LUMA: a dark body with bright
    // glints and a rim separates from the ground even when its MEDIAN luma equals the ground's (noon: median contrast
    // 0.05, yet the ant is plainly there), so the median contrast alone understates (and overstates) separability
    out.separable = rm !== null && inner.length ? inner.filter((v) => Math.abs(v - rm) > SEP_LUMA).length / inner.length : null;
    out.antSpread = out.ant.p90 !== null ? out.ant.p90 - out.ant.p10 : null;
  }
  return out;
}
