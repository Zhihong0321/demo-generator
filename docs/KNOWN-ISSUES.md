# Known issues and gotchas

Everything here was hit for real. Each entry says whether the vendored argo
already fixes it or whether you still have to work around it.

---

## Argo bugs — FIXED in `vendor/argo`

### `execFile('npx', ...)` cannot spawn on Windows
**Symptom:** `Playwright recording failed:` with an empty error body, or
`spawn EINVAL`.

`npx` is a `.cmd` shim on Windows. `execFile` reports `ENOENT`, and since Node's
CVE-2024-27980 fix it reports `EINVAL` even when given the `.cmd` extension.
Argo collected only `stdout`/`stderr` into its error message, both empty, so the
real cause never surfaced.

**Fix applied:** `src/record.ts` and `src/preview.ts` resolve Playwright's JS CLI
and spawn it under `process.execPath`. Three call sites.

### Every TTS provider was a hard dependency
**Symptom:** a ~1 GB `node_modules` for a pipeline that calls one HTTP API.

`@huggingface/transformers` (which pulls `onnxruntime-node`) and `kokoro-js`
back argo's *local* TTS engines. Both are dynamically imported with graceful
"install this package" errors, but both sat in `dependencies`, so npm installed
them for everyone.

**Fix applied:** moved to `optionalDependencies`, and `setup.mjs` installs with
`--omit=optional`. The install dropped from over 1 GB to 69 MB. Ambient
declarations in `src/optional-deps.d.ts` keep `tsc` happy when they are absent.

Want a local engine? `cd vendor/argo && npm install @huggingface/transformers kokoro-js`.

### `transcribe.ts` hard-imported ONNX for an opt-in feature
**Symptom:** `ERR_MODULE_NOT_FOUND: Cannot find package '@huggingface/transformers'
imported from dist/tts/transcribe.js` — on every render, including ones that
never asked for transcription.

Word-level transcription is opt-in (`tts.transcribe`, off by default), but
`src/tts/transcribe.ts` imported its dependency statically at the top of the
module, and `src/tts/generate.ts` imports that module unconditionally. So the
entire TTS path failed to load whenever the optional package was absent.

**Fix applied:** the import is now lazy, inside `getTranscriber()`, matching the
pattern every TTS engine already used.

### `npm run build` silently drops shaders on Windows
**Symptom:** `The syntax of the command is incorrect.` during build; transitions
fail at runtime because `dist/transitions/shaders/` is empty. The build still
exits 0.

The original `copy-assets` script used Unix `mkdir -p` and `cp`.

**Fix applied:** replaced with `scripts/copy-assets.mjs`.

---

## Argo bugs — NOT fixed

### `execFileSync('rm', ...)` in `src/clip.ts`
Same class of problem, on the `argo clip` command path. Not fixed because it was
not on the critical path. If you use `argo clip` on Windows, expect it to fail.

### `demos/mobile.demo.ts` is stale
It omits `await narration.startRecording(page)`. Copying it as a template
produces a demo that runs all scenes, reports success for every scene, and then
fails with `No screencast recording found`. **Always call `startRecording`** —
`templates/flow.demo.ts` does.

---

## Things that are not bugs but will cost you an hour

### `spotlight()` rendered nothing
Verified absent at two independent timestamps inside its active window on a page
of full-bleed images. Root cause not established. If you need a highlight
effect, verify it appears in the output before building scenes around it.

### Output resolution equals viewport size, not viewport × deviceScaleFactor
`deviceScaleFactor: 2` supersamples and then downscales back to
`video.width`/`video.height`. A 390×694 viewport yields a 390×694 video, which
is soft on desktop. Set `export.outputWidth`/`outputHeight` for a larger final
render.

### `video.width`/`height` must match the demo's viewport
If they differ, the capture canvas is larger than the page and you get grey
padding around the content.

### Audio overflow freezes the final frame
If narration is longer than the recording, argo pads by holding the last frame.
`render.json` reports `overflowMs`. Anything non-zero means your scene waits are
shorter than your clips — fix the pacing rather than shipping a frozen tail.

Use `narration.durationFor(scene)` to drive waits from actual clip length.
Narration-first: synthesize audio, measure it, then hold the UI for that long.
Never record first and stretch audio afterwards.

### `scrollIntoViewIfNeeded` is imprecise inside scroll-snap containers
It can land one item off. Assert what is on screen after navigating rather than
trusting the scroll.

---

## MiniMax TTS

### GroupId is not required
Some documentation and many search results claim `?GroupId=` is mandatory on
`https://api.minimax.io/v1/t2a_v2`. It is not — a Bearer token alone returns
`status_code: 0`. The engine supports `MINIMAX_GROUP_ID` for legacy accounts but
does not send it unless set.

### Errors arrive as HTTP 200
MiniMax returns HTTP 200 with an error payload. The real success signal is
`base_resp.status_code === 0`. The engine checks this; if you write another
provider, do the same.

### Audio comes back hex-encoded
`data.audio` is a hex string by default, not base64. Decode with
`Buffer.from(hex, 'hex')`.

---

## Credentials

Set `MINIMAX_API_KEY` in the environment. Never commit it, and never write
credential-store paths or credential-reading code into this package or into any
app repo — these directories get copied, shared, and published.

```bash
export MINIMAX_API_KEY=sk-...
```
