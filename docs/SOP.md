# SOP — turning a repo into a demo-video factory

The order matters. Each phase has a **gate**: do not start the next phase until
the gate passes. The gates exist because every one of them corresponds to a way
this went wrong the first time.

---

## Phase 0 — Vertical slice, zero app changes

**Goal:** find out whether the toolchain works and whether the output is good
*before* touching the app.

1. Run `node scripts/setup.mjs` (see [README](../README.md)).
2. Point a demo at something already renderable — a static export, a public
   page, a running staging instance. Do **not** modify the app yet.
3. Render one video. Watch it.

**Gate:** you have watched a video end to end and judged the quality acceptable.

Do not skip to Phase 2 because the pipeline "obviously works". If the output
quality is unacceptable, no amount of app instrumentation fixes it, and you will
have modified three repos for nothing.

---

## Phase 1 — Understand the flow: read the code, then verify with one screenshot pass

**Read the codebase. It is the map.** Routes, templates, view handlers, and the
nav/menu definition tell you what screens exist, what they contain, what they
call, and what they wait on — in minutes, completely, and cheaply.

> **Do not explore the app by clicking through it.** Computer use, manual
> clicking, and "walk the flow as a user" are not discovery tools here. You own
> the source. An agent that drives the UI to find out what the app does burns
> 40+ minutes and a fortune in tokens to learn less than `grep` gives you in
> thirty seconds. This is a real incident, not a hypothetical.

### 1. Read the source (the bulk of the work)

- The route table, router config, or `sendFile`/render call sites → the screen list.
- The template or component for each screen → headings, labels, fields, buttons,
  and the copy that is actually rendered.
- The data calls each screen makes → where the UI waits, which become readiness
  checkpoints rather than `waitForTimeout` guesses.
- Existing E2E tests → a working, maintained description of the flow. Read these
  first if they exist; they are the cheapest source of all.

Write the screen list and the narration from this.

### 2. Verify with one scripted screenshot pass

Code tells you what *should* render. Confirm what *does*:

```bash
node scripts/capture-flow.mjs --base-url http://localhost:3000 \
  --routes /,/customers,/invoice/new --out .flow-check
```

Scripted, headless, seconds. Then look at the images once and reconcile them
against your screen list. You are checking for **contradictions** — a heading
that differs, an empty state where you expected data, a screen that redirects —
not re-deriving the flow you already have.

### 3. The one case where code is not enough

If a screen's content is **rasterized** — text baked into images, canvas, video,
or an embedded PDF — the DOM has no words in it and the source cannot tell you
what is on screen. Then, and only then, the pixels are the source of truth and
you must read the screenshots carefully before narrating.

This is the exception. Most app screens are not this.

**Gate:** a numbered list of screens, each with a line of narration derived from
the source and confirmed against its screenshot. No contradictions outstanding.

---

## Phase 2 — Implement the App Contract

Five things the app must provide. See [APP-CONTRACT.md](APP-CONTRACT.md) for the
full specification and per-stack implementation notes.

1. Demo flag
2. Readiness signal
3. Stable selectors
4. Seeded state
5. Feature manifest

Implement them **behind the flag**, lazily injected, so a normal user downloads
zero extra bytes and executes zero extra code.

**Gate:** with the flag absent, the app is byte-identical to before. Prove it —
don't assert it. Diff the served HTML and the network waterfall.

---

## Phase 3 — Script and render

1. Copy `templates/flow.*` into `demos/` and rename to your flow.
2. Write scenes from the Phase 1 narration list.
3. Render, then **collect**:
   ```bash
   node scripts/collect-render.mjs --demo <demo> --app <app> --flow <flow> --app-repo <path>
   ```
4. Review the contact sheet before watching the video — it is faster and catches
   layout defects immediately.

**Gate:** `render.json` reports `overflowMs: 0`. Non-zero means narration outran
the recording and the final frame is frozen — fix the scene pacing, don't ship it.

---

## Phase 4 — Scale to the rest of the flows

Only now generate flows in bulk. Add `data-testid` attributes per flow as you
script it, not all at once up front.

**Gate:** a flow you did not hand-tune renders acceptably on the first try. If it
doesn't, the contract is incomplete — fix the contract, not the flow.

---

## Phase 5 — Port to the next repo

The second repo is the real test. The first repo cannot tell you whether you
built a portable pipeline or just configured one app.

Expect the App Contract to change here. That is the point of doing it. Update
[APP-CONTRACT.md](APP-CONTRACT.md) when it does.

**Gate:** repo #3 needs no contract changes.

---

## Ongoing — keeping videos honest

Videos rot silently. The UI changes and the narration keeps confidently
describing the old screen.

- Every render records the app's git SHA in its run id (`app-<sha>`).
- On deploy, compare `renders/<app>/<flow>/latest.json` against `HEAD`.
- Re-render anything whose SHA has drifted, and re-watch it.

A stale video is worse than no video — it teaches users something false.
