# FOUNDRESS look-dev spike: naturalistic macro photography at ant scale

Status: spike done (throw-away code, correct findings). Code: `spikes/look/` (index.html + TypeScript modules, own
`vite.config.ts` that serves the project's `public/` CC0 assets). Screenshots: `docs/research/spike-look-img/`.
Everything below was produced by running it in this container (headless Chromium 153, SwiftShader WebGL2, three 0.187.0,
postprocessing 6.39.6) and every screenshot listed was looked at.

Units: millimetres, Y up (design seed §3). Subject: a 4 mm stand-in *Lasius niger* worker at the origin.

```
node tools/harness/play.mjs --root spikes/look --query "t=2&ui=0&quality=high" --script spikes/look/shots.mjs \
     --script-timeout 3000000 --timeout 120000 --out docs/research/spike-look-img     # all screenshots (~6 min)
node tools/harness/play.mjs --root spikes/look --query "t=2&ui=0&quality=low" --script spikes/look/bench.mjs \
     --script-timeout 3300000 --timeout 120000                                         # cost table (~25 min, run alone)
npm run typecheck                                                                       # spikes/look is in tsconfig include
```
URL flags: `?variant=midday|golden|overcast|night|underground`, `?quality=low|medium|high|ultra`, `?t=SECONDS` (freeze the
animation clock, deterministic shots), `?ui=0` (hide the variant/quality buttons), `?hud=1`. Drag = orbit, wheel = zoom.

API (`window.__spike`): `setVariant(name)`, `setQuality(name)` (async: resolves after SMAA LUTs are loaded),
`renderSync()` (one frame, waits for the GPU, returns ms), `pause()/resume()`, `bench(n, warm)`, `stageBench(n, warm, rounds)`,
`setCamera(yaw, pitch, dist, look)`, `setCameraRaw(pos, lookAt, fov)`, `setGrassParting(bool)`, `setTime(t|null)`, `info()`,
`dispose()`. `window.__ready === true` after textures, scene, first frame and the SMAA LUTs are done.

## 1. Screenshots (all 1280x720, looked at)

| File | What it shows |
|---|---|
| `high-midday.png` | Reference look. Clear sky, sun 58 deg high behind-right; ant sharp, macro DoF, soil crumbs/pebbles, clover canopy and lawn as foreground/side bokeh, paving flag edge + kerb + hedge/trunk shapes in the haze. |
| `high-golden.png` | Sun 9 deg, back-lit from front-left: long shadows toward the camera, warm haze, translucent grass glowing, rim light on the ant, bloom on the twig end and grass highlights. |
| `high-overcast.png` | After rain: no hard shadows, soft grey sky, dark saturated wet soil (porous darkening, glistening not mirror), puddles in hollows, water beads on pebbles/twig/blades, denser cool haze. |
| `high-night.png` | Moonlight (blue, desaturated, Purkinje-ish grade), faint stars, warm garden lamps turned into big bokeh discs by the DoF. |
| `high-underground.png` | Scent-lit nest chamber: dark warm ambient, a warm pool of light and fresnel glow around the controlled ant, drifting scent motes concentrated along the tunnel, cool daylight leaking down the tunnel mouth and dying off with depth. |
| `quality-{low,medium,high,ultra}-midday.png`, `quality-*-underground.png` | Same frame at each preset (low: no DoF/bloom/shadows, half resolution). |
| `grass-parting-on.png` / `grass-parting-off.png` | Camera pulled back 210 mm into the lawn, looking at the ant: with parting (`setGrassParting(true)`) the blades on the line of sight bend away and dither out, the clover and the soil patch stay visible; without it the frame is a wall of out-of-focus blades. |
| `wind-t2.png` / `wind-t3_2.png` | Wide golden-hour view of the lawn edge at clock times 2.0 s and 3.2 s: vertex-shader sway (travelling gusts + flutter). Measured difference between the two PNGs: mean 1.4/255 per channel, 19,038 pixels changed by more than 16/255 (static scene otherwise byte-identical), i.e. only the blades moved. |

## 2. The recipe

### 2.1 Renderer and frame

```ts
const renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
renderer.toneMapping = NoToneMapping;           // ACES runs in the post chain
renderer.toneMappingExposure = variant.exposure; // IS honoured by postprocessing's ToneMappingEffect (verified: night = 7.0)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;         // r187: PCFSoftShadowMap was REMOVED (warns, falls back); PCF + shadow.radius = Vogel-disk soft PCF
renderer.setPixelRatio(preset.resScale);        // resolution scale; CSS size stays the window
camera = new PerspectiveCamera(50, aspect, 1 /* 0.5 underground */, 40000);
```
* Colour pipeline: everything linear HDR, HalfFloat composer buffers, ACES Filmic in `ToneMappingEffect`, then a small
  custom `GradeEffect` (saturation, lift/gain, contrast), vignette, then SMAA/FXAA on the display-referred image.
* Depth: near 1 mm / far 40 m with the standard depth buffer showed no artefacts at the subject; the hedge/wall at 10-11 m
  are fog and bokeh anyway. Logarithmic depth would break the depth-based DoF; do not use it.

### 2.2 Camera and composition (the "macro" part)

* Third-person orbit around the subject: distance 18 mm (4.5 BU), pitch 0.30 rad, look target 7 mm ahead and 4.5 mm
  above the ant. vFOV 50 deg. The ant fills ~15 % of the frame width; the horizon sits in the upper third.
* At this scale the visible world near the subject is tiny: at 50 mm depth the frame is only ~80 mm wide. Props must be
  placed within 10-150 mm of the subject to appear at all; anything taller than ~25 mm (clover at 40-80 mm, grass at
  40-120 mm, a dandelion at 150 mm) leaves the top of the frame and becomes a canopy/bokeh shape. That is correct and it is
  the strongest scale cue - design the world generator's "hero dressing" for this (small things near paths).
* A 14 mm paving-flag step at 100 mm reads like a wall, the 115 mm kerb at 1 m like a cliff, the hedge/trunk at 4-10 m like
  mountains. Keep large silhouettes in every biome's background.

### 2.3 Sun, sky, image-based light

* Sky = analytic dome shader (`sky.ts`): zenith/horizon gradient, Mie-like glow lobes around the sun, sun disc, optional
  overcast flattening and stars, ground hemisphere = ground bounce radiance. The same dome is baked with
  `PMREMGenerator.fromScene` (no sun disc; the DirectionalLight carries the sun) into `scene.environment` -> ambient and
  reflections always match the visible sky. Re-bake on variant change (a few hundred ms in SwiftShader, ~ms on a GPU).
* Sun = one `DirectionalLight` with shadows, its target following the subject.
* Units: three physical units, linear colours. Ratios follow nature (clear sky diffuse ~1/5 of the sun, overcast ~1/6 of a
  sunny day, moonlight many stops down); the exposure then plays the photographer.

| Variant | Sun / moon (elev, azim rel. to view, colour, intensity) | Sky zenith / horizon (linear) | Env | Fog (FogExp2 colour, density /mm) | Exposure | Bloom (int, thr) | Grade sat. | Other |
|---|---|---|---|---|---|---|---|---|
| midday | 58 deg, 128 deg, (1.0, 0.95, 0.88), 3.3 | (0.08, 0.18, 0.50) / (0.40, 0.48, 0.60), glow 0.6 | 1.0 | (0.38, 0.46, 0.58), 0.00008 | 1.0 | 0.35, 1.1 | 1.05 | wind 0.10 |
| golden | 9 deg, -28 deg (back-light), (1.0, 0.52, 0.20), 3.0, shadow radius x1.3 | (0.06, 0.09, 0.20) / (0.75, 0.42, 0.20), glow 2.6 | 0.9 | (0.62, 0.36, 0.17), 0.00016 | 1.8 | 0.6, 0.95 | 1.08 | translucency x1.4, wind 0.14 |
| overcast (after rain) | 52 deg, 150 deg, (0.85, 0.90, 1.0), 0.45, shadow radius x3.5 | (0.36, 0.38, 0.42) / (0.46, 0.48, 0.52), overcast 1 | 0.85 | (0.36, 0.39, 0.43), 0.00018 | 1.6 | 0.45, 1.0 | 1.0 | wet 1, droplets, wind 0.04 |
| night | moon 38 deg, 105 deg, (0.60, 0.72, 1.0), 0.5 | (0.004, 0.007, 0.018) / (0.014, 0.018, 0.032), stars 0.6 | 1.0 | (0.012, 0.015, 0.026), 0.00014 | 7.0 | 0.8, 1.2 | 0.7, gain (0.92, 0.98, 1.10) | wet 0.15, warm lamps (emissive 1.6-3 x colour, fog off) |
| underground | none | (env = midday sky, attenuated per vertex) | 6.0 (x exp(-d/38 mm) x AO) | (0.030, 0.017, 0.008), 0.011 | 3.2 | 0.7, 0.8 | 0.95, warm gain | hemisphere (0.60, 0.36, 0.17)/(0.30, 0.16, 0.07) x0.6, ant PointLight (1.0, 0.62, 0.32) 7 cd, range 80 mm, decay 1.4, rim emission 0.06 |

Fog: `FogExp2` (fog factor `1 - exp(-(density*d)^2)`): midday 0.00008 gives ~6 % at 3 m, 37 % at 8.5 m - the near world
stays clear, the background turns into haze. The fog colour equals the sky horizon so the dome and the fogged geometry
meet without a seam (both go through the same ACES pass).

### 2.4 Shadows

* One directional shadow map whose orthographic frustum is centred 0.55 x half-width ahead of the subject (texel density
  where the eye is): Medium 1024 / +-220 mm (0.43 mm/texel), High 2048 / +-260 mm (0.25 mm/texel), Ultra 4096 / +-320 mm
  (0.16 mm/texel). `bias -0.0003`, `normalBias 0.12` (mm), camera near 1 / far 4000, light 2 m from the target.
* Softness = `shadow.radius` (2 / 3 / 4 texels) x per-variant factor (overcast 3.5). Real sun penumbra is 0.0093 x
  occluder distance (0.5 mm for a 50 mm grass blade) - the High radius matches that.
* Thin parts (legs 0.1 mm, antennae) are below the shadow texel size: the ant also gets a **contact-shadow decal**
  (soft black ellipse, opacity 0.38) under the body. Background (> 0.5 m) is outside the map and unshadowed; DoF and haze
  hide it, but for gameplay cameras that look far, use 2-3 cascades (three's `CSM` addon or a custom split).
* Vertex-animated meshes need `customDepthMaterial` with the same vertex patch (grass, curled leaves), otherwise the
  shadow shows the undeformed geometry (confirmed again).

### 2.5 Depth of field (macro)

postprocessing's `DepthOfFieldEffect`, auto-focus `dof.target = subject centre`. Two changes make it read as macro:

1. **Physical CoC shape.** The stock CoC is `smoothstep(0, focusRange, |d - focus|)` (linear in world distance). A lens
   has CoC ~ |1 - focus/d|: the foreground blurs much faster than the background. Patched at construction:
   ```ts
   const cm = dof.cocMaterial as unknown as { fragmentShader: string; uniforms: Record<string, Uniform>; needsUpdate: boolean };
   cm.fragmentShader = cm.fragmentShader
     .replace('uniform float focusRange;', 'uniform float focusRange;uniform float cocDead;uniform float cocRange;')
     .replace('float magnitude=smoothstep(0.0,focusRange,abs(signedDistance));',
              'float magnitude=smoothstep(cocDead,cocDead+cocRange,abs(1.0-focusDistance/max(distance,1e-3)));');
   cm.uniforms.cocDead = deadU; cm.uniforms.cocRange = rangeU; cm.needsUpdate = true;
   ```
   Surface: dead 0.06 (the whole 4 mm ant stays sharp at 18 mm), range 0.8 (fully soft from ~0.5x and ~8x the focus
   distance). Underground: dead 0.14, range 1.4 (walls must stay readable).
2. **Blur size relative to the frame.** `bokehScale` is in texels of the DoF buffer (kernel radius <= 1); set it from the
   frame: `bokehScale = bokehFrac * canvasHeightPx * dofRes`, bokehFrac 0.032-0.035 (max blur radius ~3.5 % of the frame
   height = ~25 px at 720p). The stock defaults (bokehScale 1-3) give a barely-blurred, "miniature" look.

### 2.6 Bloom, tone mapping, grade, vignette, AA

`BloomEffect({ mipmapBlur: true, luminanceThreshold 0.8-1.2, intensity 0.35-0.8, radius 0.7, levels 4/6/7 })` - subtle,
HDR-thresholded: sun glints, wet highlights, droplets, lamps. ACES desaturates very bright emitters to white: night lamps
must stay at modest HDR values (x1.6-3) to keep their colour. Vignette offset 0.32, darkness 0.45-0.7. SMAA (HIGH/ULTRA)
in its own EffectPass after the main pass; FXAA on Low/Medium. One merged EffectPass holds DoF + bloom + ACES + grade +
vignette (`post.ts`).

### 2.7 Materials and shader patches (`shaders.ts`, all `onBeforeCompile` on `MeshStandardMaterial`)

**Surface mapping** (terrain, flags, kerb, pebbles, joint sand, bark/brick in the background, nest walls): world-space
triplanar (or planar-Y on Low/Medium for the near-flat terrain) with whiteout-blended normal maps, dual scale
(near tile -> x6.3 tile with distance, crossfade between 3x and 12x the near tile size) against tiling, macro tint noise,
two-layer height-aware splat (soil_garden + humus_forest grit, weight from a vertex mask), grime line on hardscape.
```glsl
void lkSample(sampler2D ta, sampler2D tn, sampler2D tr, vec3 p, vec3 n, float sc, float ns, out vec3 alb, out vec3 nw, out float rg) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec3 sg = sign(n + 1e-5);
  vec2 ux = p.zy / sc; ux.x *= sg.x; vec2 uy = p.xz / sc; uy.x *= sg.y; vec2 uz = p.xy / sc; uz.x *= -sg.z;
  alb = texture2D(ta, ux).rgb * w.x + texture2D(ta, uy).rgb * w.y + texture2D(ta, uz).rgb * w.z;
  rg  = texture2D(tr, ux).g * w.x + texture2D(tr, uy).g * w.y + texture2D(tr, uz).g * w.z;
  vec3 tx = texture2D(tn, ux).xyz * 2.0 - 1.0, ty = texture2D(tn, uy).xyz * 2.0 - 1.0, tz = texture2D(tn, uz).xyz * 2.0 - 1.0;
  tx.xy *= ns; ty.xy *= ns; tz.xy *= ns;  tx.x *= sg.x; ty.x *= sg.y; tz.x *= -sg.z;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  nw = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);       // world normal; then normal = (viewMatrix * nw).xyz
}
```
Texture scales (mm per tile): soil 95, humus grit 150, sand in joints 40, concrete aggregate (gravel_fine pulled 60 %
toward a cement grey) 140, pebble grain 9, asphalt 260, bark (twig, UV-mapped) one tile per circumference, bark trunks
700, brick 900. At these scales soil crumbs are 1-4 mm - "boulders" for the ant, which is the point.

**Wetness** (uniform `uWet`, per-material `wetDarken`/`wetRough`): porous albedo darkening (soil x0.5, concrete x0.72,
stone x0.7) plus +35 % saturation, roughness `max(wetRough, r * 0.55)` (soil 0.72, concrete 0.35, stone 0.18), puddles where
a hollow mask (inverse of the meso relief) crosses a noisy threshold: roughness 0.03, flat normal, albedo x0.55. Lesson:
at an ant's grazing view angles Fresnel turns any smooth wet surface into a silver mirror of the sky; soil must stay
rough (0.7) and only puddles may be mirrors.

**Translucency** for grass/leaves/clover/dandelion, inside three's directional-light loop so it is shadowed by the same
shadow map (`translucency()` rewrites `lights_fragment_begin`):
```glsl
// after RE_Direct(...) in the NUM_DIR_LIGHTS loop
float fwd  = pow(saturate(dot(geometryViewDir, -directLight.direction)), 6.0);   // looking toward the sun through the blade
float back = saturate(dot(-geometryNormal, directLight.direction));              // lit from behind
lkTransl += directLight.color * (0.55 * back + 1.6 * fwd * (0.35 + back));
// after the loop:
reflectedLight.directDiffuse += uTransl * strength * lkTransl * diffuseColor.rgb * tint * RECIPROCAL_PI;
```

**Water droplets** (InstancedMesh of squashed spheres, roughness 0.03): no transmission pass; specular from the env plus
a refracted "sky core" emission (bright centre, dark Fresnel rim):
`totalEmissiveRadiance += sky_up(rough 0.5) * envMapIntensity * (0.12 + 0.75 * pow(dot(N, V), 1.5)) * 0.7`.

**Ant cuticle** (stand-in): `MeshPhysicalMaterial` roughness 0.5, clearcoat 0.45 (0.95 wet), clearcoat roughness 0.3,
sheen 0.3 (pubescence), dark brown vertex colours; underground adds a fresnel rim emission `uRim * (1 - N.V)^2.5`.

**Fallen leaves**: CC0 atlases (maple 4x4 cells 2:1, dry oak 4x4) on instanced 12x6 cards, per-instance atlas cell and
curl/cup in the vertex shader (analytic normal), alpha-tested with the opacity map, matching `customDepthMaterial`.
Sizes 95-175 mm (the leaf occupies ~60 % of its atlas cell). Clover: procedural canvas texture (chevron, veins).

### 2.8 Grass technique (`grass.ts`)

* One procedural blade (rows x 3 vertices: edge, folded midrib, edge; tip vertex) in `InstancedBufferGeometry`
  (not `InstancedMesh`: no wasted instanceMatrix). Per-instance attributes `iRoot` (xyz), `iShape` (height, width, yaw,
  random), `iBend` (lean, curvature, hue shift, atlas strip).
* Vertex shader: length-preserving centreline for a bend angle growing linearly along the blade
  (`x = (cos a - cos(a + b h)) / b`, `y = (sin(a + b h) - sin a) / b`), width profile (parallel, tapering in the top 30 %),
  V fold, rounded normal; then **one Rodrigues rotation about the root whose angle grows with height** for wind + parting,
  so blades curve instead of hinging or stretching.
* Wind: `phase = dot(root.xz, windDir) * 0.006 - t * 1.7` (gusts travelling across the lawn), gust envelope
  `0.55 + 0.45 sin(phase) sin(0.43 phase + 1.7)`, flutter `0.18 sin(t (5 + 4 rnd) + 40 rnd)`, scaled by 60/H (short blades
  are stiffer), `uWind` 0.04-0.14 rad.
* Parting: distance from the root to the segment camera -> subject (+6 mm beyond the subject); within
  `R = 22 mm + 0.25 H` the blade bends away (up to 1.3 rad) and dither-fades (screen-door discard on a pixel hash, keeps the
  opaque pipeline, shadows and depth for DoF); blades within 8-22 mm of the eye fade too. Uniforms `uCamPos`/`uSubject`
  are set from the real view camera (in shadow passes `cameraPosition` is the light camera).
* Colour: the CC0 grass atlas (7 curved scanned blades) is **straightened at load time** on a 2D canvas: for each atlas row
  the opacity map gives the blade's top/bottom edge per column, which is resampled into a 256 x 16 strip (base -> tip,
  edge -> edge). The blade shader samples `(h, strip + s)`; plus hue jitter, dry tips on 40 % of blades, base darkening
  (AO). Back-lit translucency (2.7).
* Density: rejection-sampled from the lawn mask; full density near the subject, beyond 250 mm progressively fewer but up to
  2.2x wider blades; none beyond 1.7 m where the terrain shader blends to a lawn albedo. Chunked into 250 mm cells (one draw
  each, bounding sphere padded by blade height) so frustum culling works in the main and shadow passes.
* Counts: Low 2,500 (4 rows, flat), Medium 6,000 (5 rows), High 12,000 (7 rows), Ultra 20,000 (9 rows). 13-37 triangles per
  blade.

### 2.9 Underground ("scent-lit")

* Cavity = field `f(p) > 0` in free space, exactly the design-seed convention: `f = max(y - surface, smax(chamber, tunnel
  capsules, 4 mm) + noise)`; chamber 60 x 48 mm, 19 mm high with a flatter floor, tunnel radius 4.4 mm (2.2 BU wide),
  funnel at the entrance. Polygonised with naive surface nets (production: marching cubes on the carve grid) at 0.6-1.2 mm
  cells (Ultra 0.6: 3.2 M cells, ~2.5 s in JS on load; must move to a worker/WASM or the real carve-grid mesher).
* Per vertex: `aDepth.x` = path length from the entrance along the tunnel, `aDepth.y` = SDF ambient occlusion (two taps
  along the normal). Shader: `iblIrradiance *= exp(-d / 38 mm) * AO; radiance *= same; irradiance *= AO` -> daylight (the
  midday sky env at 6x) floods the entrance and dies along the tunnel; the chamber is lit by a dim warm hemisphere and the
  ant's warm point light. Underground fog FogExp2 (0.030, 0.017, 0.008) at 0.011/mm gives depth in a 60 mm room.
* Scent motes: 380 additive points (HDR colour, bloom picks them up), 55 % on the trail path, slow drift + twinkle,
  brighter within ~18 mm of the ant, faded within 6-14 mm of the eye (otherwise huge bokeh discs).

## 3. Quality presets and measured cost

See `quality.ts`. Everything that scales cost is in the preset:

| | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Resolution scale | 0.5 | 0.75 | 1.0 | 1.0 |
| Shadows | off | 1024, +-220 mm, r2 | 2048, +-260 mm, r3 | 4096, +-320 mm, r4 |
| Post | ACES + grade + vignette + FXAA | + DoF (0.35 res) + bloom (4 levels) | DoF 0.5 res, bloom 6, SMAA high | DoF 0.75 res, bloom 7, SMAA ultra |
| Grass | 2,500 x 4 rows flat | 6,000 x 5 folded | 12,000 x 7 | 20,000 x 9 |
| Pebbles / leaves / droplets | 300 / 14 / 120 | 700 / 26 / 250 | 1,400 / 45 / 450 | 2,600 / 70 / 700 |
| Terrain grid | 160^2, planar, 1 layer | 240^2, planar, 2 layers | 320^2, planar, 2 layers, dual scale | 420^2, triplanar, 2 layers, dual scale |
| Hardscape (flags, kerb, road) | triplanar, single scale | triplanar, single scale | triplanar, dual scale | triplanar, dual scale |
| Anisotropy / nest cell | 1 / 1.2 mm | 4 / 1.0 mm | 8 / 0.8 mm | 16 / 0.6 mm |

Measured with `spikes/look/bench.mjs` (1280x720 viewport, SwiftShader on 4 CPU cores, sync frames ending in a 1-pixel `readPixels`, median of 4 individually timed frames after 1 warm-up frame per configuration, all configurations interleaved in 2 rounds, minimum kept). Absolute numbers are software rendering (a real GPU is 50-200x faster); use the **ratios**. Stage cost = full frame minus the frame with that stage removed (delta method), so the parts do not sum exactly to the total (overlap, overdraw, noise +-15 %).

#### Midday frame, per preset

| | low | medium | high | ultra |
|---|---|---|---|---|
| Render size (px) | 640x360 | 960x540 | 1280x720 | 1280x720 |
| Draw calls / triangles (all passes) | 56 / 161k | 104 / 501k | 115 / 966k | 123 / 1768k |
| **Full frame (ms)** | **309** | **1065** | **2286** | **4554** |
| Relative to High | 14 % | 47 % | 100 % | 199 % |
| DoF | - | 121 (11 %) | 224 (10 %) | 753 (17 %) |
| Bloom | - | 70 (7 %) | -54 (-2 %) | 283 (6 %) |
| AA (FXAA / SMAA) | -1 (-0 %) | 58 (5 %) | 94 (4 %) | 375 (8 %) |
| Whole post chain beyond tone map/grade/vignette | 2 (1 %) | 206 (19 %) | 385 (17 %) | 1130 (25 %) |
| Shadow map pass | - | 86 (8 %) | 167 (7 %) | 828 (18 %) |
| Grass (main + shadow) | 14 (4 %) | 15 (1 %) | 32 (1 %) | 913 (20 %) |
| Terrain (graded grid + far ring) | 65 (21 %) | 241 (23 %) | 407 (18 %) | 1525 (33 %) |
| Small props (pebbles, leaves, twig, clover, dandelion, drops) | 45 (14 %) | 223 (21 %) | 579 (25 %) | 1660 (36 %) |
| Hardscape (flags, joints, kerb, road) | 66 (21 %) | 161 (15 %) | 452 (20 %) | 907 (20 %) |
| Background (trunks, hedge, shrubs, wall) | 32 (10 %) | 56 (5 %) | 64 (3 %) | 348 (8 %) |
| No composer at all (direct render + ACES) | 301 | 887 | 1979 | 3506 |

#### Full frame per variant (ms)

| | low | medium | high | ultra |
|---|---|---|---|---|
| midday | 309 | 1065 | 2286 | 4554 |
| golden | 346 | 1067 | 2602 | 4336 |
| overcast | 306 | 1084 | 2543 | 4210 |
| night | 294 | 1038 | 2441 | 4364 |
| underground | 225 | 616 | 1233 | 1447 |

#### Underground frame, per preset

| | low | medium | high | ultra |
|---|---|---|---|---|
| Draw calls / triangles | 8 / 62k | 27 / 83k | 33 / 121k | 35 / 204k |
| **Full frame (ms)** | **235** | **588** | **1196** | **1424** |
| Nest walls (triplanar soil, day-depth) | 202 (86 %) | 353 (60 %) | 637 (53 %) | 669 (47 %) |
| Scent motes | 13 (5 %) | -48 (-8 %) | -29 (-2 %) | 112 (8 %) |
| DoF | - | 86 (15 %) | 245 (20 %) | 441 (31 %) |
| Bloom | - | 37 (6 %) | 6 (0 %) | 133 (9 %) |
| AA | 2 (1 %) | 6 (1 %) | 66 (6 %) | 258 (18 %) |

Raw numbers: `docs/research/spike-look-img/bench-result.json`. Negative deltas (High bloom, Medium/High motes) are noise.
On Ultra the stage deltas add up to more than the frame because removing an object removes it from both the main and the
4096 shadow pass, and the Ultra run was noisier.

What the numbers say
* **Preset ladder**: Low ~ 1/7, Medium ~ 1/2, Ultra ~ 2x the High frame. The resolution scale is the biggest single
  lever (Low and Medium differ mainly by pixels), then the post chain and the shadow-map size.
* **Fragment cost of the surfaces dominates**, not triangles: terrain + hardscape + small props are 55-65 % of every
  surface frame. The triplanar / dual-scale samplers (9-18 texture fetches per pixel per layer) are the expensive part;
  in production use planar mapping wherever the normal is near-vertical, triplanar only on steep faces (branch on the
  normal), and drop dual scale beyond High.
* **Small props** (1,400-2,600 instanced grit pebbles with a triplanar material, dense hero stones, leaf cards) are
  21-36 %: give grit an LOD (impostor dots or a texture-only "grit layer" in the terrain beyond ~150 mm) and a planar
  material.
* **Post chain** (DoF + bloom + SMAA/FXAA) is 17-25 % of the frame; DoF is the largest part (10-17 %), SMAA 4-8 %,
  bloom <= 7 %. Rendering without the composer at all only saves 13-23 %, so the look is not "expensive post" - keep it.
* **Shadow pass** 7-8 % at 1024/2048, 18 % at 4096 (more casters in a bigger frustum).
* **Grass** is cheap up to High (1-4 %) because the 250 mm chunks are frustum-culled in both passes and most of the
  lawn is off-screen in a macro frame; Ultra's 20,000 blades x 9 rows (37 tris) plus the 4096 shadow map cost 20 %.
  The real risk is a camera looking across a lawn: budget by the blades in the frustum (wrapping tiles, section 5).
* **Underground** frames are half the cost of surface frames; the nest walls (full-screen triplanar soil) are 47-86 %,
  the motes ~5 %.
* Per variant the cost is within +-15 % (golden hour slightly higher: long low-sun shadows cover more of the frame).


## 4. Problems encountered (and fixes)

1. **`material.envMapIntensity` is ignored when the env comes from `scene.environment`** (three r187: the renderer sets
   the uniform to `scene.environmentIntensity`). Brood, roots and the ant in the nest reflected the full daylight sky.
   Fix: assign `material.envMap = env` explicitly on materials that need their own IBL strength.
2. **`PCFSoftShadowMap` is removed in r187** (warning + fallback to PCF). Use `PCFShadowMap` with `shadow.radius`
   (Vogel-disk PCF, soft). The stack spike still uses the old constant.
3. **Stock DoF reads as "miniature", not "macro"**: linear CoC and a texel-sized bokehScale. Fixed by the CoC patch and a
   frame-relative bokehScale (2.5).
4. **Wet soil looked like mercury**: grazing view angles + low roughness = Fresnel mirror of a bright overcast sky. Wet soil
   now keeps roughness >= 0.72 and only puddles are mirrors; a dry margin is kept around the spike's hero spot (puddles
   under the subject are physically fine but unreadable).
