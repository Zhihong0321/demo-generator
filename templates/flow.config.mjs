import { defineConfig, engines } from '@argo-video/cli';

/**
 * TEMPLATE — copy to vendor/argo/demos/<flow>.config.mjs
 *
 * Run:
 *   cd vendor/argo
 *   npx argo pipeline <flow> --config demos/<flow>.config.mjs
 *
 * Requires MINIMAX_API_KEY in the environment.
 */
export default defineConfig({
  // Point at staging or local. NEVER production — a render is hundreds of
  // requests and a seeded database.
  baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',

  demosDir: 'demos',
  outputDir: 'videos',

  tts: {
    defaultVoice: 'English_expressive_narrator',
    defaultSpeed: 1.0,
    engine: engines.minimax({ model: 'speech-02-hd' }),
    // Malay or Chinese narration: set language_boost via the engine, e.g.
    //   engines.minimax({ model: 'speech-02-hd', languageBoost: 'Chinese' })
  },

  video: {
    // Must match test.use({ viewport }) in the .demo.ts exactly.
    width: 390,
    height: 694,
    fps: 30,
    browser: 'chromium',
    captureMode: 'jpeg-stitch',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },

  export: {
    preset: 'medium',
    crf: 18,
    encoder: 'cpu',
    audio: { loudnorm: true },
    // Without these the final video is viewport-sized (390x694), which is soft
    // on desktop. deviceScaleFactor supersamples but downscales back.
    outputWidth: 1080,
    outputHeight: 1920,
  },

  overlays: {
    autoBackground: true,
  },
});
