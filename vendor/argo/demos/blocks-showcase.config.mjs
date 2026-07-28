import { defineConfig } from '@argo-video/cli';

export default defineConfig({
  baseURL: 'http://127.0.0.1',
  demosDir: 'demos',
  outputDir: 'videos',
  tts: { defaultVoice: 'af_heart', defaultSpeed: 1.0 },
  video: {
    width: 1920,
    height: 1080,
    fps: 30,
    browser: 'chromium',
  },
  export: {
    preset: 'slow',
    crf: 23,
    frame: {
      padding: 48,
      borderRadius: 16,
      shadow: 0.32,
      background: { type: 'gradient', value: 'linear-gradient(135deg, #1a1a2e, #16213e)' },
    },
  },
  overlays: {
    autoBackground: true,
  },
});