5. **A sprite halo for the ant glow became a giant disc** at 15 mm camera distance (and DoF made it worse). Replaced by a
   fresnel rim emission + a warm point light; the halo sprite is kept at 2.5 % strength.
6. **ACES turns bright emissive lamps white**; keep night emitters at modest HDR values, desaturate the grade less (0.7).
7. **SSAO is not usable as-is**: postprocessing's `NormalPass` renders with an override material, which ignores the
   `onBeforeCompile` vertex code of the grass/leaves (normals of un-deformed blades at the origin). Ultra therefore has no
   SSAO. Contact darkening comes from the shadow map, the contact decal, base-darkened blades, the per-vertex grass-density
   AO on the terrain and the SDF AO in the nest.
8. **Composition at true scale is hard**: most props first ended up outside the 30-80 mm wide view, tall plants left the
   frame, and a camera at ant-eye height sees only soil. The framing in 2.2 is the result of ~10 iterations.
9. **Egg-like pebbles**: smooth lumpy spheres read as eggs at macro distance. Fracture planes (2-4 random cuts) on a dense
   mesh for the few hero stones near the subject; small grit stays low-poly and is capped at 1.8 mm.
10. **three sorts opaque objects by program/material before depth**, so large expensive surfaces are not drawn
    front-to-back; overdraw of the triplanar materials is a measurable cost in software GL (see the stage table).
