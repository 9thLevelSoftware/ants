# Headless visual-test harness (`play.mjs`)

Runs a page in headless Chromium with software WebGL2 (SwiftShader), screenshots it, and reports
errors as one JSON line. Many engineers can run it concurrently: each run starts its own server on
an ephemeral port and its own browser.

```
node tools/harness/play.mjs --root <dir containing index.html>
     [--query "test=1&seed=7"] [--script <file.mjs>] [--out <dir>]
     [--width 1280] [--height 720] [--timeout 60000] [--static]
     # extras: --mount /sub/dir/  --no-ready  --script-timeout ms  --ignore <regex>  --channel chromium  --dpr 1  --verbose
```

| Option | Meaning |
|---|---|
| `--root` | Directory with `index.html`. Default mode serves it with a programmatic **Vite dev server** (TypeScript/TSX and bare imports such as `three` work, no build). If `<root>/vite.config.*` exists it is used. |
| `--static` | Serve the directory as plain static files (use for `vite build` output). |
| `--mount /a/b/` | With `--static`: serve the directory *under that URL prefix only*. Proves a build works from a sub-path (root-absolute URLs 404). |
| `--query` | Query string appended to the page URL (`test=1&seed=7&quality=low`). |
| `--script` | `.mjs` whose default export is `async ({ page, shot, log, wait, url, context, browser, out, query, root }) => result`. |
| `--out` | Screenshot directory. Default `test-output/play-<timestamp>-<pid>/` (git-ignored). |
| `--no-ready` | Do not wait for `window.__ready === true`. |
| `--ignore` | Regex; matching console/request errors are not counted (repeatable). |

Page contract: set `window.__ready = true` once the first frame is really rendered. If the page throws
or a script fails to load, the harness gives up 5 s later instead of waiting out `--timeout`.

Script helpers: `shot(name)` saves `<out>/<name>.png` and returns its path; `log(...)` goes to stderr
and `summary.logs`; `wait(ms)`, `wait(fnOrString)` (= `page.waitForFunction`), `wait.frames(n)`; whatever
the script returns appears in `summary.result`.

Output: human log on **stderr**; the **last line of stdout** is one JSON object
`{ ok, ready, errors, screenshots, timings, out, url, logs, result }`. Exit code 1 if there is any page
error, console error, failed/4xx/5xx request (except favicon), `__ready` never appears, or the script throws.
Browser and server are always shut down (finally + SIGINT/SIGTERM/SIGHUP + watchdog). Under software GL
`browser.close()` can stall behind the GPU backlog, so after 2 s the harness SIGKILLs its own child
processes; `timings.cleanupMs` shows this (about 2000 ms on heavy pages).

Always LOOK at the screenshots (Read tool on the PNG). A black or empty image is a failure.

## Example 1: one screenshot of a spike

```
node tools/harness/play.mjs --root spikes/stack --query "test=1&seed=7&t=3"
# stderr: [harness] serving ... ; stdout last line: {"ok":true,"screenshots":["/.../test-output/play-.../page.png"],...}
```

## Example 2: a script that drives the page

`my-script.mjs`:
```js
export default async ({ page, shot, log, wait }) => {
  await shot('start');
  await page.keyboard.press('Space');             // any Playwright API
  await wait.frames(30);                          // 30 rAFs
  log('perf ms', await page.evaluate(() => window.__perf()));
  await page.setViewportSize({ width: 640, height: 360 });
  await wait.frames(5);
  await shot('small');
  return { frames: await page.evaluate(() => window.__info().frames) };
};
```
```
node tools/harness/play.mjs --root spikes/stack --script my-script.mjs --width 1280 --height 720
```

## Example 3: a production build served from a sub-path

```
npm run build:spike                                   # -> dist/spike-stack (relative URLs, base "./")
node tools/harness/play.mjs --static --mount /games/foundress/v1/ --root dist/spike-stack
```

## Tests in Node (no browser)

`npm test` runs vitest in a plain Node environment (`vitest.config.ts`, `tests/**`, `src/**/*.test.ts`).
Sim and worldgen code must be testable this way (no `three`, no DOM).

## Notes
* Playwright is the **global** install (resolved via project -> `NODE_PATH` -> `/opt/node-tools` -> `npm root -g`); it is not an npm dependency. Do not run `playwright install`.
* Software rendering is slow (the stack spike with everything on takes ~0.6-1.2 s/frame at 1280x720; with post, MSAA and shadows off about 0.25 s). Use small viewports and `?quality=low`-style flags for iteration; see `docs/research/tech-stack.md` for numbers.
* Before navigating a heavy WebGL page away inside a script, call your page's dispose hook (the spike has `window.__dispose()`) or navigation can stall for seconds.
