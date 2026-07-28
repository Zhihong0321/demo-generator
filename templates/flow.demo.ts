/**
 * TEMPLATE — copy to vendor/argo/demos/<flow>.demo.ts and rename the test.
 *
 * Prerequisite: you have completed SOP Phase 1. You have walked this flow by
 * hand, screenshotted every screen, and written the narration against those
 * screenshots. If you have not, stop and do that first — narration written from
 * source code confidently describes screens that are not on display, and no
 * automated check catches it.
 */
import { test } from '@argo-video/cli';
import {
  showOverlay,
  cursorHighlight,
  resetCursor,
  resetCamera,
} from '@argo-video/cli';

// Must match video.width / video.height in the matching .config.mjs, or the
// capture canvas ends up larger than the page and you get grey padding.
test.use({
  viewport: { width: 390, height: 694 },
  isMobile: true,
  hasTouch: true,
  video: { mode: 'on' as const, size: { width: 390, height: 694 } },
});

/**
 * Wait for the app's readiness signal (App Contract #2) instead of guessing.
 * Falls back to `networkidle` so this still runs against an app that has not
 * implemented the contract yet — but that fallback is the thing you replace.
 */
async function ready(page: import('@playwright/test').Page, timeoutMs = 15_000) {
  const hasSignal = await page.evaluate(() => '__demoReady' in window);
  if (hasSignal) {
    await page.waitForFunction(() => (window as any).__demoReady === true, undefined, { timeout: timeoutMs });
  } else {
    await page.waitForLoadState('networkidle');
  }
}

test('<flow>', async ({ page, narration }) => {
  test.setTimeout(180_000);

  await page.goto('/');
  await ready(page);

  // REQUIRED in jpeg-stitch mode. Omitting this produces a run where every
  // scene reports success and then no video exists. argo's own mobile.demo.ts
  // is stale and omits it — do not copy that file.
  await narration.startRecording(page);

  cursorHighlight(page, { color: '#E8B339', radius: 16 });

  // ---- Scene 1 ----------------------------------------------------------
  // showOverlay needs a matching `overlay` block in <flow>.scenes.json.
  narration.mark('intro');
  await showOverlay(page, 'intro', narration.durationFor('intro'));

  // ---- Scene 2 ----------------------------------------------------------
  // Narration-first pacing: ask for the clip's real duration and hold the UI
  // for exactly that long. Never hardcode a wait and hope it matches.
  narration.mark('step-one');
  const stepOne = narration.durationFor('step-one');

  await page.locator('[data-testid="REPLACE-ME"]').click();
  await ready(page);
  await page.waitForTimeout(stepOne);

  // ---- Final scene ------------------------------------------------------
  // leadOutMs gives the last frame room to breathe after the voice stops.
  narration.mark('outro');
  resetCamera(page);
  resetCursor(page);
  await showOverlay(page, 'outro', narration.durationFor('outro', { leadOutMs: 800 }));
});