11. SwiftShader timings are noisy: the same High frame measured 2.4 s in one run and 4.8-5.0 s in another an hour later
    (nothing else running), and single configurations showed 2x outliers. The stage bench therefore times every frame
    separately (median of n) and interleaves all configurations in 2 rounds keeping the minimum; still treat stage deltas
    under ~5 % as noise.
12. **The DoF effect caches camera near/far** in its CoC material at construction. Switching to the underground variant
    (near 0.5 mm) and rebuilding the composer there, then returning to the surface (near 1 mm), silently moved the focus
    plane to ~100 mm (ant blurred away). Fix: `dof.cocMaterial.adoptCameraSettings(camera)` after every near/far change.
13. Random dressing placement must not depend on instance counts (quality presets): the leaves first used one RNG stream
    for both atlases, so a different count on Ultra dropped a leaf in front of the lens. One seeded stream per prop set.
14. Hardscape was first built once with dual-scale triplanar for all presets and cost ~40 % of the Low frame (fragment
    bound); it is now rebuilt per preset (dual scale only on High/Ultra).

### Known weaknesses of the spike images (self-critique)

* The stand-in ant is a smooth glossy toy (ellipsoids, no hairs, no sculpted sclerites); the production model from
  `spikes/ants` must replace it before judging the subject read.
