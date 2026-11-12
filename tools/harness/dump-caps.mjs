// Script for play.mjs: returns window.__caps (WebGL capability probe, see spikes/stack/caps).
//   node tools/harness/play.mjs --root spikes/stack/caps --script tools/harness/dump-caps.mjs
export default async ({ page, shot }) => { await shot('caps'); return page.evaluate(() => window.__caps); };
