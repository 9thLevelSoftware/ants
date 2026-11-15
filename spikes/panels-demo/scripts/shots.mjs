// Screenshots of the panels demo at the sizes and scales that matter (task ui-panels acceptance 2). Run through the harness.
// env: PN_SIZES="1280x720,1920x1080"  PN_SCALES="100,150"  PN_SCENES="health,nest,journal-aims,..."  PN_PREFIX=name  PN_EXTRA="bg=bright"
// A scene is `<scene>` or `<scene>-<variant>` where the variant table below gives the extra query.
//   node tools/harness/play.mjs --root spikes/panels-demo --script spikes/panels-demo/scripts/shots.mjs --out test-output/panels/shots
const SCENES = {
  health: 'scene=health',
  'health-calm': 'scene=health&expand=diag-stores',
  'health-none': 'scene=health&none=1',
  nest: 'scene=nest',
  'nest-selected': 'scene=nest&select=3',
  'nest-empty': 'scene=nest&empty=1',
  'journal-aims': 'scene=journal&tab=aims',
  'journal-milestones': 'scene=journal&tab=milestones',
  'journal-graphs': 'scene=journal&tab=graphs',
  'journal-log': 'scene=journal&tab=log',
  'journal-young': 'scene=journal&tab=graphs&young=1',
  codex: 'scene=codex',
  'codex-locked': 'scene=codex&seen=none&entry=cx-honeydew',
  'codex-interface': 'scene=codex&entry=cx-interface-why',
  markers: 'scene=markers&tool=forage',
  'markers-dig': 'scene=markers&tool=dig&bg=nest',
  'overlays-scent': 'scene=overlays&overlay=scent&view=colony',
  'overlays-temp': 'scene=overlays&overlay=temperature,scent&view=colony',
  'overlays-dig': 'scene=overlays&overlay=dig-plans&view=colony&bg=nest',
};
export default async ({ page, shot, log, wait, url }) => {
  const sizes = (process.env.PN_SIZES ?? '1280x720').split(',').map((s) => s.split('x').map(Number));
  const scales = (process.env.PN_SCALES ?? '100').split(',').map(Number);
  const scenes = (process.env.PN_SCENES ?? Object.keys(SCENES).join(',')).split(',');
  const prefix = process.env.PN_PREFIX ?? 'pn';
  const base = new URL(url);
  const out = [];
  for (const [w, h] of sizes) {
    for (const scale of scales) {
      for (const scene of scenes) {
        await page.setViewportSize({ width: w, height: h });
        const u = new URL(base);
        u.search = `${SCENES[scene] ?? `scene=${scene}`}&scale=${scale}${process.env.PN_EXTRA ? '&' + process.env.PN_EXTRA : ''}`;
        await page.goto(u.toString());
        await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
        await wait.frames(4);
        const name = `${prefix}-${scene}-${w}x${h}-s${scale}`;
        out.push(await shot(name));
        log('shot', name);
      }
    }
  }
  return { shots: out };
};
