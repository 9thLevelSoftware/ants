// Look pass 2 contact sheet from the REAL game (task look-pass-2): night, dusk, noon and overcast, seen from the
// possession camera on the surface, from inside the nest, from observer height and as a colony slice.
//
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=high" --script tests/e2e/lib/look2.mjs \
//        --out test-output/look2/p2/after --timeout 300000 --script-timeout 3600000
//
// Environment (all optional):
//   LOOK2_TAG=after           file-name prefix (before / after)
//   LOOK2_LIGHTS=night,...    night | night-rain | dusk | noon | overcast   (default: all five)
//   LOOK2_VIEWS=surface,...   surface | nest | observer | observerlow | slice | edge | entrance   (default: surface,nest,observer,slice)
//   LOOK2_QUALITY=high,low    presets to shoot, in order
//   LOOK2_ARCH=kitchen-door   start a new game of that archetype first (default: the page's autostart game, seed 1)
//   LOOK2_SEED=1              seed for LOOK2_ARCH
//   LOOK2_BENCH=3             also time each frame: minimum of n synchronous renders
// Every picture is a plate (UI hidden). Result: per shot { file, light, view, quality, drawCalls, triangles, ms,
// groundPoints } where groundPoints are the screen positions of terrain samples within 20 body lengths of the ant
// (tests/e2e/lib/look2-measure.mjs reads the luminance and contrast numbers from the frame itself, in the page).
import { writeFileSync } from 'node:fs';
import { measureInPage } from './look2-measure.mjs';
import { LIGHTS, stage } from './look2-stage.mjs';

export default async ({ page, log, out: outDir }) => {
  const env = process.env;
  const tag = env.LOOK2_TAG ?? 'after';
  const lights = (env.LOOK2_LIGHTS ?? Object.keys(LIGHTS).join(',')).split(',').filter(Boolean);
  const views = (env.LOOK2_VIEWS ?? 'surface,nest,observer,slice').split(',').filter(Boolean);
  const qualities = (env.LOOK2_QUALITY ?? 'high').split(',').filter(Boolean);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`look2: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const shots = [];

  const plate = async (name) => {
    const file = `${outDir}/${name}.png`;
    const h = await page.addStyleTag({ content: '#ui, #ui *{visibility:hidden !important}' });
    await page.screenshot({ path: file, timeout: 300000 });
    await h.evaluate((el) => el.remove());
    return file;
  };

  const S = await stage(page, log, { arch: env.LOOK2_ARCH || null, seed: Number(env.LOOK2_SEED ?? 1) });
  const { setLight, render, statsNow, surfaceWorker, nestWorker, observerAt, sliceAt, edgeAt, groundPoints } = S;

  for (const q of qualities) {
    const qs = await g((id) => window.__game.quality(id), q);
    expect(qs.ok, 'quality', qs);
    for (const lname of lights) {
      await setLight(lname);
      for (const view of views) {
        if (view === 'surface' || view === 'entrance') {
          await surfaceWorker(view);
          // LOOK2_CREATURES=woodlouse,caterpillar: creatures a few body lengths ahead of the ant (surface shading check)
          for (const [i, kind] of (env.LOOK2_CREATURES ?? '').split(',').filter(Boolean).entries()) {
            await g(({ kind, i, bu }) => {
              const p = window.__game.summary().possessed;
              const f = p.fwd, side = [f[2], 0, -f[0]], d = (6 + 3 * i) * bu, o = (i % 2 ? 1 : -1) * 2.5 * bu;
              const x = p.pos[0] + f[0] * d + side[0] * o, z = p.pos[2] + f[2] * d + side[2] * o;
              window.__game.cheat.spawnCreature(kind, { x, y: window.__game.query.field(x, 0, z).height + 0.5 * bu, z });
              window.__game.step(2);
            }, { kind, i, bu: S.bu });
          }
        }
        else if (view === 'nest' || view === 'tunnel') await nestWorker();
        else if (view === 'observer') await observerAt();
        else if (view === 'observerlow') await observerAt(22, 40);
        else if (view === 'slice') await sliceAt();
        else if (view === 'edge') await edgeAt();
        // one settled frame so the camera rig is where the picture shows it, then the ground points; the measured
        // frame below is drawn again in the same task as the read-back
        await g(() => window.__game.step(1));
        await render(0.5);
        const name = `${tag}-${lname}-${view}-${q}`;
        const gp = view === 'surface' || view === 'entrance' ? await groundPoints() : { subject: null, points: [], ring: [] };
        // measured from a frame drawn in the same task (the drawing buffer is cleared once it is presented)
        const m = await page.evaluate(async ({ fn, args }) => {
          window.__game.renderFrame({ settle: 0.5 });
          return await new Function(`return (${fn})`)()(args);
        }, { fn: measureInPage.toString(), args: { points: gp.points, ring: gp.ring, subject: gp.subject } });
        const file = await plate(name);
        const st = await statsNow();
        const rec = { file: name, light: lname, view, quality: q, drawCalls: st.drawCalls, triangles: st.triangles, frameMs: st.frameMs, subject: gp.subject, measure: m, groundPoints: gp.points };
        shots.push(rec);
        log(`${name}: draws=${st.drawCalls} tris=${st.triangles} ground=${m.ground.median?.toFixed(3)} (n=${m.ground.n}) frame=${m.frame.median?.toFixed(3)}${m.contrast !== null && m.contrast !== undefined ? ` antContrast=${m.contrast.toFixed(2)} separable=${m.separable?.toFixed(2)}` : ''}`);
        if (!file) throw new Error(`no screenshot ${name}`);
      }
    }
  }
  writeFileSync(`${outDir}/${tag}-shots.json`, JSON.stringify(shots));
  return { tag, shots: shots.map((s) => ({ ...s, groundPoints: s.groundPoints.length })) };
};
