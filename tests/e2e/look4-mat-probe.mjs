export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  await g(() => window.__game.renderFrame({ settle: 1 }));
  const r = await g(() => {
    const out = [];
    window.__hud.game.scene.traverse((o) => {
      if (!o.isMesh || !o.name.includes('wood-sound')) return;
      const s = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_begin>\n#include <fog_fragment>' };
      try { o.material.onBeforeCompile(s, null); } catch (e) { out.push({ n: o.name, err: String(e) }); return; }
      out.push({ n: o.name, count: o.count, vis: o.visible, boards: s.vertexShader.includes('#define WR_BOARDS'), mat: o.material.name });
    });
    return out;
  });
  log(JSON.stringify(r));
};
