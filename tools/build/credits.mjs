// CREDITS.md of the portable build: the asset credits (public/assets/CREDITS.md, unchanged) followed by the licence
// texts of the software and fonts that end up in the bundle.
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_ASSETS, ROOT, SOFTWARE_LICENCES } from './config.mjs';

export function buildCredits() {
  const parts = [fs.readFileSync(path.join(PUBLIC_ASSETS, 'CREDITS.md'), 'utf8').trimEnd(), '',
    '# Software and fonts', '',
    'The game bundle includes the following open-source software and fonts. Licence texts as shipped with each package.', ''];
  for (const s of SOFTWARE_LICENCES) {
    const file = path.join(ROOT, 'node_modules', s.file);
    if (!fs.existsSync(file)) throw new Error(`licence file missing: ${s.file} (run npm install)`);
    parts.push(`## ${s.name} (${s.licence})`, '', '```text', fs.readFileSync(file, 'utf8').trimEnd(), '```', '');
  }
  return parts.join('\n');
}
