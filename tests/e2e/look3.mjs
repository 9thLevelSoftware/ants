// Look pass 3 (task look-pass-3): the same shots before and after each fix, from the REAL game (staging of
// tests/e2e/lib/look2-stage.mjs: founding cheat, 7 workers by the entrance, possession on the surface or in the nest).
//
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=high" --script tests/e2e/look3.mjs \
//        --out test-output/look3/after --timeout 300000 --script-timeout 7200000
//
// Environment:
//   LOOK3_TAG=after                 file-name prefix (before / after)
//   LOOK3_SHOTS=night:surface:high,...   list of light:view:quality (default: the 'night' set)
//   LOOK3_SET=night|ants|...        a named list (see SETS), used when LOOK3_SHOTS is not given
//   LOOK3_ARCH / LOOK3_SEED         start a game of that archetype first (default: the page's autostart game, seed 1)
//   LOOK3_VARIANTS=file.json        [{ "name": "v1", "eval": "const c = await import('/src/render/world/lighting/constants.ts'); c.NIGHT_LOOK.targetE = 1.6;" }, ...]
//                                   every shot is taken once per variant (file name <tag>-<name>-<light>-<view>-<quality>); the eval runs
//                                   in the page before the variant's shots, so a look can be tuned on one staged game (modules are the
//                                   live ones: the dev server hands out one instance per file). Each variant must set every value it
//                                   touches (nothing is reset between variants).
// light: night | night-overcast | night-rain | dusk | dawn | noon | overcast | rain
// view:  tunnel | crowd (look pass 6: the possessed worker in the shaft of the entrance / in the founding chamber with eight workers round her) | mound (ant height 7 BU from the entrance mound, looking at its foot) | queenstart (the queen at the start point, looking out: the opening shot) |
//        slopeup | slopedown (the possessed worker on the steepest flank near the entrance, walking uphill / downhill) |
//        close (surface; the plate is the 400 x 225 px around the ant) | surface | nest | observerlow | observer | gyne (a gyne and a male beside the possessed worker) | slice | edge
// Every picture is a plate (UI hidden); luminance numbers (look2-measure) are logged per shot and written to <tag>-shots.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { measureInPage } from './lib/look2-measure.mjs';
import { stage, at, SUMMER_DAY } from './lib/look2-stage.mjs';

const LIGHTS = {
  night: { hour: 23.5, weather: 'clear' },
  'night-overcast': { hour: 23.5, weather: 'overcast' },
  'night-rain': { hour: 22.5, weather: 'rain' },
  dusk: { hour: 20.1, weather: 'clear' },
  dawn: { hour: 3.9, weather: 'clear' },
  noon: { hour: 12.5, weather: 'clear' },
  overcast: { hour: 13.5, weather: 'overcast' },
  rain: { hour: 13.5, weather: 'rain' },
};
const SETS = {
  night: ['night', 'night-overcast', 'night-rain', 'dusk', 'dawn'].flatMap((l) => [`${l}:surface:high`, `${l}:observerlow:high`]),
  ants: ['night', 'night-rain', 'noon'].flatMap((l) => ['test', 'low', 'medium', 'high'].map((q) => `${l}:surface:${q}`))
    .concat(['test', 'low', 'high'].map((q) => `noon:nest:${q}`), ['night', 'dusk'].map((l) => `${l}:gyne:high`)),
};