* Background shrubs/hedge are lumpy icospheres: they work only because they are always far, hazy and at maximum blur.
  Real foliage bokeh (bright sky holes through leaves) would sell the garden much more - consider a few camera-facing
  "foliage bokeh" cards per biome.
* Golden hour: the low sun sits behind the hedge line from this camera, so there is no sun disc/flare in frame; the
  back-light, translucency and haze carry the mood instead.
* Night: the garden lamps bloom to a pale yellow rather than a rich amber (ACES + the night desaturation); a per-emitter
  "keep hue" treatment or a hue-preserving tone map (AgX/Neutral) is worth testing.
* Clover leaflets are simple procedural cards with a painted chevron; at 20-80 mm above the ant they are mostly bokeh, which
  hides it.
* Grit/pebbles are better after the fracture planes, but small instanced grit still reads slightly "beady" up close.
* Only one hero framing was art-directed; other camera angles were checked with the debug views but not polished.

## 5. Recommendations for production

1. Keep this pipeline: HalfFloat composer, one merged EffectPass (DoF + bloom + ACES + grade + vignette), SMAA in a
   second pass, PMREM of an analytic sky dome as the only ambient source, one shadow-casting sun with a subject-centred
   frustum (add 2 cascades if gameplay cameras look far).
2. Make the macro DoF a first-class camera setting: the physical CoC patch, `bokehFrac` relative to the frame, dead zone
   that covers the whole possessed ant; reduce DoF (larger dead zone/range) in tunnels and for the colony/observer camera.
