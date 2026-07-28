import { defineConfig } from '@argo-video/cli';
import { engines } from '@argo-video/cli';

// Vertical-slice demo: Eternalgy mobile solar proposal.
//
// Renders against a STATIC fixture copy of the proposal page — no app server,
// no database. Nothing in the Solar Calculator repo is touched.
//
// Run:
//   MINIMAX_API_KEY=... npx argo pipeline solar-proposal --config demos/solar-proposal.config.mjs
export default defineConfig({
  baseURL: process.env.BASE_URL || 'http://127.0.0.1:8977',
  demosDir: 'demos',
  outputDir: 'videos',
  tts: {
    defaultVoice: 'English_expressive_narrator',
    defaultSpeed: 1.0,
    engine: engines.minimax({ model: 'speech-02-hd' }),
  },
  video: {
    // Must match the viewport in the demo, or the capture canvas gets padded.
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
  },
  overlays: {
    autoBackground: true,
  },
});
