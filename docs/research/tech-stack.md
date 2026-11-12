# FOUNDRESS technical stack and headless harness (verified by running)

Everything here was produced by actually running it in this container (Node 22.23.4, npm 10.9.9, no GPU, Chromium 153.0.8010.12 via global Playwright 1.63.0).
Code: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `tools/harness/`, `spikes/stack/`. Reference screenshots: `docs/research/tech-stack-img/`.

## 1. Exact versions (all pinned, no `^`/`~`; all were `latest` on npm on 2026-11-12)

| Package | Version | Kind |
|---|---|---|
| three | 0.187.0 | dependency |
| @types/three | 0.187.0 | dev (must match three's minor) |
| postprocessing (pmndrs) | 6.39.6 | dependency; peer `three >= 0.168.0 < 0.188.0` (accepts 0.187.0) |
| preact | 11.2.0 | dependency |
| @preact/signals | 2.11.4 | dependency (peer preact >=10.25 or >=11) |
| fflate | 0.8.3 | dependency |
| vite | 8.3.8 | dev (Rolldown + Oxc based) |
| @preact/preset-vite | 2.10.6 | dev (peer vite up to 8.x, peer `@babel/core` 7.x is present in node_modules) |
| typescript | 7.0.2 | dev (native compiler, see gotchas) |
| vitest | 5.1.0 | dev |
| Playwright | 1.63.0 | GLOBAL only (`/opt/node-tools/node_modules/playwright`); never an npm dependency |

Install is already done (`npm install` with `--save-exact`); `package-lock.json` is committed material. Scripts: `npm test`, `npm run typecheck`, `npm run build:spike`, `npm run build:spike:classic`, `npm run dev:spike`, `npm run play -- <args>`.

Config summary
* `tsconfig.json`: `strict`, `target ES2022`, `lib [ES2022, DOM, DOM.Iterable]`, `module ESNext`, `moduleResolution bundler`, `jsx react-jsx` + `jsxImportSource preact`, `noEmit`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `types [vite/client]`, include `src spikes tests vite.config.ts`.
* `vite.config.ts`: `base: './'`, `build.target es2022`, `@preact/preset-vite`. `--mode classic` emits one classic IIFE script (see section 7).
* `.gitignore`: `node_modules dist test-output .harness-out *.log .DS_Store`.

## 2. Headless WebGL in this container

Result: **WebGL2 works with SwiftShader (software Vulkan via ANGLE) in every configuration tried, including no flags at all.** Both the Playwright default headless shell and `channel: 'chromium'` (new headless) give the same renderer.

Flags used by the harness (`CHROMIUM_ARGS` in `tools/harness/play.mjs`):

```
--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader --ignore-gpu-blocklist --enable-webgl
--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-dev-shm-usage
```
(first five give WebGL2 explicitly instead of relying on Chromium's fallback; the rest keep rAF/timers at full rate in a never-focused page and avoid a tiny /dev/shm). Playwright already adds `--no-sandbox` (we run as root) and `--headless`; do not add `--headless=new` (works, but the default headless shell is faster: ~95 ms vs ~147 ms rAF interval for the same light scene; use `--channel chromium` only if you need full-Chromium behaviour).

Matrix tried (renderer string `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` unless stated):

| Flags | WebGL2 |
|---|---|
| none | works |
| `--headless=new --use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader --ignore-gpu-blocklist` | works |
| `--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader` | works |
| `--enable-webgl --ignore-gpu-blocklist --use-angle=swiftshader --enable-unsafe-swiftshader` | works |
| `--use-gl=egl --ignore-gpu-blocklist`, `--use-gl=swiftshader`, `--use-gl=angle --use-angle=gl`, `--disable-gpu` | works (all silently end up on SwiftShader) |
| `--disable-gpu --disable-software-rasterizer` | **NO WebGL2** |
| `--use-gl=disabled` | **NO WebGL2** |

### Capability table (`spikes/stack/caps`, functional tests that render and read pixels back; `node tools/harness/play.mjs --root spikes/stack/caps --script tools/harness/dump-caps.mjs`)

| Item | Result |
|---|---|
| WebGL2 context | yes; `WebGL 2.0 (OpenGL ES 3.0 Chromium)`, GLSL ES 3.00 |
| UNMASKED_RENDERER | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` |
| MAX_TEXTURE_SIZE | 8192 |
| MAX_3D_TEXTURE_SIZE | 2048 (a 256^3 R8 3D texture allocates and uploads fine) |
| MAX_ARRAY_TEXTURE_LAYERS | 2048 |
| MAX_SAMPLES (MSAA) | 4 |
| MAX_TEXTURE_IMAGE_UNITS / MAX_VERTEX_TEXTURE_IMAGE_UNITS | 32 / 32 |
| MAX_VERTEX_ATTRIBS / MAX_COLOR_ATTACHMENTS / MAX_RENDERBUFFER_SIZE | 16 / 8 / 8192 |
| sampler3D | works (3D R8 texture sampled in a fragment shader; slices read back 40/80/120/160) and in the vertex shader (spike ants) |
| EXT_color_buffer_float | yes; render into RGBA32F and RGBA16F targets and read back (123.5 / -7.25 / 1000 exact in 32F) |
| OES_texture_float_linear | yes; bilinear RGBA32F sample at the midpoint returned 0.500 |
| EXT_float_blend, EXT_color_buffer_half_float | yes |
| OES_texture_half_float_linear | reported false, but irrelevant: half-float textures are filterable in core WebGL2 (the composer's HalfFloat buffers + bloom mips work) |
| Instancing, 20000 instances | works: 1 draw call, 240000 triangles, 14.9 ms (sync) at 64x64; the spike uses 5000 instances (840k triangles) |
| Shadow maps | work: 2048x2048 `PCFSoftShadowMap`, DirectionalLight, visible shadows incl. from custom-animated instances |
| MSAA renderbuffers | work: `WebGLRenderTarget({samples: 4})` gives intermediate edge values (32 vs 0 edge pixels in the test). The composer's own `multisampling: 4` was NOT exercised (spike uses SMAA) |
| EXT_texture_filter_anisotropic, WEBGL_multi_draw, EXT_disjoint_timer_query_webgl2, OVR_multiview2, s3tc/astc/etc/bptc | yes |
| KHR_parallel_shader_compile | **no** (shader compiles block; first frame ~1.3 s) |

Real-GPU caveats (not testable here): R32F linear filtering and float render targets are NOT guaranteed on all GPUs; check `renderer.extensions.has('OES_texture_float_linear')` / use R8 or HalfFloat for portable data textures.

## 3. Performance under software rendering (spike `spikes/stack`, 1280x720 and 640x360)

Method: `spikes/stack/bench.mjs` (run with `play.mjs --script`) calls `window.__bench(10, 3)`: stops the rAF loop, renders 3 warm-up + 10 measured frames synchronously, each ending with a 1-pixel `readPixels` so the GPU must finish, and reports ms/frame. Scene is frozen (`t=3`). Numbers are noisy (about +/-15 %; the machine has 4 cores, SwiftShader is multithreaded: do not run two heavy harness jobs at once when measuring). `tris` is per frame over all passes, from `renderer.info` with `autoReset=false` and a manual reset per frame.

Ant mesh is 168 triangles (3 merged low-poly spheres); terrain 80,000 + 28 rocks about 20,000, so static geometry is about 100k triangles.

A. As specified: 5000 ants (928k tris per frame without shadows, 1.79M with the shadow pass):

| Size | Post | Shadows | ms/frame | fps |
|---|---|---|---|---|
| 1280x720 | on | on | 1187 | 0.8 |
| 1280x720 | on | off | 742 | 1.3 |
| 1280x720 | off | on | 956 | 1.0 |
| 1280x720 | off | off | 566 | 1.8 |
| 640x360 | on | on | 645 | 1.6 |
| 640x360 | on | off | 346 | 2.9 |
| 640x360 | off | on | 959 | 1.0 |
| 640x360 | off | off | 655 | 1.5 |

B. 500 ants (172k tris without shadows, 276k with):

| Size | Post | Shadows | ms/frame | fps |
|---|---|---|---|---|
| 1280x720 | on | on | 617 | 1.6 |
| 1280x720 | on | off | 540 | 1.9 |
| 1280x720 | off | on | 214 | 4.7 |
| 1280x720 | off | off | 144 | 7.0 |
| 640x360 | on | on | 312 | 3.2 |
| 640x360 | on | off | 239 | 4.2 |
| 640x360 | off | on | 192 | 5.2 |
| 640x360 | off | off | 139 | 7.2 |

C. Floor, 1 ant (terrain + rocks only, 88k tris without shadows, 109k with):

| Size | Post | Shadows | ms/frame | fps |
|---|---|---|---|---|
| 1280x720 | on | on | 654 | 1.5 |
| 1280x720 | on | off | 703 | 1.4 |
| 1280x720 | off | on | 158 | 6.3 |
| 1280x720 | off | off | 127 | 7.9 |
| 640x360 | on | on | 184 | 5.4 |
| 640x360 | on | off | 166 | 6.0 |
| 640x360 | off | on | 107 | 9.3 |
| 640x360 | off | off | 57 | 17.5 |

D. MSAA on the default framebuffer (`?post=0&msaa=0|1`, 5000 ants), the biggest single lever when post is off (the post path already has `antialias:false`, which is why post-on can be CHEAPER than post-off in table A at 640x360):

| Size | Shadows | MSAA 4x (default) | MSAA off |
|---|---|---|---|
| 640x360 | off | 494 | 226 |
| 1280x720 | off | 583 | 269 |
| 640x360 | on | 840 | 591 |
| 1280x720 | on | 948 | 601 |

(Repeat runs of the same configuration differ by 10-15 % because of SwiftShader threading and GPU backlog: 566 vs 583 and 655 vs 494 above.)

Conclusions for a "test quality" preset
* **Test preset = post OFF, MSAA OFF (`antialias: false`), shadows OFF, viewport 640x360 to 1280x720.** With 5000 ants that is about 230-270 ms/frame (about 4 fps) versus 1187 ms/frame for everything on; with a lightly populated scene about 60-130 ms.
* **MSAA** on the default framebuffer roughly doubles the cost of a vertex-heavy scene in software GL (4 coverage samples per triangle): 5000 ants 269 -> 583 ms at 1280x720.
* **Post-processing is the pixel-bound cost**: about +500-570 ms at 1280x720 and about +110-130 ms at 640x360 in the light scenes (DoF + 7-level mipmap bloom + SMAA's 3 passes + HalfFloat buffers); it scales roughly with pixel count. Use it only for look tests.
* **Shadows** cost one extra geometry pass: +30-50 ms (terrain only) up to +330-390 ms (5000 animated instances). Map size was not varied (2048 only); the pixel cost of the map is small next to the vertex cost.
* **Vertex load dominates when there are many instances**: with 5000 ants (168 tris each) resolution barely matters on the non-post path. Test preset: cap the instance count or use the lowest LOD mesh.
* Never rely on real-time speed: drive the simulation by stepping ticks (`window.__game` hooks from the design seed), freeze animation time (`?t=`), and screenshot a single frame. One look-quality screenshot (post on, shadows on, MSAA irrelevant, 1280x720) costs about 0.6-1.2 s of render time and is fine.
* `window.__perf()` (rAF interval over 60 frames) agrees with the sync numbers for light scenes (95 ms vs 100 ms measured) but under heavy load the rAF loop piles up GPU work (see harness gotchas); prefer `__bench` for numbers.

## 4. Post-processing decision

**Decision: pmndrs `postprocessing` 6.39.6 on three 0.187.0** (not three's own `EffectComposer` addons).

Why
* Peer range `>= 0.168.0 < 0.188.0` accepts 0.187.0 (verified from `peerDependencies`, and by running).
* It has every effect we need as first-class effects: `DepthOfFieldEffect` (bokeh, circle of confusion from the depth buffer, world-unit `focusDistance`/`focusRange`, so millimetre scene units work directly), `BloomEffect` (mipmap blur, HDR threshold), `VignetteEffect`, `ToneMappingEffect` (ACES_FILMIC, AGX, NEUTRAL...), `SMAAEffect`.
* `EffectPass` merges compatible effects into ONE fullscreen shader (the spike runs DoF + bloom + tone mapping + vignette in one pass, SMAA in a second), versus one pass per effect with three's addons (`BokehPass`, `UnrealBloomPass`, `OutputPass`, `SMAAPass`), which matters because post is the dominant pixel cost.
* HalfFloat frame buffers by default option (`frameBufferType: HalfFloatType`) so emissive/specular values above 1 survive to the bloom threshold and tone mapping.

Cost / risk
* The upper peer bound (`< 0.188.0`) ties three upgrades to a postprocessing release: pin both and upgrade together. Fallback if it lags: three's `three/addons/postprocessing/*` (`EffectComposer`, `RenderPass`, `UnrealBloomPass`, `BokehPass`, `SMAAPass`, `OutputPass`), same concepts, more passes.
* Typing quirks, and tone mapping moves into the chain (gotchas below).
* Not tested: `reversedDepthBuffer: true` renderer option (exists in r187) together with the depth-based DoF.

Working chain (copy from `spikes/stack/main.ts`):

```ts
const renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' }); // composer: no MSAA on the default framebuffer
renderer.toneMapping = NoToneMapping;                  // tone mapping happens in ToneMappingEffect
const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera,
  new DepthOfFieldEffect(camera, { focusDistance: 125, focusRange: 70, bokehScale: 3.2, resolutionScale: 0.5 }), // mm
  new BloomEffect({ intensity: 0.85, luminanceThreshold: 0.9, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.75, levels: 7 }),
  new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
  new VignetteEffect({ offset: 0.28, darkness: 0.62 })));
composer.addPass(new EffectPass(camera, smaaEffect));  // separate pass: SMAA is a convolution effect, runs last on tone-mapped colour
// per frame: composer.render(deltaSeconds)   on resize: composer.setSize(w, h, false)
```
Without post: `antialias: true`, `renderer.toneMapping = ACESFilmicToneMapping`, `renderer.render(scene, camera)`. `antialias` is a context-creation option, so the post flag must be known at startup.

## 5. Harness usage (`tools/harness/play.mjs`; full docs in `tools/harness/README.md`)

```
node tools/harness/play.mjs --root <dir with index.html> [--query "test=1&seed=7"] [--script f.mjs] [--out dir]
     [--width 1280] [--height 720] [--timeout 60000] [--static]
     extras: --mount /sub/dir/  --no-ready  --script-timeout ms  --ignore <regex>  --channel chromium  --dpr 1  --verbose
```
* Own server per run on an ephemeral port (verified: 3 concurrent runs got 3 different ports): Vite dev server (TS works without build; per-run cache dir in the OS temp dir, HMR and watchers off) or `--static`.
* Waits for `window.__ready === true`; fails fast (5 s) after an uncaught page error or failed script load instead of waiting the full timeout.
* Script contract: `export default async ({ page, shot, log, wait, url, context, browser, out, query, root }) => result`.
* stdout last line is the JSON `{ok, ready, errors, screenshots, timings, out, url, logs, result}`; human log goes to stderr. Exit 1 on any page error, console error, failed/4xx/5xx request (favicon ignored), ready never set, or script throw. Exit 130 on SIGINT/SIGTERM (after cleanup, JSON line still printed).
* Always shuts down (verified: SIGINT and SIGTERM mid-run leave 0 chromium processes; `pgrep` after run = 0).

Worked examples
```
node tools/harness/play.mjs --root spikes/stack --query "test=1&seed=7&t=3"                 # one screenshot "page.png"
node tools/harness/play.mjs --root spikes/stack --script spikes/stack/bench.mjs             # frame-time matrix (several minutes with 5000 ants)
npm run build:spike && node tools/harness/play.mjs --static --mount /games/foundress/v1/ --root dist/spike-stack
```
Determinism check: two runs with `seed=7&t=3&post=0` produced byte-identical PNGs (same md5); `seed=8` differed.

## 6. Verification record

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | passes (about 0.7 s, native compiler) |
| `npx vitest run` (`tests/smoke.test.ts`, `environment: 'node'`) | 3 tests pass, asserts `window`/`document` are undefined, about 0.2 s |
| `vite build` of the spike | OK in about 0.3 s; 728 kB JS (214 kB gzip); `index.html` references `./assets/...` only |
| Build served under `/games/foundress/v1/` and `/a/b/c/` with `--static --mount` | `ok:true`, no errors, scene renders |
| Negative control: build with `--base /` under a mount | 404 on `/assets/...`, `ok:false`, exit 1 (the harness does detect non-relative URLs) |
| Build inside `<iframe sandbox="allow-scripts">` (opaque origin) | module build FAILS (CORS, see gotchas); `--mode classic` build WORKS |
| Preact + signals TSX through the harness's built-in Vite config, and through `vite build` with the root config | works (click -> `count 3 squared 9`) |

Screenshots (all looked at): `spike-1280x720-post-on-shadows-on.png` (DoF blur, bloom on dew drops, fog haze, vignette, shadows under ants, scent-tinted trail), `spike-1280x720-post-off-shadows-on.png` (plain ACES + MSAA), `spike-640x360-post-on-shadows-off.png`.

## 7. Gotchas (read before writing code)

Imports and typing
* Addons: `import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'` (maps to `three/examples/jsm/*` through the package `exports`; `three/examples/jsm/...` also works). Include the `.js` extension. `moduleResolution: bundler` plus `@types/three` resolves these.
* `postprocessing` exports everything from the root (`import { EffectComposer, RenderPass, EffectPass, ... } from 'postprocessing'`).
* `SMAAEffect.addEventListener('load', ...)` is a type error (its dispatcher is typed with only `'change'`) although the event exists at runtime; cast: `(smaa as unknown as { addEventListener(t: string, f: () => void): void }).addEventListener('load', cb)`. SMAA loads its search/area LUT images asynchronously: wait for that event before declaring `__ready`, or the first screenshot is un-antialiased.
* `onBeforeCompile` receives `WebGLProgramParametersWithUniforms` (import the type with `import type`; `verbatimModuleSyntax` is on).
* TypeScript 7.0.2 is the native compiler: `tsc` works and is very fast, but `require('typescript')` exposes only `version`/`versionMajorMinor` (no `createProgram`). Tools that need the classic JS compiler API will not work with it. Vite 8 and Vitest transform TS with Oxc and never run tsc, so type errors do NOT fail dev/build/test: run `npm run typecheck` separately.
* `types: ["vite/client"]` is set in tsconfig; import `vite` types from `vite`.

Colour management and tone mapping
* three r187 defaults: `outputColorSpace = SRGBColorSpace`, `ColorManagement` on: `new Color('#6b4f33')` is converted to linear working space; vertex colours written with `Color.r/g/b` are linear; texture images need `texture.colorSpace = SRGBColorSpace` for colour maps (data textures stay at the default NoColorSpace).
* **`renderer.toneMapping` is only applied when rendering to the screen, not into render targets.** With the composer the scene renders to a target, so set `renderer.toneMapping = NoToneMapping` and add `ToneMappingEffect` (otherwise there is no tone mapping, or it is applied twice if you also leave it on). The composer's final pass does the linear-to-sRGB conversion automatically (verified, no extra step).
* **`scene.background = Color` is NOT tone mapped, fogged geometry is.** In the no-post path the sky is exactly the fog colour (#d9c8a6 = RGB 217,200,166 in the PNG) while distant fogged terrain is ACES-mapped, so the horizon seam differs from the post path where everything incl. the background goes through ToneMappingEffect (sky became 196,188,170 in the PNG, post adds vignette/DoF). Pick the fog/background colours per path, or render the sky as geometry.
* `antialias` must be chosen at renderer creation: `false` when the composer is used (SMAA instead), `true` otherwise (but it is expensive in software GL, see performance table D).

Custom shaders on built-in materials (`onBeforeCompile`)
* three's common chunk already `#define`s `PI`; declaring `const float PI = ...` is a GLSL syntax error ("syntax error" at the literal). Use another name.
* Replace chunk includes: `#include <common>` (declarations), `#include <begin_vertex>` (position), `#include <beginnormal_vertex>` (normal: rotate the normal if you rotate the vertex), `#include <color_fragment>`, `#include <emissivemap_fragment>`. `instanceMatrix` is available in the vertex shader of an `InstancedMesh`.
* Per-instance attributes: `geometry.setAttribute('aAnim', new InstancedBufferAttribute(array, 4))`, declare `attribute vec4 aAnim;` in the vertex shader (GLSL ES 3.00 names still use `attribute`/`varying` here because three converts them).
* **Vertex-animated meshes need `mesh.customDepthMaterial`** (a `MeshDepthMaterial` with `depthPacking: RGBADepthPacking` and the same vertex chunk replaced) or the shadow shows the un-animated pose; for point lights use `customDistanceMaterial`. Set `frustumCulled = false` when the shader moves instances outside the static bounds.
* 3D textures: `Data3DTexture(data, w, h, d)`, `format = RedFormat`, `type = UnsignedByteType`, `unpackAlignment = 1`, set min/mag filters and wrap (`ClampToEdgeWrapping` on S, T and R). GLSL: `uniform highp sampler3D t; texture(t, vec3)` (`texture3D` does not exist in GLSL 3.00). It can be sampled in the vertex shader too (32 vertex texture units here).
* Share one `Uniform` object between materials (`uTime`, `uScent`) so updating `.value` once updates all.
* GLSL compile errors only appear as `console.error` ("THREE.WebGLProgram: Shader Error"); the page keeps running and `__ready` can still become true. The harness counts console errors, so `ok:false` catches them.

Multi-pass statistics
* `renderer.info` resets every `render()` call by default, so with the composer it only shows the last pass; set `renderer.info.autoReset = false` and call `renderer.info.reset()` once per frame (as the spike does) to count the whole frame.

Vite 8 / build
* Vite 8 uses Rolldown and Oxc: use `build.rolldownOptions` (not `rollupOptions`), the `oxc` option (not `esbuild`) for JSX/TS transform settings. Large chunk warning (three is about 700 kB minified): harmless for now.
* Oxc applies the JSX settings from the `tsconfig.json` that INCLUDES the file. A `.tsx` outside tsconfig `include` fails the build with `Rolldown failed to resolve import "react/jsx-runtime"`. Keep sources under `src/`, `spikes/`, `tests/` (listed in `include`), and keep `@preact/preset-vite` in the root config (it also sets the JSX import source). The harness's built-in config (used when `<root>` has no vite.config) sets `oxc.jsx.importSource: 'preact'` itself and deliberately omits the preset, because the preset injects `import "preact/debug"` into every module in dev, which cannot resolve when the root lives outside the project.
* `vite build <dir>` looks for the config in `<dir>`, not the cwd: always pass `--config vite.config.ts`; `--outDir` is relative to `<dir>` (e.g. `--outDir ../../dist/spike-stack`).
* `base: './'` makes `index.html` reference `./assets/*.js`, so the build works from any sub-path (verified at `/games/foundress/v1/` and `/a/b/c/`). Use relative URLs for every asset the game fetches (`new URL('./x.bin', import.meta.url)` or paths relative to the page), never a leading `/`.
* **Sandboxed iframe without `allow-same-origin`** (opaque origin `null`): `<script type="module" crossorigin>` is blocked with "has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header" unless the HOST sends CORS headers. `file://` has the same problem for module scripts. Fix when the host cannot be controlled: `vite build --mode classic` (one IIFE script, `defer`, no `type=module`/`crossorigin`; verified working in `<iframe sandbox="allow-scripts">`); it forbids code splitting and dynamic `import()`. Any `fetch()` for assets from such a frame is also cross-origin and needs CORS; prefer inlining or embedding assets in the bundle.
* Dev server programmatic use: `createServer({ root, configFile:false, cacheDir:<per-run tmp>, server:{ port:0, host:'127.0.0.1', hmr:false, watch:null, fs:{ allow:[projectRoot, root] } } })`; `port: 0` works and the real port is `server.httpServer.address().port`. A shared `node_modules/.vite` cache would race between concurrent processes, hence the per-run `cacheDir`. Add `resolve.dedupe: ['three']` so postprocessing and the game share one three instance.
* Vite 8 prints dev-server errors to stderr with `logLevel: 'error'`; a transform error shows up as an HTTP 500 for the module and the harness fails fast.

Headless / harness
* Software GL is slow and **asynchronous**: JS can submit frames faster than SwiftShader executes them, building a GPU backlog. Consequences measured here: `page.screenshot()` timed out (30 s) after minutes of continuous heavy rendering at ~1 fps; `page.goto('about:blank')` away from a heavy page took 3-15 s; `browser.close()` took 1-6 s (a trivial WebGL page closes in about 80 ms). Mitigations: (1) stop the render loop before screenshots in long scripts (`window.__bench` does; or expose a pause flag), (2) call the page's dispose hook (`window.__dispose()` = `setAnimationLoop(null)`, `composer.dispose()`, `renderer.dispose()`, `renderer.forceContextLoss()`) before navigating, (3) the harness gives `browser.close()` 2 s then SIGKILLs its own descendants (`timings.cleanupMs` about 2100 on heavy pages).
* Prefer deterministic stepping and a frozen animation clock (`?t=`) for screenshots; they are byte-identical for the same seed.
* `window.__ready` must be set after the first frame is really rendered (and async assets such as SMAA LUTs are loaded), otherwise screenshots catch a blank canvas.
* Playwright is global-only: resolution order in the harness is project node_modules, `NODE_PATH`, `/opt/node-tools/node_modules`, `npm root -g`. Chromium binaries live under `/opt/pw-browsers` (no executablePath needed).
* The shared checkout is used by several engineers: default output dir is `test-output/play-<timestamp>-<pid>/` so runs never overwrite each other.
* Vitest 5 runs in Node with `environment: 'node'` (`vitest.config.ts`); keep `src/sim/**` and `src/worldgen/**` free of `three`/DOM so they stay testable this way. There is no jsdom dependency.

## 8. What the spike renders (checklist from the brief)

About 100k static triangles (80,000 terrain + 28 rocks); directional light with 2048 PCFSoft shadow map (frustum 660 mm, `normalBias` 0.25 mm); 5000 `InstancedMesh` ants with per-instance `aAnim` (phase, speed, radius, random) animated in the vertex shader (circular path, heading, gait bob, lateral sway) plus a matching depth material; a 64x32x64 R8 `Data3DTexture` (scent density along a trail) sampled in the terrain fragment shader and the ant vertex shader; `Fog` (120-1250 mm); ACES Filmic tone mapping; sRGB output; post chain DoF + bloom + vignette + SMAA; flags `?post=0|1&shadows=0|1&msaa=0|1&seed=N&t=SECONDS&ants=N&hud=1&test=1`; `window.__ready`, `window.__perf()`, `window.__info()`, `window.__bench(n, warm)`, `window.__resume()`, `window.__dispose()`, `window.__stack`. Scene units are millimetres, Y up, near plane 0.5 mm, far 4000 mm; no depth-precision artefacts were visible, but this was not stress-tested at larger distances.
