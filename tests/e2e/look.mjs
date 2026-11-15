// Look gallery script (look-pass task): ant-height frames of every Tier 1 archetype and a material swatch page,
// rendered by spikes/look-gallery (production world, decor and ant renderers over a real new-game sim).
//
//   node tools/harness/play.mjs --root spikes/look-gallery --query "quality=high&hud=0" --script tests/e2e/look.mjs \
//        --out test-output/look/after --timeout 240000 --script-timeout 3600000
//
// Environment (all optional):
//   LOOK_TAG=after            file-name prefix (before / after)
//   LOOK_ARCH=a,b             archetypes (default: the five Tier 1 ones) and/or "swatch"
//   LOOK_QUALITY=high         quality presets to shoot, in order (the page starts at its ?quality)
//   LOOK_FRAMES=start,plant   frames (default: every frame the world has)
//   LOOK_LIGHTS=golden,...    extra light variants of the start frame (default golden,overcast,night at the first
//                             quality only; "none" to skip)
//   LOOK_SWATCH=row,cell      swatch frames to shoot by id prefix (default all: material rows + finish close-ups)
//   LOOK_BENCH=3              also time each frame: minimum of n synchronous renders (ms; noisy on a shared machine)
//   LOOK_PAIRS=<dir>          after shooting, write before|after pairs (ImageMagick `convert`) for every shot that has
//                             a twin named <BEFORE_TAG>-<same suffix>.png in <dir> (LOOK_BEFORE_TAG, default before)
//                             into <out>/pairs/
// Result: per shot { file, frame, note, onGround, feetGapMm, drawCalls, triangles } and per archetype the load time.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ARCH = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door', 'swatch'];

/** before | after side by side, labelled (ImageMagick). Returns the pair files written. */
function writePairs(shots, tag, beforeDir, beforeTag, outDir) {
  const dir = join(outDir, 'pairs');
  mkdirSync(dir, { recursive: true });
  const done = [];
  for (const s of shots) {
    const suffix = s.file.slice(tag.length + 1);
    const b = join(beforeDir, `${beforeTag}-${suffix}.png`), a = join(outDir, `${s.file}.png`);
    if (!existsSync(b) || !existsSync(a)) continue;
    const out = join(dir, `pair-${suffix}.png`);
    const side = (f, label) => ['(', f, '-resize', '960x540', '-gravity', 'north', '-background', 'black', '-splice', '0x24', '-fill', 'white', '-pointsize', '18', '-annotate', '+0+2', label, ')'];
    execFileSync('convert', [...side(b, beforeTag), ...side(a, tag), '+append', out]);
    done.push(out);
  }
  return done;
}

export default async ({ page, shot, log, out }) => {
  const env = process.env;
  const tag = env.LOOK_TAG ?? 'after';
  const archs = (env.LOOK_ARCH ?? ARCH.join(',')).split(',').filter(Boolean);
  const qualities = (env.LOOK_QUALITY ?? 'high').split(',').filter(Boolean);
  const onlyFrames = env.LOOK_FRAMES ? env.LOOK_FRAMES.split(',') : null;
  const lights = env.LOOK_LIGHTS === 'none' ? [] : (env.LOOK_LIGHTS ?? 'golden,overcast,night').split(',').filter(Boolean);
  const call = (fn, ...args) => page.evaluate(([f, a]) => window.__gallery[f](...a), [fn, args]);
  const shots = [];
  const loads = {};
  for (const [qi, q] of qualities.entries()) {
    const qs = await call('setQuality', q);
    log(`quality ${q}: ${qs.frame.width}x${qs.frame.height}`);
    for (const arch of archs) {
      const info = await call('load', arch);
      loads[arch] = info;
      log(`${arch}: frames ${info.frames.join(',')} (${info.ms} ms, ${info.objects} objects)`);
      for (const fr of await call('frames')) {
        if (onlyFrames && !onlyFrames.includes(fr.id) && arch !== 'swatch') continue;
        if (env.LOOK_SWATCH && arch === 'swatch' && !env.LOOK_SWATCH.split(',').some((p) => fr.id.startsWith(p))) continue;
        // light variants at the first quality: the start frame (golden, overcast, night) and the swatch rows (overcast)
        const extra = arch === 'swatch' ? (fr.id.startsWith('row') ? ['overcast'] : []) : fr.id === 'start' ? lights : [];
        const variants = ['midday', ...(qi === 0 ? extra : [])];
        for (const light of variants) {
          await call('setLight', light);
          const placed = await call('setFrame', fr.id);
          // LOOK_BENCH=n: render the frame n more times (synchronous, GPU-finished) and keep the minimum time
          const st = env.LOOK_BENCH ? await call('bench', Number(env.LOOK_BENCH)) : await call('stats');
          const name = `${tag}-${arch}-${fr.id}${light === 'midday' ? '' : '-' + light}-${q}`;
          const file = await shot(name);
          const rec = {
            file: name, frame: fr.id, light, quality: q, note: placed.note, placed: placed.ok, onGround: placed.subjectOnGround, feetGapMm: placed.feetGapMm,
            drawCalls: st.frame.drawCalls, triangles: st.frame.triangles, ms: st.ms ?? null,
            grit: st.world?.gritGrains ?? null, gritTriangles: st.world?.gritTriangles ?? null,
          };
          shots.push(rec);
          log(`${name}: ${rec.note} ground=${rec.onGround} gap=${rec.feetGapMm} draws=${rec.drawCalls} tris=${rec.triangles}${rec.ms !== null ? ` ms=${rec.ms}` : ''}`);
          if (!file) throw new Error(`no screenshot ${name}`);
        }
      }
    }
  }
  await call('dispose');
  const pairs = env.LOOK_PAIRS ? writePairs(shots, tag, env.LOOK_PAIRS, env.LOOK_BEFORE_TAG ?? 'before', out) : [];
  if (env.LOOK_PAIRS) log(`pairs: ${pairs.length} written to ${join(out, 'pairs')}`);
  return { tag, loads, shots, pairs: pairs.length };
};