3. Grass: move to camera-centred wrapping tiles (instances re-rooted in the vertex shader from a heightfield texture) so
   the cost is independent of world size; keep chunk culling, the length-preserving bend, the parting/dither and the
   straightened-atlas colour. Medium (6k blades) is the budget target for integrated GPUs; Low must fall back to the
   terrain lawn tint plus few blades.
4. Material system: one `surface()` patch with defines (triplanar/planar, layers, dual scale, wetness, puddles, grime,
   day-depth) per biome material; wetness/darkening parameters per material in data, driven by a global weather state.
5. Underground: generate `aDepth` (path length to the nearest entrance) from the nest-nav BFS distance field the kernel
   already has (design seed §4) and AO from the carve field; light = hemisphere + controlled-ant point light + daylight
   IBL x exp(-depth / 38 mm). Motes from the pheromone grid (spawn where trail density is high).
6. Translucency in the light loop (one string patch) is cheap and is what makes golden hour; keep it for all foliage.
7. SSAO/GTAO only with a real normal G-buffer (MRT) or a depth-only AO; until then rely on contact decals, baked/SDF AO
   and blade base darkening.
8. Never put mirror-smooth surfaces where the ant camera looks at grazing angles unless they are meant to be water.
9. Budget per quality and measured stage costs are in section 3; the biggest levers are resolution scale, the post
   chain and fragment cost of the triplanar surfaces, not triangle counts.
