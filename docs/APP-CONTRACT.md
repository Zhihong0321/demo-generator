# The App Contract

The pipeline never talks to your app directly. It talks to these five things.
Implement them however your stack allows — the pipeline does not care whether
you are Express with server-rendered HTML, a React SPA, or something else.

**This boundary is the portable part.** Everything else is per-repo detail.

---

## 1. Demo flag

A way to put the app into demo mode.

**Requirement:** demo mode changes *presentation only*, never behaviour or data
logic. If demo mode alters what the app computes, your tutorials teach an app
that does not exist.

What it should do:

- Disable all CSS animations and transitions — including infinite ones
  (spinners, pulses, shimmer). Infinite animations never settle, so any
  "wait until quiet" heuristic hangs or captures mid-spin forever.
- Hide cookie banners, toasts, chat widgets, notification badges, promo popovers.
- Freeze the clock to a fixed timestamp, so relative dates ("3 days ago") don't
  drift as the video ages.
- Force images eager, disable skeleton shimmer.
- Disable analytics, so hundreds of render runs don't pollute your metrics.
- Fix any RNG seed.

**Cost control:** inject the demo CSS/JS *lazily*, only when the flag is present.
Normal users must download zero extra bytes. Most apps already have a lazy asset
injection point — find it and reuse it.

**Safety:** gate it server-side or behind a non-guessable token. If a plain
`?demo=1` leaks, a real user gets a frozen clock and no animations.

Starting point: `templates/app-contract/demo-mode.css` and `demo-mode.js`.

---

## 2. Readiness signal

`window.__demoReady` — truthy when the current screen has genuinely settled.

This is the highest-value item on the list. It converts every timing guess in
the pipeline into an explicit contract. Without it you write
`waitForTimeout(2000)` everywhere and roughly one render in ten is silently
broken.

"Settled" means all of:

- no in-flight data requests
- fonts loaded (`document.fonts.ready`)
- images decoded
- no pending suspense / loading state

**Implementation shortcut:** if your app fetches data from many components, do
not edit them all. Wrap `window.fetch` once at your app's entry point and count
in-flight requests. One file, zero component edits.

Do **not** ship the fetch wrapper unconditionally — gate it on the demo flag.
A permanent global monkey-patch in production is a debugging liability.

---

## 3. Stable selectors

`data-testid` on every element a demo interacts with.

Hand-written CSS selectors rot. At any real volume of videos, selector rot is
the number one maintenance cost.

**Do not instrument the whole app up front.** Add attributes per flow, as you
script that flow. Instrumenting 45 screens before writing a single video is
wasted work; most screens will never be filmed.

Check what already exists — many apps have a navigation shell or design system
with stable data attributes already. Reuse those before adding new ones.

---

## 4. Seeded state

A deterministic, attractive dataset, plus a way to authenticate into it.

Empty states make terrible tutorials. Real customer data cannot be filmed.

- A guarded seed endpoint or fixture loader that produces the same data every run.
- **Hard-gate it**: env var *plus* auth *plus* an explicit non-production check.
  An endpoint that writes data and is reachable in production is the single most
  dangerous thing in this whole design.
- For auth, cookie/token-based sessions let Playwright `storageState` log in once
  and reuse it across every render. Usually zero extra work.

**Never render against production.** Point the pipeline at staging or local.

---

## 5. Feature manifest

A machine-readable list of what can be demoed.

This is what makes "a lot of videos" tractable — the scene generator reads a
list instead of crawling and guessing.

Anything works as long as it is machine-readable:

- a router config or route table
- a nav/menu definition
- a hand-maintained `flows.json`

**Check before you build one.** Apps frequently already have this — a nav shell
route array, a sitemap generator, a permissions map. On the first repo this was
implemented, the manifest already existed inside the navigation script and was
initially missed.

Fields worth having per entry: a stable key, a path, a human title, and whether
the screen requires auth.

---

## Checklist for a new repo

```
[ ] 1. Demo flag         — lazily injected, presentation-only, safely gated
[ ] 2. __demoReady       — gated, covers requests + fonts + images
[ ] 3. data-testid       — on the flows you are filming, not everywhere
[ ] 4. Seed + auth       — deterministic, hard-gated, never production
[ ] 5. Feature manifest  — found or built, machine-readable
[ ] Proof: with the flag absent, the app is unchanged
```
