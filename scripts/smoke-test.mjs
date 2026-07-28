#!/usr/bin/env node
/**
 * smoke-test — prove the whole chain works, with no app and no fixture.
 *
 * Serves smoke/public, renders a short narrated video against it, asserts the
 * output is real, and cleans up after itself. This is the check that turns
 * "setup said OK" into "the pipeline actually produces video".
 *
 *   node scripts/smoke-test.mjs [--keep]
 *
 * Requires MINIMAX_API_KEY. Exits non-zero with a specific reason on failure.
 */

import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.join(import.meta.dirname, '..'));
const ARGO = path.join(ROOT, 'vendor', 'argo');
const PUBLIC = path.join(ROOT, 'smoke', 'public');
const PORT = 8979;
const keep = process.argv.includes('--keep');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };

function fail(message, detail) {
  console.error(`\nSMOKE TEST FAILED\n\n  ${message}\n`);
  if (detail) console.error(`${detail}\n`);
  process.exit(1);
}

if (!process.env.MINIMAX_API_KEY) {
  fail(
    'MINIMAX_API_KEY is not set.',
    '  Ask the user for their MiniMax API key and export it in this shell.\n' +
    '  Do not go looking for it in credential stores, and do not write it to a file.',
  );
}

if (!existsSync(path.join(ARGO, 'dist', 'record.js'))) {
  fail('vendor/argo is not built. Run: node scripts/setup.mjs');
}

// ---- serve the fixture ---------------------------------------------------

const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = path.join(PUBLIC, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end('forbidden'); return; }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, '127.0.0.1', resolve);
});
console.log(`fixture server  http://127.0.0.1:${PORT}`);

// ---- render --------------------------------------------------------------

// Node resolves `@argo-video/cli` by self-reference, which only works from
// inside the package directory — so the demo files have to run from there.
// smoke/ stays the source of truth; these copies are removed on the way out.
const STAGED = ['smoke.demo.ts', 'smoke.scenes.json', 'smoke.config.mjs'].map((f) => ({
  from: path.join(ROOT, 'smoke', f),
  to: path.join(ARGO, 'demos', f),
}));
for (const { from, to } of STAGED) copyFileSync(from, to);

function unstage() {
  for (const { to } of STAGED) rmSync(to, { force: true });
}

const videoPath = path.join(ARGO, 'videos', 'smoke.mp4');
rmSync(videoPath, { force: true });
rmSync(path.join(ARGO, '.argo', 'smoke'), { recursive: true, force: true });

console.log('rendering       (about a minute — TTS, capture, then encode)\n');

// Must be async: execFileSync blocks this process's event loop, which would
// stop the fixture server above from ever accepting the browser's connection.
// The symptom is a confusing `page.goto: net::ERR_ABORTED` inside Playwright.
let renderFailed = null;
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(ARGO, 'bin', 'argo.js'), 'pipeline', 'smoke', '--config', 'demos/smoke.config.mjs'],
      { cwd: ARGO, stdio: 'inherit', env: { ...process.env, BASE_URL: `http://127.0.0.1:${PORT}` } },
    );
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) renderFailed = new Error(`argo exited with code ${code}`);
} catch (err) {
  renderFailed = err;
} finally {
  server.close();
  unstage();
}

if (renderFailed) {
  fail(
    'The render pipeline exited non-zero.',
    '  An EMPTY error message from argo usually means a subprocess failed to spawn,\n' +
    '  not that it succeeded silently. See docs/KNOWN-ISSUES.md.',
  );
}

// ---- assert the output is real -------------------------------------------

if (!existsSync(videoPath)) {
  fail(
    `No video at ${path.relative(ROOT, videoPath)} despite a zero exit code.`,
    "  If every scene reported success, the demo probably never called\n" +
    "  `await narration.startRecording(page)`. See docs/KNOWN-ISSUES.md.",
  );
}

const size = statSync(videoPath).size;
if (size < 20_000) fail(`Video is only ${size} bytes — that is not a real render.`);

let probe;
try {
  probe = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height',
    '-of', 'json', videoPath,
  ], { encoding: 'utf8' });
} catch {
  fail('ffprobe could not read the output video.');
}

const info = JSON.parse(probe);
const duration = Number(info.format?.duration ?? 0);
const hasVideo = info.streams?.some((s) => s.codec_type === 'video');
const hasAudio = info.streams?.some((s) => s.codec_type === 'audio');

if (!hasVideo) fail('Output has no video stream.');
if (!hasAudio) fail('Output has no audio stream — TTS did not make it into the file.');
if (duration < 4) fail(`Output is only ${duration.toFixed(1)}s — expected roughly 10s or more.`);

const v = info.streams.find((s) => s.codec_type === 'video');

console.log('\n' + '─'.repeat(64));
console.log('SMOKE TEST PASSED\n');
console.log(`  video     ${v.codec_name} ${v.width}x${v.height}`);
console.log(`  audio     ${info.streams.find((s) => s.codec_type === 'audio').codec_name}`);
console.log(`  duration  ${duration.toFixed(1)}s`);
console.log(`  size      ${(size / 1024 / 1024).toFixed(2)} MB`);

if (keep) {
  console.log(`\n  kept at   ${path.relative(ROOT, videoPath)}`);
} else {
  rmSync(videoPath, { force: true });
  rmSync(path.join(ARGO, 'videos', 'smoke.meta.json'), { force: true });
  rmSync(path.join(ARGO, 'videos', 'smoke.srt'), { force: true });
  rmSync(path.join(ARGO, 'videos', 'smoke.vtt'), { force: true });
  rmSync(path.join(ARGO, '.argo', 'smoke'), { recursive: true, force: true });
  console.log('\n  cleaned up (pass --keep to inspect the video)');
}

console.log('\nThe pipeline works. Next: docs/SOP.md, Phase 0.\n');
