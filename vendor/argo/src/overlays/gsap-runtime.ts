/**
 * Browser-side GSAP runtime: lazy-loads the GSAP UMD bundle into a Playwright
 * page and applies declarative motion tweens to overlay containers.
 *
 * GSAP's source is bundled with Argo via the `gsap` dependency; it is read from
 * `node_modules/gsap/dist/gsap.min.js` once per Node process and injected into
 * each page once via `page.addScriptTag({ content })`.
 */

import type { Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { GsapMotion, GsapTween } from './gsap-motion.js';
import { tweenWallMs } from './gsap-motion.js';

const require = createRequire(import.meta.url);

let gsapSrcCache: string | null = null;

function loadGsapSource(): string {
  if (gsapSrcCache !== null) return gsapSrcCache;
  const gsapPath = require.resolve('gsap/dist/gsap.min.js');
  gsapSrcCache = readFileSync(gsapPath, 'utf8');
  return gsapSrcCache;
}

const injectedPages = new WeakSet<Page>();

/** Ensure `window.gsap` is available on the page. No-op on subsequent calls. */
export async function ensureGsapInjected(page: Page): Promise<void> {
  if (injectedPages.has(page)) return;
  const alreadyPresent = await page
    .evaluate(() => typeof (window as unknown as { gsap?: unknown }).gsap !== 'undefined')
    .catch(() => false);
  if (!alreadyPresent) {
    const src = loadGsapSource();
    await page.addScriptTag({ content: src });
  }
  injectedPages.add(page);
}

export type GsapPhase = 'in' | 'out' | 'loop';

/** Apply a single motion phase to the overlay container identified by `containerId`. */
export async function runGsapMotion(
  page: Page,
  containerId: string,
  motion: GsapMotion,
  phase: GsapPhase,
): Promise<void> {
  const tween = motion[phase];
  // Gate raw at the runtime as well as at `argo validate` — catches inline
  // cues that skip the validator.
  const rawAllowed = process.env.ARGO_ALLOW_RAW_GSAP === '1';
  const raw = phase === 'in' && rawAllowed ? motion.raw ?? null : null;
  if (!tween && !raw) {
    if (phase === 'in' && motion.raw && !rawAllowed) {
      // eslint-disable-next-line no-console
      console.warn('[argo] motion.raw ignored — set `overlays.allowRawGsap: true` to enable.');
    }
    return;
  }

  await ensureGsapInjected(page);

  await page.evaluate(
    ({ containerId, tween, raw, phase }) => {
      type GsapApi = {
        from: (t: unknown, v: Record<string, unknown>) => unknown;
        to: (t: unknown, v: Record<string, unknown>) => unknown;
        fromTo: (t: unknown, f: Record<string, unknown>, v: Record<string, unknown>) => unknown;
        killTweensOf: (t: unknown) => void;
      };
      const gsap = (window as unknown as { gsap?: GsapApi }).gsap;
      if (!gsap) return;
      const root = document.getElementById(containerId);
      if (!root) return;

      if (phase === 'out') {
        // Exit tween should not fight a running loop.
        gsap.killTweensOf(root);
        gsap.killTweensOf(root.querySelectorAll('*'));
      }

      if (phase === 'in' && raw) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          const fn = new Function('gsap', 'root', raw);
          fn(gsap, root);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[argo] gsap raw motion failed:', err);
        }
        return;
      }

      if (!tween) return;

      const targets: ArrayLike<Element> = tween.target
        ? root.querySelectorAll(tween.target)
        : [root];
      if ((targets as { length: number }).length === 0) return;

      const common: Record<string, unknown> = {
        duration: tween.duration ?? 0.4,
        ease: tween.ease ?? 'power2.out',
      };
      if (tween.delay !== undefined) common.delay = tween.delay;
      if (tween.stagger !== undefined) common.stagger = tween.stagger;
      if (tween.repeat !== undefined) common.repeat = tween.repeat;
      if (tween.yoyo !== undefined) common.yoyo = tween.yoyo;

      if (tween.fromTo) {
        gsap.fromTo(targets, { ...tween.fromTo.from }, { ...tween.fromTo.to, ...common });
      } else if (tween.from) {
        gsap.from(targets, { ...tween.from, ...common });
      } else if (tween.to) {
        gsap.to(targets, { ...tween.to, ...common });
      }
    },
    { containerId, tween: tween ?? null, raw, phase },
  );
}

/** Fire entrance + loop (if any). Does NOT wait for the entrance to finish. */
export async function runGsapEntrance(
  page: Page,
  containerId: string,
  motion: GsapMotion,
): Promise<void> {
  await runGsapMotion(page, containerId, motion, 'in');
  if (motion.loop) {
    await runGsapMotion(page, containerId, motion, 'loop');
  }
}

/** Fire exit tween and wait its wall duration before returning. No-op if no `out`. */
export async function runGsapExit(
  page: Page,
  containerId: string,
  motion: GsapMotion,
): Promise<void> {
  if (!motion.out) return;
  await runGsapMotion(page, containerId, motion, 'out');
  await page.waitForTimeout(tweenWallMs(motion.out));
}

/** Estimate how many ms the exit animation will occupy on the wall clock. */
export function gsapExitWallMs(motion: GsapMotion): number {
  return tweenWallMs(motion.out);
}
