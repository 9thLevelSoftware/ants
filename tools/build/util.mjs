// Small helpers shared by the build and the verification.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function sha8(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

export function formatBytes(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kB`;
  return `${n} B`;
}

/** Every file under a directory, as paths relative to it (forward slashes), sorted. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

export function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
