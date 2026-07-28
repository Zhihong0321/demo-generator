import { test } from '@argo-video/cli';
import { showOverlay, cursorHighlight, resetCursor, resetCamera } from '@argo-video/cli';

/**
 * Install smoke test. Renders a short video against the self-contained page in
 * smoke/public — no app, no database, no external fixture. Kept deliberately
 * short so it costs little disk and a few seconds of TTS.
 */
test.use({
  viewport: { width: 390, height: 694 },
  isMobile: true,
  hasTouch: true,
  video: { mode: 'on' as const, size: { width: 390, height: 694 } },
});

async function ready(page: import('@playwright/test').Page, timeoutMs = 15_000) {
  await page.waitForFunction(() => (window as any).__demoReady === true, undefined, { timeout: timeoutMs });
}

test('smoke', async ({ page, narration }) => {
  test.setTimeout(120_000);

  await page.goto('/');
  await ready(page);

  await narration.startRecording(page);
  cursorHighlight(page, { color: '#e8b339', radius: 16 });

  narration.mark('intro');
  await showOverlay(page, 'intro', narration.durationFor('intro'));

  narration.mark('calculate');
  const dur = narration.durationFor('calculate', { leadOutMs: 600 });
  await page.locator('[data-testid="calculate"]').tap();
  await ready(page);
  await page.waitForTimeout(dur);

  resetCamera(page);
  resetCursor(page);
});
