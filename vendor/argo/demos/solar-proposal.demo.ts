import { test } from '@argo-video/cli';
import {
  showOverlay,
  spotlight,
  cursorHighlight,
  resetCursor,
  resetCamera,
} from '@argo-video/cli';

// Mobile portrait, matching video.width/height in solar-proposal.config.mjs.
test.use({
  viewport: { width: 390, height: 694 },
  isMobile: true,
  hasTouch: true,
  video: { mode: 'on' as const, size: { width: 390, height: 694 } },
});

/** Advance the scroll-snap deck by one slide and let the snap settle. */
async function nextSlide(page: import('@playwright/test').Page, settleMs = 450) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(settleMs);
}

test('solar-proposal', async ({ page, narration }) => {
  test.setTimeout(180_000);

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // The deck's own hint chip fades itself out after 2.8s; wait it out so it
  // never appears mid-scene.
  await page.waitForTimeout(3200);

  await narration.startRecording(page);

  cursorHighlight(page, { color: '#E8B339', radius: 16 });

  // Scene 1 — intro on slide 1
  narration.mark('intro');
  await showOverlay(page, 'intro', narration.durationFor('intro'));

  // Scene 2 — browse: walk slides 2..8 paced to the narration
  narration.mark('browse');
  const browseDur = narration.durationFor('browse');
  const browseSteps = 7;
  const browseStep = Math.floor(browseDur / browseSteps);

  for (let i = 0; i < browseSteps; i++) {
    await nextSlide(page);
    await page.waitForTimeout(Math.max(0, browseStep - 450));
  }

  // Scene 3 — panels: land on slide 14, the 550W panel spec
  narration.mark('panels');
  const panelsDur = narration.durationFor('panels');
  await page.locator('section.slide[data-slide="14"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  spotlight(page, 'section.slide[data-slide="14"] svg.text-overlay', {
    duration: Math.floor(panelsDur * 0.6),
  });
  await page.waitForTimeout(Math.max(0, panelsDur - 600));

  // Scene 4 — scope of works, slide 23
  narration.mark('scope');
  const scopeDur = narration.durationFor('scope');
  resetCamera(page);
  await page.locator('section.slide[data-slide="23"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  spotlight(page, 'section.slide[data-slide="23"] svg.text-overlay', {
    duration: Math.floor(scopeDur * 0.6),
  });
  await page.waitForTimeout(Math.max(0, scopeDur - 600));

  // Scene 5 — guarantee, slide 24
  narration.mark('outro');
  resetCamera(page);
  resetCursor(page);
  await page.locator('section.slide[data-slide="24"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await showOverlay(page, 'outro', narration.durationFor('outro', { leadOutMs: 800 }));
});
