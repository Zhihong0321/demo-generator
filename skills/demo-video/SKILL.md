---
name: demo-video
description: Produce narrated tutorial/demo videos of a web app by driving it with Playwright, narrating with MiniMax TTS, and assembling with ffmpeg. Use when the user asks to create demo videos, tutorial videos, product walkthroughs, screencasts, or app onboarding videos for a repo, or to set a repo up so it can produce them. Also use for questions about the render archive, the App Contract, demo mode, or why a rendered video is wrong.
---

# Demo video pipeline

You are working inside a self-contained package that turns a web app repo into a
demo-video factory. Everything you need is in this directory.

## Read these before acting

| File | What it settles |
|---|---|
| `docs/SOP.md` | The phase order and the gate at each phase. **Follow it.** |
| `docs/APP-CONTRACT.md` | The five things an app must provide |
| `docs/KNOWN-ISSUES.md` | Bugs and traps already paid for — check here first when something fails |
| `renders/NAMING.md` | Archive layout and naming rules |

## First run on a new machine

**Follow [`1ST_TIME_SETUP.md`](../../1ST_TIME_SETUP.md) and run it yourself.**
Do not hand the user a list of commands. It covers preflight, the API key, the
install, and a smoke test that proves the pipeline actually renders video.

The short version:

```bash
node scripts/setup.mjs        # install, build, verify
node scripts/smoke-test.mjs   # prove it renders — this is the real gate
```

Ask the user for `MINIMAX_API_KEY` directly. Never search their credential
stores for it, and never write it to a file.

## The rules that matter most

**1. Read the codebase to understand the flow. Do not click through the app.**
You own the source. Routes, templates, and existing E2E tests give you the screen
list, the copy, and the wait points in minutes. Driving the UI with computer use
to discover what the app does has cost 40+ minutes and a fortune in tokens on
this pipeline — it is the wrong tool for discovery.

Then run **one** scripted verification pass to confirm the code matches reality:

```bash
node scripts/capture-flow.mjs --base-url <url> --routes /,/a,/b --out .flow-check
```

Look at those images once, checking for contradictions against your screen list.
The exception is rasterized content — text baked into images, canvas, video, or
an embedded PDF. There the DOM has no words and the pixels are the only source
of truth, so read the screenshots carefully before narrating. Most screens are
not this.

**2. Never render against production.** A render is hundreds of requests plus a
seeded database. Check what `baseURL` and the app's `DATABASE_URL` actually point
at before starting anything. If the only available database is production, stop
and ask the user.

**3. Demo mode is presentation-only.** It may disable animations, freeze the
clock, hide chrome, seed randomness. It may never change what the app computes.
Otherwise the tutorials teach an app that does not exist.

**4. Prove the app is unchanged without the flag.** Inject demo CSS/JS lazily.
Normal users must download zero extra bytes. Diff the served output; don't assert it.

**5. `overflowMs` must be zero.** Non-zero means narration outran the recording
and argo froze the final frame. Fix scene pacing with
`narration.durationFor(scene)` — do not ship it.

## Producing a video

```bash
# 1. Scaffold from templates
cp templates/flow.demo.ts     vendor/argo/demos/<flow>.demo.ts
cp templates/flow.scenes.json vendor/argo/demos/<flow>.scenes.json
cp templates/flow.config.mjs  vendor/argo/demos/<flow>.config.mjs

# 2. Render
cd vendor/argo
npx argo pipeline <flow> --config demos/<flow>.config.mjs

# 3. Archive (from the package root)
node scripts/collect-render.mjs \
  --demo <flow> --app <app-slug> --flow <flow-slug> \
  --lang en --app-repo "<path to the app repo>" [--publish]
```

Every generated artifact belongs in `renders/`. Never leave output loose in
`vendor/argo/videos/` — that path is overwritten on the next run and its
filename records nothing about which app, flow, viewport, language, or commit it
came from.

## Reviewing output

Look at `contact-sheet.png` before watching the video — it shows the whole render
as one image and catches layout defects in seconds. Then read `render.json` for
provenance and `overflowMs`.

If you are asked whether a video is good, **say whether you actually watched it**.
Judging sampled frames is not the same as watching, and the difference matters.

## Adding another TTS provider

Implement `TTSEngine` from `vendor/argo/src/tts/engine.ts`:

```ts
generate(text: string, options: TTSEngineOptions): Promise<Buffer>  // WAV out
describe?(): TTSEngineMetadata                                      // provenance
```

Return any audio format and pass it through `convertToWav()` — argo needs mono
Float32 24 kHz. Register it in `src/tts/engines/index.ts`. Use
`src/tts/engines/minimax.ts` as the reference; it needs no npm dependency.

## When something fails

Check `docs/KNOWN-ISSUES.md` first. Argo swallows subprocess errors into empty
strings, so an empty error message usually means a spawn failure, not a silent
success.