export default async ({ page, log, out: outDir }) => {
  const env = process.env;
  const tag = env.LOOK3_TAG ?? 'after';
  const list = (env.LOOK3_SHOTS ?? (SETS[env.LOOK3_SET ?? 'night'] ?? []).join(',')).split(',').filter(Boolean);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const plate = async (name, clip = null) => {
    const file = `${outDir}/${name}.png`;
    const h = await page.addStyleTag({ content: '#ui, #ui *{visibility:hidden !important}' });
    await page.screenshot({ path: file, timeout: 300000, ...(clip ? { clip } : {}) });
    await h.evaluate((el) => el.remove());
    return file;
  };
  const S = await stage(page, log, { arch: env.LOOK3_ARCH || null, seed: Number(env.LOOK3_SEED ?? 1) });
  const { render, statsNow, surfaceWorker, nestWorker, tunnelWorker, crowdWorker, observerAt, sliceAt, edgeAt, groundPoints, bu } = S;
  const shots = [];
  const variants = env.LOOK3_VARIANTS ? JSON.parse(readFileSync(env.LOOK3_VARIANTS, 'utf8')) : [{ name: '', eval: '' }];
  let curQ = null, curL = null;
  for (const variant of variants) {
  if (variant.eval) await page.evaluate(async (src) => { await new (Object.getPrototypeOf(async function () {}).constructor)(src)(); }, variant.eval);
  const vtag = variant.name ? `${tag}-${variant.name}` : tag;
  for (const spec of list) {
    const [lname, view, q = 'high'] = spec.split(':');
    // look pass 6: 'h22-rain', 'h2.5-clear': any hour of the summer day, any weather
    const hm = /^h(\d+(?:\.\d+)?)-(clear|overcast|rain)$/.exec(lname);
    const L = LIGHTS[lname] ?? (hm ? { hour: Number(hm[1]), weather: hm[2] } : undefined);
    if (!L) throw new Error(`look3: unknown light ${lname}`);
    if (q !== curQ) {
      const qs = await g((id) => window.__game.quality(id), q);
      if (!qs.ok) throw new Error(`look3: quality ${q} ${JSON.stringify(qs)}`);
      curQ = q; curL = null;
    }
    if (curL !== lname) {
      await g((t) => window.__game.cheat.setTime(t), at(SUMMER_DAY, L.hour));
      await g((w) => window.__game.cheat.setWeather(w), L.weather);
      curL = lname;
    }
    if (view === 'surface' || view === 'gyne' || view === 'close') {
      await surfaceWorker('surface');
      if (view === 'gyne') {
        await g(({ bu }) => {
          const p = window.__game.summary().possessed;
          const f = p.fwd, side = [f[2], 0, -f[0]];
          for (const [i, caste] of ['gyne', 'male'].entries()) {
            const d = 5 * bu, o = (i ? 1 : -1) * 2.2 * bu;
            const x = p.pos[0] + f[0] * d + side[0] * o, z = p.pos[2] + f[2] * d + side[2] * o;
            window.__game.cheat.spawnAnts(1, caste, null, { x, y: window.__game.query.field(x, 0, z).height + 0.5 * bu, z });
          }
          window.__game.step(3);
        }, { bu });
      }
    } else if (view === 'slopeup' || view === 'slopedown') {
      await surfaceWorker('surface');
      const r = await g(async ({ bu, up }) => {
        const gm = window.__game, E = gm.query.nest().find((n) => n.colony === gm.summary().colony?.id)?.entrances?.[0]?.pos ?? gm.query.world().queenStart.pos;
        const h = (x, z) => gm.query.field(x, 0, z).height;
        let best = null;
        for (let rr = 2; rr <= 16; rr += 1) for (let a = 0; a < 24; a++) {
          const x = E.x + Math.cos((a / 24) * 2 * Math.PI) * rr * bu, z = E.z + Math.sin((a / 24) * 2 * Math.PI) * rr * bu, e = 0.5 * bu;
          const gx = (h(x + e, z) - h(x - e, z)) / (2 * e), gz = (h(x, z + e) - h(x, z - e)) / (2 * e), m = Math.hypot(gx, gz);
          if (!best || m > best.m) best = { x, z, m, gx: gx / m, gz: gz / m };
        }
        const sgn = up ? 1 : -1, d = { x: sgn * best.gx, y: 0, z: sgn * best.gz };
        gm.teleport('possessed', { x: best.x - d.x * 3 * bu, y: h(best.x, best.z) + 1.5 * bu, z: best.z - d.z * 3 * bu });
        gm.step(3);
        gm.setIntent({ dir: d }); gm.step(6); gm.setIntent({}); gm.step(3);
        return { slopeDeg: Math.round((Math.atan(best.m) * 180) / Math.PI), at: [best.x, best.z] };
      }, { bu, up: view === 'slopeup' });
      log('slope', view, JSON.stringify(r));
    } else if (view === 'mound') {
      await g(() => window.__game.release());
      await g(() => window.__game.camera.set('observer'));
      const E = S.nest0.entrances[0]?.pos ?? S.start.pos, f = S.start.fwd;
      const pos = { x: E.x - f.x * 7 * bu + f.z * 2 * bu, z: E.z - f.z * 7 * bu - f.x * 2 * bu };
      const gy = (await g((p) => window.__game.query.field(p.x, 0, p.z), pos)).height;
      await g(({ pos, look }) => window.__game.camera.setPose(pos, look), { pos: { x: pos.x, y: gy + 1.2 * bu, z: pos.z }, look: { x: E.x, y: E.y + 0.4 * bu, z: E.z } });
    } else if (view === 'queenstart') {
      await g(() => window.__game.release());
      await g(() => window.__game.possess('queen'));
      const st = S.start;
      await g((p) => window.__game.teleport('possessed', p), { x: st.pos.x, y: st.pos.y + 0.5 * bu, z: st.pos.z });
      await g(() => window.__game.step(3));
      await g((d) => window.__game.setIntent({ dir: d }), { x: st.fwd.x, y: 0, z: st.fwd.z });
      await g(() => window.__game.step(2));
      await g(() => window.__game.setIntent({}));
      await g(() => window.__game.step(3));
    } else if (view === 'nest') await nestWorker();
    else if (view === 'tunnel') await tunnelWorker();
    else if (view === 'crowd') await crowdWorker();
    else if (view === 'observer') await observerAt();
    else if (view === 'observerlow') await observerAt(22, 40);
    else if (view === 'slice') await sliceAt();
    else if (view === 'edge') await edgeAt();
    else throw new Error(`look3: unknown view ${view}`);
    await g(() => window.__game.step(1));
    await render(0.5);
    const name = `${vtag}-${lname}-${view}-${q}`;
    const gp = view === 'surface' || view === 'gyne' || view === 'close' ? await groundPoints() : { subject: null, points: [], ring: [] };
    const m = await page.evaluate(async ({ fn, args }) => {
      window.__game.renderFrame({ settle: 0.5 });
      return await new Function(`return (${fn})`)()(args);
    }, { fn: measureInPage.toString(), args: { points: gp.points, ring: gp.ring, subject: gp.subject } });
    // 'close': the plate is the 400 x 225 px around the possessed ant (its look, at the pixels it is drawn with)
    const clip = view === 'close' && gp.subject ? { x: Math.max(0, Math.min(1280 - 400, gp.subject.x - 200)), y: Math.max(0, Math.min(720 - 225, gp.subject.y - 140)), width: 400, height: 225 } : null;
    await plate(name, clip);
    const st = await statsNow();
    shots.push({ file: name, variant: variant.name, light: lname, view, quality: q, drawCalls: st.drawCalls, triangles: st.triangles, frameMs: st.frameMs, measure: m });
    log(`${name}: draws=${st.drawCalls} tris=${st.triangles} ground=${m.ground.median?.toFixed(3)} (n=${m.ground.n}) frame=${m.frame.median?.toFixed(3)}${m.contrast != null ? ` antContrast=${m.contrast.toFixed(2)} separable=${m.separable?.toFixed(2)}` : ''}`);
    writeFileSync(`${outDir}/${tag}-shots.json`, JSON.stringify(shots));
  }
  }
  return { tag, n: shots.length };
};
