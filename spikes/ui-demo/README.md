# UI shell demo (`spikes/ui-demo`)

Every out-of-game screen and every component state of the interface shell (task `ui-shell`), driven by a mock
`GameFacade` (`mockFacade.ts`). Sets `window.__ready` when the first frame and the fonts are in.

```
node tools/harness/play.mjs --root spikes/ui-demo --query "screen=new-game&scale=150&reducedMotion=1"
```

URL flags

| Flag | Values |
|---|---|
| `screen` | `boot`, `title`, `title-empty` (no saves), `new-game`, `loading`, `loading-regen`, `loading-error`, `pause`, `settings`, `save-load`, `credits`, `codex`, `lineage`, `unsupported`, `error`, `epitaph`, `too-small`, `components` |
| `tab` | settings: `graphics` `audio` `controls` `accessibility` `gameplay`; save-load: `save` `load` `transfer` |
| `section`, `modal` | `components`: `buttons` `inputs` `structure` `feedback` `icons`; `modal=confirm|dialog|export|drawer` |
| `scale` | UI scale in percent (`80`..`150`) or as a factor (`0.8`..`1.5`) |
| `text` | text size `100`, `115`, `130` |
| `reducedMotion=1`, `contrast=high`, `font=hyperlegible` | accessibility modes |
| `bg` | `scene` (default, bright sky and lawn), `bright` (pure white, the legibility worst case), `dark` |
| `saves=none`, `storage=off`, `lineage=1`, `nodownload=1`, `quality=high` | mock facade state |
| `from=pause|title` | where `settings` / `save-load` were opened from |

Scripts (all run through the harness; each throws when a check fails)

| Script | What it does |
|---|---|
| `scripts/shots.mjs` | Screenshots of the screens at the sizes and scales in `UI_SIZES`, `UI_SCALES`, `UI_SCREENS`, `UI_EXTRA`, `UI_PREFIX`. |
| `scripts/keyboard.mjs` | Tab / Shift+Tab / arrow-key reachability and visible focus ring on every screen (`UI_PRINT=1` prints the order). |
| `scripts/behaviour.mjs` | 64 checks: keyboard interaction of the components, focus trap and restore, Esc layering, transitions, rebinding with conflicts, save / load / export / import, scale, reduced motion, contrast mode, fonts, no remote requests. |
| `scripts/iframe.mjs` | The classic build inside `<iframe sandbox="allow-scripts">` (opaque origin, no storage). |
| `scripts/real.mjs` | The shell mounted on the real `Game` (`game.html`): title, new colony, playing, pause, settings, resume. |

Classic single-file build, served the way the portable build is:

```
npx vite build spikes/ui-demo --config spikes/ui-demo/vite.config.ts --mode classic --outDir ../../test-output/ui-demo-classic --emptyOutDir
node tools/harness/play.mjs --static --root test-output/ui-demo-classic --script spikes/ui-demo/scripts/behaviour.mjs --query screen=title
```
