# HUD demo (`spikes/hud-demo`)

The in-game HUD, Colony orders (Directives), the Roster, the inspect card and the alerts feed (task `ui-hud`) on a mock
`GameFacade` (`mock.ts`): a Lasius colony of 34 workers on a summer afternoon and a 1,500-ant roster. Controls change the
shared snapshot the way the game would (speed, possession, directives), so everything can be used in the page. Sets
`window.__ready`. `window.__hud` is the HUD's debug surface (`src/ui/hud/debugHook.ts`); `window.__hudDemo` gives scripts
the facade (`calls`, `commands`) and `setAlerts(kind)`.

```
node tools/harness/play.mjs --root spikes/hud-demo --query "scene=worker&anchor=1&scale=150"
```

| Flag | Values |
|---|---|
| `scene` | `worker` (default), `queen` (Colony orders prompt and button), `observer`, `orders` (Directives open; `manual=1` for ordered shares), `roster`, `inspect` (`ant=<id>`), `alerts` (5 alerts: 3 cards and "+2 more"), `critical`, `hidden` (H pressed), `empty` |
| `scale` | UI scale in percent (`80`..`150`) |
| `text` | text size `100`, `115`, `130` |
| `bg` | `scene` (default), `bright` (the legibility worst case), `dark` |
| `anchor=1` | prompt anchored over a fake ant at the middle of the screen (otherwise the bottom-centre fallback box) |
| `paused=1`, `reducedMotion=1`, `contrast=high` | states |
| `scroll=1` (`scrollTo=<px>`) | scroll the open drawer |

Scripts (through the harness)

| Script | What it does |
|---|---|
| `scripts/shots.mjs` | Screenshots of scenes at sizes and scales: `HUD_SIZES`, `HUD_SCALES`, `HUD_SCENES`, `HUD_PREFIX`, `HUD_EXTRA`. |
| `scripts/behaviour.mjs` | Keyboard and gamepad reachability of every control, focus visible, slider-sum behaviour in the page, alert throttling in the page, roster virtualisation (DOM rows <= 60), no remote requests. |

The classic single-file build:

```
npx vite build spikes/hud-demo --config spikes/hud-demo/vite.config.ts --mode classic --outDir ../../test-output/hud-demo-classic --emptyOutDir
node tools/harness/play.mjs --static --root test-output/hud-demo-classic --script spikes/hud-demo/scripts/behaviour.mjs --query scene=worker
```
