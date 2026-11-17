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
// light: night | night-overcast | night-rain | dusk | dawn | noon | overcast | rain
// view:  surface | nest | observerlow | observer | gyne (a gyne and a male beside the possessed worker) | slice | edge
// Every picture is a plate (UI hidden); luminance numbers (look2-measure) are logged per shot and written to <tag>-shots.json.
import { writeFileSync } from 'node:fs';
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
  const plate = async (name) => {
    const file = `${outDir}/${name}.png`;
    const h = await page.addStyleTag({ content: '#ui, #ui *{visibility:hidden !important}' });
    await page.screenshot({ path: file, timeout: 300000 });
    await h.evaluate((el) => el.remove());
    return file;
  };
  const S = await stage(page, log, { arch: env.LOOK3_ARCH || null, seed: Number(env.LOOK3_SEED ?? 1) });
  const { render, statsNow, surfaceWorker, nestWorker, observerAt, sliceAt, edgeAt, groundPoints, bu } = S;
  const shots = [];
  let curQ = null, curL = null;
  for (const spec of list) {
    const [lname, view, q = 'high'] = spec.split(':');
    const L = LIGHTS[lname];
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
    if (view === 'surface' || view === 'gyne') {
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
    } else if (view === 'nest') await nestWorker();
    else if (view === 'observer') await observerAt();
    else if (view === 'observerlow') await observerAt(22, 40);
    else if (view === 'slice') await sliceAt();
    else if (view === 'edge') await edgeAt();
    else throw new Error(`look3: unknown view ${view}`);
    await g(() => window.__game.step(1));
    await render(0.5);
    const name = `${tag}-${lname}-${view}-${q}`;
    const gp = view === 'surface' || view === 'gyne' ? await groundPoints() : { subject: null, points: [], ring: [] };
    const m = await page.evaluate(async ({ fn, args }) => {
      window.__game.renderFrame({ settle: 0.5 });
      return await new Function(`return (${fn})`)()(args);
    }, { fn: measureInPage.toString(), args: { points: gp.points, ring: gp.ring, subject: gp.subject } });
    await plate(name);
    const st = await statsNow();
    shots.push({ file: name, light: lname, view, quality: q, drawCalls: st.drawCalls, triangles: st.triangles, frameMs: st.frameMs, measure: m });
    log(`${name}: draws=${st.drawCalls} tris=${st.triangles} ground=${m.ground.median?.toFixed(3)} (n=${m.ground.n}) frame=${m.frame.median?.toFixed(3)}${m.contrast != null ? ` antContrast=${m.contrast.toFixed(2)} separable=${m.separable?.toFixed(2)}` : ''}`);
    writeFileSync(`${outDir}/${tag}-shots.json`, JSON.stringify(shots));
  }
  return { tag, n: shots.length };
};
