// Contact sheets of the look-pass-2 pictures (ImageMagick `convert`): one sheet per light and quality, the views
// side by side, "before" on the top row and "after" below it. Run after tests/e2e/look2.mjs for both tags:
//   node tests/e2e/lib/look2-sheets.mjs test-output/look2/p2 test-output/look2 [quality=high] [views=surface,nest,observer,slice]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [root = 'test-output/look2/p2', outDir = 'test-output/look2', quality = 'high', viewsArg = 'surface,nest,observer,slice,edge'] = process.argv.slice(2);
const views = viewsArg.split(',');
const lights = ['night', 'night-rain', 'dusk', 'noon', 'overcast'];
const W = 480, H = 270;
mkdirSync(outDir, { recursive: true });
const tile = (file, label) => ['(', file, '-resize', `${W}x${H}!`, '-gravity', 'north', '-background', '#202020', '-splice', '0x20', '-fill', 'white', '-pointsize', '14', '-annotate', '+0+2', label, ')'];
for (const light of lights) {
  const rows = [];
  for (const tag of ['before', 'after']) {
    const files = views.map((v) => ({ v, f: join(root, tag, `${tag}-${light}-${v}-${quality}.png`) })).filter((x) => existsSync(x.f));
    if (!files.length) continue;
    const args = files.flatMap((x) => tile(x.f, `${tag} ${light} ${x.v} ${quality}`));
    const row = join(outDir, `.row-${tag}-${light}-${quality}.png`);
    execFileSync('convert', [...args, '+append', row]);
    rows.push(row);
  }
  if (!rows.length) continue;
  const out = join(outDir, `sheet-${light}-${quality}.png`);
  execFileSync('convert', [...rows, '-append', out]);
  console.log(out);
}
