// Luminance and contrast numbers from the real game's canvas (look-pass-2 acceptance 3). Runs IN the page right after
// a frame was rendered (the drawing buffer is still valid in the same task): reads the canvas back through a 2D
// canvas, so no PNG decoder is needed. Luminance = Rec. 709 weights on the sRGB-ENCODED values / 255 (what a viewer
// sees; 0.18 = 18 %). Inputs are CSS px positions of terrain samples within 20 body lengths of the ant (look2.mjs) and
// the ant's projected centre and size.
//
//   const m = await page.evaluate(measureInPage, { points, subject })
//   m = { ground: { n, median, p10, p90 }, ant: { median, p90 }, ring: { median }, contrast, frame: { median } }

/* eslint-disable no-undef */
export async function measureInPage({ points, subject }) {
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
  const near = (p) => subject && Math.hypot(p[0] - subject.x, p[1] - subject.y) < subject.rPx * 1.2;
  const g = (points || []).filter((p) => !near(p)).map((p) => luma(p[0], p[1]));
  out.ground = { n: g.length, median: q(g, 0.5), p10: q(g, 0.1), p90: q(g, 0.9) };
  if (subject) {
    const inner = [], ring = [];
    const r = subject.rPx;
    for (let dy = -r * 1.7; dy <= r * 1.7; dy += 1.5) for (let dx = -r * 1.7; dx <= r * 1.7; dx += 1.5) {
      const d = Math.hypot(dx, dy), x = subject.x + dx, y = subject.y + dy;
      if (x < 0 || y < 0 || x >= c.clientWidth || y >= c.clientHeight) continue;
      if (d <= r * 0.55) inner.push(luma(x, y)); else if (d >= r * 1.2 && d <= r * 1.7) ring.push(luma(x, y));
    }
    const am = q(inner, 0.5), rm = q(ring, 0.5);
    out.ant = { median: am, p90: q(inner, 0.9), p10: q(inner, 0.1) };
    out.ring = { median: rm };
    // contrast of the ant region against the ground around it (Michelson on luma) and the spread inside the ant
    out.contrast = am !== null && rm !== null && am + rm > 0 ? Math.abs(rm - am) / (rm + am) : null;
    out.antSpread = out.ant.p90 !== null ? out.ant.p90 - out.ant.p10 : null;
  }
  return out;
}
