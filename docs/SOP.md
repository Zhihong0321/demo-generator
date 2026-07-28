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

## Phase 1 — Understand the flow *before* scripting it

**This is the phase most likely to be skipped, and skipping it is the single
most expensive mistake in this process.**

Reading the DOM tells you the selectors. It does not tell you what is on the
screen. If you write narration from a description of the markup, you will
confidently narrate content that is not visible, and the mismatch is invisible
to every automated check — the video renders green and says the wrong thing.

For each flow you intend to film:

1. Open the app and walk the flow by hand, as a user.
2. Screenshot every screen in the flow.
3. Write the narration **against those screenshots**, not against the source.
4. Note every point where the UI waits on something — those become readiness
   checkpoints, not `waitForTimeout` guesses.

**Gate:** a numbered list of screens, each with a screenshot and a sentence of
narration, reviewed by someone who knows what the app actually does.

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
