# demo-generator

Turn any web app repo into a demo-video factory. Playwright drives the app,
MiniMax speaks the narration, ffmpeg assembles it, and every render is archived
with the app's commit SHA in its name so you can tell when a video has gone stale.

Self-contained: the video engine is vendored, so nothing here depends on an
upstream repo staying online.

---

## Quick start

**If an AI agent is setting this up, point it at
[1ST_TIME_SETUP.md](1ST_TIME_SETUP.md) — it runs the whole thing unattended.**

Doing it by hand:

**Prerequisites:** Node ≥ 18, ffmpeg on PATH, and ≥ 2 GB free disk.

```bash
export MINIMAX_API_KEY=sk-...     # PowerShell: $env:MINIMAX_API_KEY = 'sk-...'
node scripts/setup.mjs            # install, build, verify
node scripts/smoke-test.mjs       # prove it actually renders video
```

`setup.mjs` fails loudly with a specific reason rather than half-working.
`smoke-test.mjs` renders a short narrated video against a self-contained page in
`smoke/` — no app, no database — and asserts the output really has video and
audio streams. **That second command is the one that proves the install.**

**Next, read [docs/SOP.md](docs/SOP.md) and start at Phase 0.**

---

## Making a video

```bash
# scaffold
cp templates/flow.demo.ts     vendor/argo/demos/my-flow.demo.ts
cp templates/flow.scenes.json vendor/argo/demos/my-flow.scenes.json
cp templates/flow.config.mjs  vendor/argo/demos/my-flow.config.mjs

# render
cd vendor/argo && npx argo pipeline my-flow --config demos/my-flow.config.mjs && cd ../..

# archive
node scripts/collect-render.mjs \
  --demo my-flow --app my-app --flow my-flow \
  --lang en --app-repo "/path/to/app" --publish
```

Output lands in
`renders/my-app/my-flow/<date>__<viewport>__<lang>__app-<sha>/`, with a stable
shareable copy in `renders/my-app/published/`. See
[renders/NAMING.md](renders/NAMING.md).

---

## What's in the box

| | |
|---|---|
| `docs/SOP.md` | The process, in phases, each with a gate |
| `docs/APP-CONTRACT.md` | The five things an app must provide to be filmable |
| `docs/KNOWN-ISSUES.md` | Bugs and traps already paid for |
| `renders/NAMING.md` | Archive layout and naming rules |
| `scripts/setup.mjs` | Bootstrap + verify |
| `scripts/collect-render.mjs` | Harvest a run into the versioned archive |
| `templates/flow.*` | Scaffolding for a new video |
| `templates/app-contract/` | Drop-in `demo-mode.css` and `demo-mode.js` |
| `skills/demo-video/` | Claude Code skill — agents pick the workflow up automatically |
| `vendor/argo/` | The video engine, patched (MIT) |

---

## The three things that will bite you

**Narration written from source code lies.** Reading the DOM tells you selectors,
not what is on screen. Walk the flow and screenshot it before writing a word of
narration. The render succeeds either way — that's what makes this expensive.

**Never render against production.** Hundreds of requests and a seeded database.

**Demo mode must be presentation-only.** Disable animations, freeze the clock,
hide chrome. Never change what the app computes, or your tutorials teach an app
that doesn't exist.

---

## Credits and licence

The video engine is [argo](https://github.com/shreyaskarnik/argo) by Shreyas
Karnik, MIT licensed, vendored at commit `d2638c8` (v0.38.1, 2026-07-26) with
these changes:

- `src/tts/engines/minimax.ts` — new MiniMax TTS engine (no npm dependency)
- `src/tts/engines/index.ts` — registers it
- `src/record.ts`, `src/preview.ts` — fix `execFile('npx')`, which cannot spawn
  on Windows
- `scripts/copy-assets.mjs` — replaces a Unix-only build step that silently
  dropped shaders on Windows
- `src/tts/transcribe.ts` — lazy-load ONNX, so an opt-in feature stops breaking
  every render when its optional dependency is absent
- `package.json`, `src/optional-deps.d.ts` — all TTS providers moved to
  `optionalDependencies`; install drops from over 1 GB to 69 MB

Upstream licence retained at `vendor/argo/LICENSE`.
