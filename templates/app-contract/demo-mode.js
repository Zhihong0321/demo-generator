/*
 * App Contract #1 + #2 — demo flag behaviour and the readiness signal.
 *
 * Load this file LAZILY, only when the demo flag is present. It monkey-patches
 * globals; shipping it to every user is a debugging liability, not just wasted
 * bytes. Most apps already have a lazy asset injection point — reuse it:
 *
 *   if (isDemoMode()) {
 *     injectStylesheet('/css/demo-mode.css');
 *     injectScript('/js/demo-mode.js');
 *   }
 *
 * Presentation only. Nothing here may change what the app computes.
 */
(() => {
  'use strict';

  // A fixed instant, so relative dates ("3 days ago") never drift as videos age.
  // Override per-app if your seeded data expects a different reference point.
  const FROZEN_NOW = Date.parse('2026-01-15T09:30:00Z');

  // How long the page must be free of in-flight requests before it counts as
  // settled. Long enough to bridge a render that chains one fetch after another.
  const QUIET_MS = 350;

  // ---- 1. Freeze the clock ------------------------------------------------
  // Only Date.now() and `new Date()` with no arguments are frozen. Explicit
  // dates, arithmetic, and formatting all behave normally, so app logic that
  // parses or compares timestamps is untouched.
  const RealDate = Date;
  const frozen = new RealDate(FROZEN_NOW);

  function FrozenDate(...args) {
    if (!(this instanceof FrozenDate)) return frozen.toString();
    return args.length === 0 ? new RealDate(FROZEN_NOW) : new RealDate(...args);
  }
  FrozenDate.prototype = RealDate.prototype;
  FrozenDate.now = () => FROZEN_NOW;
  FrozenDate.parse = RealDate.parse;
  FrozenDate.UTC = RealDate.UTC;
  window.Date = FrozenDate;

  // ---- 2. Readiness signal ------------------------------------------------
  // Counting in-flight requests at the transport layer means you instrument
  // ONE file instead of every component that loads data.
  let inFlight = 0;
  let quietTimer = null;
  let fontsReady = false;

  window.__demoReady = false;

  function recompute() {
    clearTimeout(quietTimer);
    if (inFlight > 0 || !fontsReady) {
      window.__demoReady = false;
      return;
    }
    quietTimer = setTimeout(async () => {
      if (inFlight > 0 || !fontsReady) return;
      // Images must be decoded, not merely fetched, or the first frame of a
      // scene can capture a blank box where a photo belongs.
      try {
        await Promise.all(
          Array.from(document.images)
            .filter((img) => !img.complete)
            .map((img) => img.decode().catch(() => {})),
        );
      } catch { /* a broken image must not wedge the signal */ }
      if (inFlight === 0 && fontsReady) {
        window.__demoReady = true;
        window.dispatchEvent(new CustomEvent('demo:ready'));
      }
    }, QUIET_MS);
  }

  function track(promise) {
    inFlight++;
    recompute();
    const done = () => { inFlight = Math.max(0, inFlight - 1); recompute(); };
    promise.then(done, done);
    return promise;
  }

  const realFetch = window.fetch;
  window.fetch = function demoFetch(...args) {
    return track(realFetch.apply(this, args));
  };

  // XHR too — older code paths and some libraries never migrated to fetch.
  const realOpen = XMLHttpRequest.prototype.open;
  const realSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (...args) {
    this.__demoTracked = true;
    return realOpen.apply(this, args);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__demoTracked) {
      inFlight++;
      recompute();
      const done = () => { inFlight = Math.max(0, inFlight - 1); recompute(); };
      this.addEventListener('loadend', done, { once: true });
    }
    return realSend.apply(this, args);
  };

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => { fontsReady = true; recompute(); });
  } else {
    fontsReady = true;
  }

  // Route changes in a single-page app invalidate readiness.
  for (const method of ['pushState', 'replaceState']) {
    const real = history[method];
    history[method] = function (...args) {
      window.__demoReady = false;
      const result = real.apply(this, args);
      recompute();
      return result;
    };
  }
  window.addEventListener('popstate', () => { window.__demoReady = false; recompute(); });

  recompute();

  // ---- 3. Deterministic randomness ---------------------------------------
  // mulberry32 — small, fast, and stable across runs so repeat renders match.
  let seed = 0x9e3779b9;
  Math.random = function seededRandom() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ---- 4. Silence analytics ----------------------------------------------
  // Hundreds of render runs must not land in your product metrics.
  window.dataLayer = { push() {} };
  window.gtag = function () {};
  window.ga = function () {};
  if (window.analytics) window.analytics = { track() {}, page() {}, identify() {} };

  document.documentElement.setAttribute('data-demo-mode', 'on');
})();
