import { defineConfig, engines } from '@argo-video/cli';

/**
 * Config for the install smoke test.
 *
 * smoke/ is the source of truth for these three files, but Node can only
 * resolve `@argo-video/cli` from inside the package directory, so
 * scripts/smoke-test.mjs copies them into vendor/argo/demos/ before running
 * and removes them afterwards. Paths here are relative to vendor/argo.
 */
export default defineConfig({
  baseURL: process.env.BASE_URL || 'http://127.0.0.1:8979',
  demosDir: 'demos',
  outputDir: 'videos',
  tts: {
    defaultVoice: 'English_expressive_narrator',
    defaultSpeed: 1.0,
    engine: engines.minimax({ model: 'speech-02-hd' }),
  },
  video: {
    width: 390,
    height: 694,
    fps: 30,
    browser: 'chromium',
    captureMode: 'jpeg-stitch',
    // Kept at 1 on purpose: the smoke test proves the chain works, not that it
    // looks good, and DSF 2 quadruples the intermediate JPEGs on disk.
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  export: {
    preset: 'veryfast',
    crf: 26,
    encoder: 'cpu',
  },
  overlays: { autoBackground: true },
});
