# Panels demo (`spikes/panels-demo`)

Colony health, Nest overview, Journal, Codex, the marker palette, overlay controls and legends (task `ui-panels`) on a mock
`GameFacade` and a mock panels bridge (`mock.ts`): a Lasius colony in its third week with a failing brood, a nest of seven chambers
(one flooding, two inferred links), eleven game days of history, fifteen milestones, a log, aims and a few codex entries observed.
Data is in `data.ts`. Sets `window.__ready`. `window.__panels` is the panels' debug surface (`src/ui/panels/wiring/debug.ts`);
`window.__panelsDemo` gives scripts the facade and the bridge (`bridge.calls` records what the panels asked of the game).

```
node tools/harness/play.mjs --root spikes/panels-demo --query "scene=health&scale=150"
```

| Flag | Values |
|---|---|
| `scene` | `health`, `nest`, `journal`, `codex`, `markers`, `overlays`, `alerts` |
| `scale` / `text` | UI scale in percent (`80`..`150`) / text size `100`, `115`, `130` |
| `bg` | `scene` (default), `bright` (the legibility worst case), `dark`, `nest` (soil, for the cutaway scenes) |
| health | `expand=<diag id>` (default `diag-brood-growth`), `none=1` (no diagnostics) |
| nest | `select=<chamber id>`, `empty=1` (no chambers) |
| journal | `tab=aims|milestones|graphs|log`, `young=1` (a game too young for graphs) |
| codex | `entry=<cx id>`, `seen=none` (every entry locked), `comfort=ring` (spider comfort on) |
| markers | `tool=dig|forage|avoid|rally|entrance|move-brood|move-queen`, `template=tunnel` |
| overlays | `overlay=scent,temperature,moisture,threats,dig-plans`, `palette=okabe-ito|high-contrast|pattern-only`, `view=colony|observer|possess` |
| `reducedMotion=1`, `contrast=high` | accessibility states |

Scripts (through the harness)

| Script | What it does |
|---|---|
| `scripts/shots.mjs` | Screenshots of every scene at sizes and scales: `PN_SIZES`, `PN_SCALES`, `PN_SCENES`, `PN_PREFIX`, `PN_EXTRA`. |
| `scripts/behaviour.mjs` | Keyboard and focus reach of every control (Tab, arrows, Q/E, Esc), cause chains and remedy highlights in the page, graph cursor by keys, designation and entrance calls recorded on the bridge, codex search never reaching locked text, overlay legends per palette, no remote requests. |

The classic single-file build:

```
npx vite build spikes/panels-demo --config spikes/panels-demo/vite.config.ts --mode classic --outDir ../../test-output/panels-demo-classic --emptyOutDir
node tools/harness/play.mjs --static --root test-output/panels-demo-classic --script spikes/panels-demo/scripts/behaviour.mjs --query scene=health
```

The real game: `tests/e2e/panels.mjs` (see its header).
